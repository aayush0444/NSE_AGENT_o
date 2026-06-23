"""
News-alert extractor.

Reads every parsed filing JSON (from parse.py's output) ONCE, asks an LLM to
surface any newsworthy facts as plain-language alerts — the way a person
would actually tell you what just happened, not a dry filing summary — and
records which files have already been processed so re-running the script
never re-extracts the same filing twice.

Run:
    uv run news_extractor.py
"""

import os
import json
import logging
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Optional

import httpx
from pydantic import ValidationError
from dotenv import load_dotenv

from .schemas import FilingNewsExtraction
from .token_tracker import record_token_usage, print_usage_summary

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler("news_extractor.log", encoding="utf-8"), logging.StreamHandler()],
)
log = logging.getLogger(__name__)

# ── Config ───────────────────────────────────────────────────────────────────
PARSED_DIR   = Path("parsed_output")     # input: output of parse.py
DOWNLOAD_DIR = Path("downloaded_files")  # where the poller's .meta.json sidecars live
OUTPUT_DIR   = Path("news_output")
PROCESSED_DB = "processed_files.db"

OPENROUTER_KEY = os.getenv("OPENROUTER_KEY", "")
MODEL = "openai/gpt-4o-mini"


# ── Dedup tracking — "process each file once" ───────────────────────────────
def init_db():
    conn = sqlite3.connect(PROCESSED_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS processed_files (
            filename     TEXT PRIMARY KEY,
            facts_count  INTEGER,
            processed_at TEXT
        )
    """)
    conn.commit()
    conn.close()
    log.info("DB initialised: %s", PROCESSED_DB)


def is_already_processed(filename: str) -> bool:
    conn = sqlite3.connect(PROCESSED_DB)
    try:
        row = conn.execute(
            "SELECT 1 FROM processed_files WHERE filename = ?", (filename,)
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def mark_processed(filename: str, facts_count: int):
    conn = sqlite3.connect(PROCESSED_DB)
    conn.execute(
        "INSERT OR REPLACE INTO processed_files (filename, facts_count, processed_at) VALUES (?,?,?)",
        (filename, facts_count, datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()


# ── Sidecar lookup — parsed JSON has no timing/category of its own ─────────
def find_sidecar_meta(symbol: str, stem: str) -> dict:
    """
    parse.py's output only has {filename, symbol, chunks} — the broadcast
    time, category, and company name live in the .meta.json the poller wrote
    next to the original download.

    - Direct PDF: same stem (e.g. "STLTECH_20260619_abcd1234.meta.json").
    - PDF pulled out of a ZIP: stem is "<zipstem>__<originalpdfname>" — the
      sidecar belongs to the ZIP itself, not the embedded file.
    """
    company_dir = DOWNLOAD_DIR / symbol

    direct = company_dir / f"{stem}.meta.json"
    if direct.exists():
        return json.loads(direct.read_text(encoding="utf-8"))

    if "__" in stem:
        zip_stem = stem.split("__", 1)[0]
        zip_meta = company_dir / f"{zip_stem}.meta.json"
        if zip_meta.exists():
            return json.loads(zip_meta.read_text(encoding="utf-8"))

    log.warning("No sidecar metadata found for %s — alert timing will be best-effort", stem)
    return {}


# ── Prompting ────────────────────────────────────────────────────────────────
def build_prompt(parsed: dict, meta: dict) -> str:
    schema_str = json.dumps(FilingNewsExtraction.model_json_schema(), indent=2)

    doc_text = ""
    for chunk in parsed.get("chunks", []):
        doc_text += f"\n[Page {chunk.get('page_num')}] ({chunk.get('type')})\n{chunk.get('content')}\n"

    broadcast_at = meta.get("broadcast_at") or meta.get("disseminated_at") or "unknown"

    instructions = f"""
You are reporting corporate disclosures as breaking financial news — the way a
sharp human analyst would tell a friend what just happened, not a dry filing
summary.

CONTEXT FOR THIS FILING:
- Company: {meta.get('company_name', '')} ({parsed.get('symbol', '')})
- Category on exchange: {meta.get('category', '')}
- Broadcast / disseminated at: {broadcast_at}

For every fact in this document a stock-market follower would actually care about:
1. Write ONE "alert_message" (one or two sentences) phrased like live news —
   e.g. "Kirloskar just told the exchange they've bagged a fresh order for 96
   units, filed after market close." Use the broadcast time above to anchor
   language like "just announced" / "this morning" / "after market hours" —
   do NOT invent a time if none was given to you above.
2. Skip routine boilerplate (standard compliance certificates, repeated
   disclaimers, generic format text) unless it contains an actual material
   development.
3. Tag a structural event_category for filtering.
4. Keep page_number and verbatim_source_quote exact, for traceability.
5. reporting_period: copy exactly as stated in the document, or null if none.

Set has_material_development = true only if at least one fact is genuinely
market-moving (order wins/losses, M&A, litigation, ratings, capex, dividends,
leadership changes, etc.) — not just routine disclosure noise.
"""

    return f"""{instructions}

OUTPUT SCHEMA (respond with JSON matching this exactly):
{schema_str}

DOCUMENT CONTENT:
{doc_text}

Return ONLY valid JSON. No markdown fences, no commentary.
"""


# ── LLM call ─────────────────────────────────────────────────────────────────
def call_llm(prompt: str, symbol: str, context_label: str) -> str:
    usage = None
    success = False
    content = ""

    try:
        r = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.0,
            },
            timeout=120,
        )
        r.raise_for_status()
        body = r.json()
        usage = body.get("usage")
        content = body["choices"][0]["message"]["content"]
        success = True
    except Exception as e:
        log.error(f"LLM call failed: {e}")
    finally:
        record_token_usage(
            layer="news_extraction",
            model=MODEL,
            symbol=symbol,
            context_label=context_label,
            usage=usage,
            success=success,
            log=log,
        )

    return content


def parse_llm_response(raw: str) -> Optional[FilingNewsExtraction]:
    raw = raw.strip()
    if "```" in raw:
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        data = json.loads(raw)
    except Exception as e:
        log.error(f"JSON parse failed: {e}")
        return None

    try:
        return FilingNewsExtraction.model_validate(data)
    except ValidationError as e:
        log.error(f"Schema validation failed: {e}")
        return None


# ── Per-file processing ──────────────────────────────────────────────────────
def process_file(parsed_file_path: Path, force: bool = False) -> Optional[FilingNewsExtraction]:
    filename = parsed_file_path.name

    if not force and is_already_processed(filename):
        log.info(f"Already extracted, skipping: {filename}")
        return None

    with open(parsed_file_path, "r", encoding="utf-8") as f:
        parsed = json.load(f)

    symbol = parsed.get("symbol", "UNKNOWN")
    stem = parsed_file_path.stem
    meta = find_sidecar_meta(symbol, stem)

    prompt = build_prompt(parsed, meta)
    response = call_llm(prompt, symbol=symbol, context_label=filename)

    if not response:
        log.warning(f"No LLM response for {filename} — skipping")
        return None

    extracted = parse_llm_response(response)
    if extracted is None:
        log.warning(f"Could not validate extraction for {filename} — skipping")
        return None

    out_dir = OUTPUT_DIR / symbol
    out_dir.mkdir(parents=True, exist_ok=True)
    output_path = out_dir / f"{stem}_news.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(extracted.model_dump(), f, indent=2, ensure_ascii=False)

    mark_processed(filename, len(extracted.facts))

    if extracted.has_material_development:
        log.info(f"MATERIAL NEWS — {symbol} ({filename}):")
        for fact in extracted.facts:
            log.info(f"  -> {fact.alert_message}")
    else:
        log.info(f"No material development in {filename} ({len(extracted.facts)} routine fact(s))")

    return extracted


def process_all_companies():
    if not PARSED_DIR.exists():
        log.error(f"Parsed output directory {PARSED_DIR} does not exist. Run parse.py first.")
        return

    total_files = 0
    total_material = 0

    for company_dir in PARSED_DIR.iterdir():
        if not company_dir.is_dir():
            continue

        for parsed_file_path in company_dir.glob("*.json"):
            total_files += 1
            result = process_file(parsed_file_path)
            if result is not None and result.has_material_development:
                total_material += 1

    log.info(f"Done. Processed {total_files} file(s), {total_material} contained material news.")
    print_usage_summary()


def run_once():
    init_db()
    process_all_companies()
