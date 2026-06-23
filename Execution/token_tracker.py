"""
Token usage + cost logger.

Every LLM call in the pipeline should funnel through record_token_usage()
so you have one place to see how many tokens / how much money each file
processed cost. Persists to SQLite (token_usage.db) so you can query/sum
later, and also writes a one-line summary through whatever logger you pass
in (so it shows up in your existing .log files too).

EDIT PRICE_PER_1M_TOKENS to match current OpenRouter pricing for whatever
models you're actually using — these numbers are placeholders, not verified
live rates, and OpenRouter pricing changes over time.

This file also maintains a SECOND table, `pipeline_runs`, which stores one
summary row per pipeline cycle (total calls/tokens/cost/failures for that
run). Use this table when you want a clean, queryable cost history instead
of digging through raw per-call rows in `token_usage`.
"""

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Optional

USAGE_DB = "token_usage.db"

# USD per 1,000,000 tokens. PLACEHOLDERS — verify against OpenRouter's
# current pricing page for each model you actually call and correct these.
PRICE_PER_1M_TOKENS = {
    "openai/gpt-4o-mini":        {"input": 0.15, "output": 0.60},
    "poolside/laguna-m.1:free":  {"input": 0.0,  "output": 0.0},
}
DEFAULT_PRICE = {"input": 0.0, "output": 0.0}


def init_usage_db():
    conn = sqlite3.connect(USAGE_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS token_usage (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp         TEXT NOT NULL,
            layer             TEXT NOT NULL,
            model             TEXT NOT NULL,
            symbol            TEXT,
            context_label     TEXT,
            prompt_tokens     INTEGER,
            completion_tokens INTEGER,
            total_tokens      INTEGER,
            cost_usd          REAL,
            success           INTEGER
        )
    """)
    conn.commit()
    conn.close()


def record_token_usage(
    layer: str,
    model: str,
    symbol: Optional[str],
    context_label: str,
    usage: Optional[dict],
    success: bool,
    log=None,
):
    init_usage_db()

    usage = usage or {}
    prompt_tokens = usage.get("prompt_tokens", 0) or 0
    completion_tokens = usage.get("completion_tokens", 0) or 0
    total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens) or 0

    price = PRICE_PER_1M_TOKENS.get(model, DEFAULT_PRICE)
    cost_usd = (
        (prompt_tokens / 1_000_000) * price["input"]
        + (completion_tokens / 1_000_000) * price["output"]
    )

    conn = sqlite3.connect(USAGE_DB)
    conn.execute(
        """
        INSERT INTO token_usage
        (timestamp, layer, model, symbol, context_label,
         prompt_tokens, completion_tokens, total_tokens, cost_usd, success)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        """,
        (
            datetime.now().isoformat(), layer, model, symbol, context_label,
            prompt_tokens, completion_tokens, total_tokens, cost_usd,
            1 if success else 0,
        ),
    )
    conn.commit()
    conn.close()

    msg = (
        f"[tokens] {context_label} | model={model} | "
        f"in={prompt_tokens} out={completion_tokens} total={total_tokens} | "
        f"cost=${cost_usd:.5f} | success={success}"
    )
    if log:
        log.info(msg)
    else:
        print(msg)


def print_usage_summary(db_path: str = USAGE_DB):
    """Call at the end of a batch run to see ALL-TIME total spend, grouped
    by model. For a single cycle's cost instead, use record_cycle_summary()."""
    if not Path(db_path).exists():
        return

    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        """
        SELECT model,
               COUNT(*)               AS calls,
               SUM(prompt_tokens)     AS in_tokens,
               SUM(completion_tokens) AS out_tokens,
               SUM(cost_usd)          AS cost
        FROM token_usage
        GROUP BY model
        ORDER BY cost DESC
        """
    ).fetchall()
    conn.close()

    if not rows:
        return

    print("\n--- Token usage summary (all-time) ---")
    grand_total = 0.0
    for model, calls, in_tok, out_tok, cost in rows:
        cost = cost or 0.0
        grand_total += cost
        print(f"{model:30s} calls={calls:<5d} in={in_tok:<8d} out={out_tok:<8d} cost=${cost:.4f}")
    print(f"{'TOTAL':30s} cost=${grand_total:.4f}")
    print("----------------------------\n")


# ── Per-cycle cost tracking — queryable cost history ────────────────────────
def init_runs_table(db_path: str = USAGE_DB):
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS pipeline_runs (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            cycle_start       TEXT NOT NULL,
            cycle_end         TEXT NOT NULL,
            total_calls       INTEGER,
            total_in_tokens   INTEGER,
            total_out_tokens  INTEGER,
            total_cost_usd    REAL,
            total_failures    INTEGER
        )
        """
    )
    conn.commit()
    conn.close()


def record_cycle_summary(cycle_start: str, db_path: str = USAGE_DB, log=None):
    """Call this once at the END of each pipeline cycle, passing the
    timestamp captured at the START of that cycle. Sums every token_usage
    row recorded since cycle_start and writes ONE summary row into
    pipeline_runs — your clean, queryable per-cycle cost record.

    Example queries once this is populated:
        SELECT SUM(total_cost_usd) FROM pipeline_runs
            WHERE cycle_start >= '2026-06-23';
        SELECT * FROM pipeline_runs ORDER BY total_failures DESC LIMIT 5;
    """
    init_runs_table(db_path)
    cycle_end = datetime.now().isoformat()

    conn = sqlite3.connect(db_path)
    row = conn.execute(
        """
        SELECT COUNT(*),
               SUM(prompt_tokens),
               SUM(completion_tokens),
               SUM(cost_usd),
               SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END)
        FROM token_usage
        WHERE timestamp >= ?
        """,
        (cycle_start,)
    ).fetchone()

    calls, in_tok, out_tok, cost, failures = row
    calls = calls or 0
    in_tok = in_tok or 0
    out_tok = out_tok or 0
    cost = cost or 0.0
    failures = failures or 0

    conn.execute(
        """
        INSERT INTO pipeline_runs
        (cycle_start, cycle_end, total_calls, total_in_tokens, total_out_tokens, total_cost_usd, total_failures)
        VALUES (?,?,?,?,?,?,?)
        """,
        (cycle_start, cycle_end, calls, in_tok, out_tok, cost, failures)
    )
    conn.commit()
    conn.close()

    msg = (
        f"[cycle summary] calls={calls} in={in_tok} out={out_tok} "
        f"cost=${cost:.5f} failures={failures}"
    )
    if log:
        log.info(msg)
    else:
        print(msg)