import json
import os
import sqlite3
import asyncio
import math
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import List, Dict, Any, AsyncGenerator, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

import yfinance as yf
import pandas as pd

app = FastAPI()

# Allow CORS from the React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths to data files (relative to repo root)
ROOT = Path(__file__).parent
PIPELINE_LOG = ROOT / "pipeline.log"
TOKEN_USAGE_DB = ROOT / "token_usage.db"
ANNOUNCEMENTS_DB = ROOT / "nse_announcements.db"
PARSED_DB = ROOT / "parsed_files.db"
PROCESSED_DB = ROOT / "processed_files.db"
NEWS_OUTPUT_DIR = ROOT / "news_output"

def _json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, bool)):
        return value
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if hasattr(value, "item"):
        try:
            return _json_safe(value.item())
        except Exception:
            return str(value)
    return str(value)

def _df_to_table(df: Optional[pd.DataFrame]) -> Dict[str, Any]:
    if df is None or getattr(df, "empty", True):
        return {"columns": [], "index": [], "data": []}
    clean = df.copy()
    clean.columns = [str(c) for c in clean.columns]
    clean.index = [str(i) for i in clean.index]
    data: list[list[Any]] = []
    for row in clean.itertuples(index=False, name=None):
        data.append([_json_safe(v) for v in row])
    return {"columns": clean.columns.tolist(), "index": clean.index.tolist(), "data": data}

def _to_yahoo_ticker(symbol: str, exchange: str) -> str:
    s = (symbol or "").strip().upper()
    if not s:
        raise ValueError("symbol is required")
    if "." in s:
        return s
    ex = (exchange or "NS").strip().upper()
    suffix = ".NS" if ex in {"NS", "NSE"} else ".BO"
    return f"{s}{suffix}"

def _fetch_fundamentals(symbol: str, exchange: str, include_quarterly: bool) -> Dict[str, Any]:
    yahoo_ticker = _to_yahoo_ticker(symbol, exchange)
    t = yf.Ticker(yahoo_ticker)

    info = t.info or {}
    keys = [
        "shortName",
        "longName",
        "symbol",
        "exchange",
        "currency",
        "sector",
        "industry",
        "website",
        "marketCap",
        "enterpriseValue",
        "currentPrice",
        "trailingPE",
        "forwardPE",
        "priceToBook",
        "bookValue",
        "profitMargins",
        "operatingMargins",
        "returnOnAssets",
        "returnOnEquity",
        "debtToEquity",
        "dividendYield",
        "trailingEps",
        "sharesOutstanding",
        "floatShares",
        "fiftyTwoWeekLow",
        "fiftyTwoWeekHigh",
    ]
    picked_info = {k: _json_safe(info.get(k)) for k in keys if k in info}

    payload: Dict[str, Any] = {
        "symbol": symbol.strip().upper(),
        "exchange": exchange.strip().upper() if exchange else "NS",
        "yahoo_ticker": yahoo_ticker,
        "fetched_at": datetime.now().isoformat(),
        "info": picked_info,
        "tables": {
            "financials": _df_to_table(getattr(t, "financials", None)),
            "balance_sheet": _df_to_table(getattr(t, "balance_sheet", None)),
            "cashflow": _df_to_table(getattr(t, "cashflow", None)),
        },
    }

    if include_quarterly:
        payload["tables"].update({
            "quarterly_financials": _df_to_table(getattr(t, "quarterly_financials", None)),
            "quarterly_balance_sheet": _df_to_table(getattr(t, "quarterly_balance_sheet", None)),
            "quarterly_cashflow": _df_to_table(getattr(t, "quarterly_cashflow", None)),
        })

    return payload

def _read_last_lines(file_path: Path, num_lines: int = 50) -> List[str]:
    """Return the last *num_lines* lines from *file_path*.
    Reads the whole file (fast enough for the small log) and slices.
    """
    if not file_path.exists():
        return []
    with file_path.open("r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()
    return [line.rstrip("\n") for line in lines[-num_lines:]]

def _determine_current_stage(log_lines: List[str]) -> str:
    current_stage = "unknown"
    stage_line = None
    for line in reversed(log_lines):
        if "--- Running stage" in line:
            stage_line = line
            break
    if stage_line:
        parts = stage_line.split("--- Running stage")[-1].strip().split(":", 1)
        if len(parts) == 2:
            stage_name = parts[1].strip()
        else:
            stage_name = parts[0].strip()
        completed = any("completed successfully" in l.lower() for l in log_lines[log_lines.index(stage_line) + 1:])
        if completed:
            current_stage = "unknown"
        else:
            if "sleep" in stage_name.lower():
                current_stage = "sleeping"
            else:
                current_stage = stage_name.lower()
    return current_stage

def _fetch_latest_pipeline_run() -> Dict[str, Any]:
    if not TOKEN_USAGE_DB.exists():
        return {}
    conn = sqlite3.connect(TOKEN_USAGE_DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    try:
        cur.execute("SELECT * FROM pipeline_runs ORDER BY cycle_start DESC LIMIT 1")
        row = cur.fetchone()
    except sqlite3.OperationalError:
        conn.close()
        return {}
    conn.close()
    if row:
        return dict(row)
    return {}

@app.get("/api/status")
async def get_status():
    log_lines = _read_last_lines(PIPELINE_LOG, 50)
    current_stage = _determine_current_stage(log_lines)
    latest_run = _fetch_latest_pipeline_run()
    if not latest_run:
        raise HTTPException(status_code=404, detail="No pipeline run data found")
    return {
        "current_stage": current_stage,
        "last_cycle_end": latest_run.get("cycle_end"),
        "last_cycle_cost_usd": float(latest_run.get("cost_usd", 0)),
        "last_cycle_calls": int(latest_run.get("calls", 0)),
        "last_cycle_failures": int(latest_run.get("failures", 0)),
    }

@app.get("/api/alerts")
async def get_alerts(limit: int = 30):
    """Flattened, material-only alert list — kept for any other panel that wants
    a lightweight summary. The live wire feed uses /api/stream instead, since
    that preserves every field (page_number, verbatim_source_quote, etc.)."""
    alerts = []
    if not NEWS_OUTPUT_DIR.exists():
        return {"alerts": []}
    for symbol_dir in NEWS_OUTPUT_DIR.iterdir():
        if not symbol_dir.is_dir():
            continue
        for json_file in symbol_dir.glob("*_news.json"):
            try:
                data = json.loads(json_file.read_text())
            except Exception:
                continue
            if not data.get("has_material_development"):
                continue
            mtime = json_file.stat().st_mtime
            facts = data.get("facts") or []
            for fact in facts:
                alerts.append({
                    "symbol": symbol_dir.name,
                    "alert_message": fact.get("alert_message"),
                    "event_category": fact.get("event_category"),
                    "filing_date": fact.get("filing_date") or data.get("filing_date"),
                    "has_material_development": True,
                    "_mtime": mtime,  # used for sorting below, not returned to the client
                })
    # Sort by the file's own modification time, not a reconstructed path.
    alerts.sort(key=lambda a: a["_mtime"], reverse=True)
    for a in alerts:
        a.pop("_mtime", None)
    return {"alerts": alerts[:limit]}

def _count_rows(db_path: Path, table: str, date_column: str) -> int:
    if not db_path.exists():
        return 0
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    today_str = date.today().isoformat()
    query = f"SELECT COUNT(*) FROM {table} WHERE {date_column} LIKE ?"
    cur.execute(query, (today_str + "%",))
    count = cur.fetchone()[0]
    conn.close()
    return count

@app.get("/api/today_summary")
async def today_summary():
    announcements = _count_rows(ANNOUNCEMENTS_DB, "announcements", "seen_at")
    files_downloaded = _count_rows(ANNOUNCEMENTS_DB, "downloads", "downloaded_at")
    files_parsed = _count_rows(PARSED_DB, "parsed_files", "parsed_at")
    files_processed = _count_rows(PROCESSED_DB, "processed_files", "processed_at")
    material_alerts_today = 0
    if NEWS_OUTPUT_DIR.exists():
        for symbol_dir in NEWS_OUTPUT_DIR.iterdir():
            if not symbol_dir.is_dir():
                continue
            for json_file in symbol_dir.glob("*_news.json"):
                if datetime.fromtimestamp(json_file.stat().st_mtime).date() == date.today():
                    try:
                        data = json.loads(json_file.read_text())
                        if data.get("has_material_development"):
                            material_alerts_today += 1
                    except Exception:
                        continue
    return {
        "announcements_seen_today": announcements,
        "files_downloaded_today": files_downloaded,
        "files_parsed_today": files_parsed,
        "files_processed_today": files_processed,
        "material_alerts_today": material_alerts_today,
    }

@app.get("/api/cost_history")
async def cost_history(hours: int = 2):
    if not TOKEN_USAGE_DB.exists():
        return {"cycles": []}
    cutoff = datetime.now() - timedelta(hours=hours)
    conn = sqlite3.connect(TOKEN_USAGE_DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(
        "SELECT cycle_start, cost_usd, calls FROM pipeline_runs WHERE cycle_start >= ? ORDER BY cycle_start",
        (cutoff.isoformat(),),
    )
    rows = [dict(row) for row in cur.fetchall()]
    conn.close()
    return {"cycles": rows}

@app.get("/api/fundamentals/{symbol}")
async def fundamentals(symbol: str, exchange: str = "NS", include_quarterly: bool = True):
    try:
        # We intentionally do NOT store this in Supabase yet. The first iteration
        # fetches from yfinance on-demand and returns JSON for the frontend.
        return await asyncio.to_thread(_fetch_fundamentals, symbol, exchange, include_quarterly)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch fundamentals: {exc}") from exc


# ---------------------------------------------------------------------------
# Live wire feed: replays today's filings on connect, then polls for new ones.
# Sends the *full* filing JSON (company_symbol, filing_date,
# has_material_development, facts[]) so the frontend gets every field as-is.
# ---------------------------------------------------------------------------

def _todays_news_files() -> List[Path]:
    if not NEWS_OUTPUT_DIR.exists():
        return []
    files = []
    for symbol_dir in NEWS_OUTPUT_DIR.iterdir():
        if not symbol_dir.is_dir():
            continue
        for json_file in symbol_dir.glob("*_news.json"):
            if datetime.fromtimestamp(json_file.stat().st_mtime).date() == date.today():
                files.append(json_file)
    files.sort(key=lambda p: p.stat().st_mtime)  # oldest first
    return files

def _load_filing(json_file: Path) -> Optional[Dict[str, Any]]:
    try:
        data = json.loads(json_file.read_text())
    except Exception:
        return None
    # Fall back to the parent folder name if the file itself doesn't carry the symbol.
    data.setdefault("company_symbol", json_file.parent.name)
    return data

async def _event_stream() -> AsyncGenerator[bytes, None]:
    seen: set[str] = set()

    # Catch-up: stream everything already written today so a fresh page
    # load (or reconnect) isn't empty.
    for json_file in _todays_news_files():
        filing = _load_filing(json_file)
        seen.add(str(json_file))
        if filing is not None:
            yield f"data: {json.dumps(filing)}\n\n".encode()

    # Then poll for newly written files and stream those as they land.
    while True:
        await asyncio.sleep(3)
        for json_file in _todays_news_files():
            key = str(json_file)
            if key in seen:
                continue
            seen.add(key)
            filing = _load_filing(json_file)
            if filing is not None:
                yield f"data: {json.dumps(filing)}\n\n".encode()

@app.get("/api/stream")
async def stream():
    return StreamingResponse(_event_stream(), media_type="text/event-stream")



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("dashboard_api:app", host="0.0.0.0", port=8420, reload=True)
