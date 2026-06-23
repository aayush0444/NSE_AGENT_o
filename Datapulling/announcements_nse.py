"""
NSE All-Company Corporate Announcements PDF/ZIP Poller
---------------------------------------------------------
Watches https://www.nseindia.com/companies-listing/corporate-filings-announcements
(single API endpoint, ALL companies) and downloads any NEWLY POSTED PDF or
ZIP attachment as soon as it appears. (Companies sometimes file ZIP bundles
instead of a plain PDF — e.g. XBRL packages — so both are handled.)

On the very first run it SEEDS a baseline: every announcement currently on the
page is marked "seen" in the database WITHOUT being downloaded. Nothing old
gets pulled. From the next poll onward, only files that are genuinely new
since the last check get downloaded.

Bot-detection evasion (cookie harvest via curl_cffi, browser-shaped headers,
randomized jitter) is carried over from your original per-symbol poller.

Subject filtering: announcements whose category/subject matches anything in
BLOCKED_SUBJECTS are skipped entirely — never downloaded, never parsed, never
sent to the LLM. This keeps low-signal routine disclosures (newspaper ads,
compliance certificates, trading window closures, investor presentations)
out of the pipeline at the earliest possible point.
"""

import sys
import time
import random
import sqlite3
import hashlib
import logging
from datetime import datetime
from pathlib import Path

import requests
from apscheduler.schedulers.blocking import BlockingScheduler
from curl_cffi import requests as curl_requests

# ── Fix Windows console Unicode ────────────────────────────────────────────
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("announcements_poller.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)
import sqlite3
from datetime import datetime

# ── Config ──────────────────────────────────────────────────────────────────
BASE_API      = "https://www.nseindia.com/api/corporate-announcements"
REFERER       = "https://www.nseindia.com/companies-listing/corporate-filings-announcements"
DOWNLOAD_DIR  = Path("downloaded_files")
DB_PATH       = "nse_announcements.db"
BASELINE_FLAG = Path("baseline_done.flag")

# Leave empty to track every listed company. Populate to restrict, e.g.
# SYMBOL_FILTER = {"STLTECH", "TCS"}
SYMBOL_FILTER: set[str] = set()

# Companies sometimes file ZIP bundles (often containing XBRL) instead of a
# plain PDF — both are downloaded as-is, no extraction.
SUPPORTED_EXTENSIONS = {".pdf", ".zip"}

# Subjects to skip entirely — never downloaded, never parsed, never sent to
# the LLM. Match is case-insensitive substring, so "trading window" catches
# "Trading Window Closure" even if NSE varies the exact wording slightly.
BLOCKED_SUBJECTS = {
    "newspaper publication",
    "newspaper advertisement",
    "compliance certificate",
    "trading window",
    "investor presentation",
}

POLL_MINUTES    = 3
JITTER_SECONDS  = 60
COOKIE_TTL_SECS = 720  # re-harvest cookies if older than this

# ── Headers — Android Chrome fingerprint (same evasion as your reference) ──
BASE_HEADERS = {
    "user-agent": "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36",
    "accept": "*/*",
    "accept-language": "en-US,en;q=0.8",
    "accept-encoding": "gzip, deflate, br, zstd",
    "sec-ch-ua": '"Brave";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"Android"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "sec-gpc": "1",
    "priority": "u=1, i",
}

# ── SQLite ───────────────────────────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS announcements (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol        TEXT NOT NULL,
            company_name  TEXT,
            file_hash     TEXT UNIQUE NOT NULL,
            filename      TEXT NOT NULL,
            url           TEXT NOT NULL,
            broadcast_at  TEXT,
            was_downloaded INTEGER NOT NULL DEFAULT 0,
            seen_at       TEXT NOT NULL
        )
    """
    )
    conn.commit()
    conn.close()
    log.info("SQLite DB initialised: %s", DB_PATH)

# ── Downloaded files dedup DB ────────────────────────────────────────────────────────
DOWNLOADED_DB = "downloaded_files.db"

def init_downloaded_db():
    conn = sqlite3.connect(DOWNLOADED_DB)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS downloaded_files (
            pdf_url       TEXT PRIMARY KEY,
            symbol        TEXT,
            filename      TEXT,
            downloaded_at TEXT
        )
        """
    )
    conn.commit()
    conn.close()
    log.info("Downloaded DB initialised: %s", DOWNLOADED_DB)

def is_downloaded(pdf_url: str) -> bool:
    conn = sqlite3.connect(DOWNLOADED_DB)
    row = conn.execute("SELECT 1 FROM downloaded_files WHERE pdf_url=?", (pdf_url,)).fetchone()
    conn.close()
    return row is not None

def record_downloaded(pdf_url: str, symbol: str, filename: str, downloaded_at: str):
    conn = sqlite3.connect(DOWNLOADED_DB)
    conn.execute(
        "INSERT OR REPLACE INTO downloaded_files (pdf_url, symbol, filename, downloaded_at) VALUES (?,?,?,?)",
        (pdf_url, symbol, filename, downloaded_at)
    )
    conn.commit()
    conn.close()
    log.info("Recorded downloaded file: %s", filename)


def is_seen(file_hash: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT 1 FROM announcements WHERE file_hash=?", (file_hash,)
    ).fetchone()
    conn.close()
    return row is not None


def mark_seen(symbol, company_name, file_hash, filename, url, broadcast_at, downloaded: bool):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        INSERT OR IGNORE INTO announcements
        (symbol, company_name, file_hash, filename, url, broadcast_at, was_downloaded, seen_at)
        VALUES (?,?,?,?,?,?,?,?)
    """, (symbol, company_name, file_hash, filename, url, broadcast_at,
          1 if downloaded else 0, datetime.now().isoformat()))
    conn.commit()
    conn.close()


# ── Cookie harvester ─────────────────────────────────────────────────────────
def harvest_cookies():
    log.info("Harvesting fresh NSE cookies...")
    try:
        session = curl_requests.Session(impersonate="chrome110")

        r1 = session.get(
            "https://www.nseindia.com",
            headers={**BASE_HEADERS, "sec-fetch-mode": "navigate", "sec-fetch-dest": "document"},
            timeout=15,
        )
        log.info("Homepage: %s", r1.status_code)
        time.sleep(random.uniform(2, 4))

        r2 = session.get(
            REFERER,
            headers={**BASE_HEADERS, "sec-fetch-mode": "navigate", "sec-fetch-dest": "document"},
            timeout=15,
        )
        log.info("Announcements page: %s", r2.status_code)
        time.sleep(random.uniform(1, 3))

        log.info("Cookies: %s", list(session.cookies.keys()))
        return session
    except Exception as e:
        log.error("Cookie harvest failed: %s", e)
        return None


# ── File downloader (PDF or ZIP — both are just bytes off the CDN) ─────────
def download_file(url: str, filepath: Path) -> bool:
    try:
        filepath.parent.mkdir(parents=True, exist_ok=True)
        if filepath.exists():
            return False

        r = requests.get(url, timeout=30, headers={"user-agent": BASE_HEADERS["user-agent"]})
        if r.status_code == 200 and len(r.content) > 100:
            with open(filepath, "wb") as f:
                f.write(r.content)
            log.info("Downloaded: %s (%d KB)", filepath.name, len(r.content) // 1024)
            return True
        log.warning("Bad response for %s: status=%s", filepath.name, r.status_code)
        return False
    except Exception as e:
        log.error("Download error for %s: %s", filepath.name, e)
        return False


def write_sidecar(filepath: Path, meta: dict):
    import json
    sidecar_path = filepath.with_suffix(".meta.json")
    with open(sidecar_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    log.info("Sidecar written: %s", sidecar_path.name)


# ── Fetching the single endpoint ────────────────────────────────────────────
def fetch_announcements(session) -> list[dict]:
    today = datetime.now().strftime("%d-%m-%Y")
    params = f"index=equities&from_date={today}&to_date={today}"
    url = f"{BASE_API}?{params}"

    try:
        r = session.get(url, headers={**BASE_HEADERS, "referer": REFERER}, timeout=15)
        log.info("Fetch status: %s", r.status_code)
        if r.status_code != 200:
            log.warning("Non-200 response — skipping this cycle")
            return []

        data = r.json()
        records = data if isinstance(data, list) else data.get("data", [])
        log.info("Fetched %d announcement records", len(records))

        if records:
            # one-time debug aid so you can verify field names against your
            # live NSE session without digging through poller.log
            log.debug("Sample record keys: %s", list(records[0].keys()))

        return records
    except Exception as e:
        log.error("Fetch error: %s", e)
        return []


# ── Subject filtering ────────────────────────────────────────────────────────
def is_blocked_subject(category: str) -> bool:
    """Returns True if this announcement's category/subject matches one of
    the low-signal types we never want to download, parse, or send to the
    LLM (newspaper notices, compliance certificates, trading window
    closures, investor presentations, etc.)."""
    category_lower = (category or "").lower()
    return any(blocked in category_lower for blocked in BLOCKED_SUBJECTS)


# ── Record processing ────────────────────────────────────────────────────────
def process_record(rec: dict, baseline: bool) -> bool:
    """Returns True if a NEW file was downloaded (never True during baseline)."""
    file_url = rec.get("attchmntFile") or rec.get("attachment") or ""
    suffix = Path(file_url).suffix.lower()
    if not file_url or suffix not in SUPPORTED_EXTENSIONS:
        return False  # only PDF / ZIP, nothing else

    symbol = rec.get("symbol") or rec.get("sm_symbol") or "UNKNOWN"
    if SYMBOL_FILTER and symbol not in SYMBOL_FILTER:
        return False

    file_hash = hashlib.md5(file_url.encode()).hexdigest()
    if is_seen(file_hash):
        return False

    company_name = rec.get("sm_name") or rec.get("companyName") or ""
    isin = rec.get("sm_isin") or rec.get("isin") or ""
    category = rec.get("desc") or rec.get("subject") or ""
    description = rec.get("attchmntText") or ""

    if is_blocked_subject(category):
        log.info("BLOCKED subject '%s' for %s — skipping entirely", category, symbol)
        return False

    broadcast_at = (
        rec.get("an_dt") or rec.get("broadcastDateTime") or rec.get("exchdisstime") or ""
    )
    date_tag = (broadcast_at.split(" ")[0] if broadcast_at else datetime.now().strftime("%d-%m-%Y")).replace("-", "")
    filename = f"{symbol}_{date_tag}_{file_hash[:8]}{suffix}"
    filepath = DOWNLOAD_DIR / symbol / filename

    if baseline:
        # Existing announcement at startup — record it as seen, don't fetch it.
        mark_seen(symbol, company_name, file_hash, filename, file_url, broadcast_at, downloaded=False)
        return False

    log.info("NEW %s: %s | %s -> %s", suffix.upper().lstrip("."), symbol, category, filename)
    success = download_file(url=file_url, filepath=filepath)
    if success:
        mark_seen(symbol, company_name, file_hash, filename, file_url, broadcast_at, downloaded=True)
        write_sidecar(filepath, {
            "symbol": symbol,
            "company_name": company_name,
            "isin": isin,
            "category": category,
            "description": description,
            "broadcast_at": broadcast_at,
            "filename": filename,
            "file_ext": suffix.lstrip("."),
            "source_url": file_url,
            "file_hash": file_hash,
            "downloaded_at": datetime.now().isoformat(),
        })
        return True
    return False


# ── Session management ───────────────────────────────────────────────────────
session_store = {"session": None, "last_harvest": 0}


def get_session():
    now = time.time()
    if session_store["session"] is None or (now - session_store["last_harvest"]) > COOKIE_TTL_SECS:
        session_store["session"] = harvest_cookies()
        session_store["last_harvest"] = now
        if session_store["session"] is not None:
            time.sleep(random.uniform(2, 4))
    return session_store["session"]


# ── Baseline seed (first run only) ──────────────────────────────────────────
def run_baseline_seed():
    log.info("=== First run detected: seeding baseline (no downloads) ===")
    session = get_session()
    if session is None:
        log.error("Could not establish session — baseline seed aborted, will retry next run")
        return

    records = fetch_announcements(session)
    for rec in records:
        process_record(rec, baseline=True)

    BASELINE_FLAG.write_text(datetime.now().isoformat())
    log.info("Baseline complete: %d existing announcements marked as seen (not downloaded)", len(records))


# ── Regular poll job ─────────────────────────────────────────────────────────
def run_poll_job():
    session = get_session()
    if session is None:
        log.error("No session — skipping this cycle")
        return

    records = fetch_announcements(session)
    new_count = 0
    for rec in records:
        if process_record(rec, baseline=False):
            new_count += 1

    log.info("Poll cycle done — %d new file(s) downloaded", new_count)
    time.sleep(random.uniform(1.0, 2.5))


# ── Entry point ───────────────────────────────────────────────────────────────
def run_once():
    init_downloaded_db()
    init_db()
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    if not BASELINE_FLAG.exists():
        run_baseline_seed()
    else:
        log.info("Baseline already seeded — running normal poll")
        run_poll_job()

if __name__ == "__main__":
    log.info("=== NSE All-Company Announcements PDF/ZIP Poller starting ===")
    run_once()
    # Start periodic scheduler after the initial run
    scheduler = BlockingScheduler()
    scheduler.add_job(
        run_poll_job,
        trigger="interval",
        minutes=POLL_MINUTES,
        jitter=JITTER_SECONDS,
    )
    log.info("Scheduler running — polling every ~%d minutes", POLL_MINUTES)
    try:
        scheduler.start()
    except KeyboardInterrupt:
        log.info("Poller stopped")