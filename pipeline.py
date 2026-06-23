# pipeline.py
"""Unified pipeline for NSE Agent.

This script orchestrates the three processing stages:
1. `Datapulling.announcements_nse` – downloads new PDFs/ZIPs.
2. `Dataextraction.Parsing` – extracts and parses PDFs into JSON chunks.
3. `Execution.newsextractor` – runs the LLM extraction on parsed JSON.

Each stage already implements its own deduplication via SQLite DBs, so the
pipeline simply calls the stage entry‑point (`run_once`). The loop runs
continuously, waiting a short interval between cycles. Errors in a stage are
logged but do not stop the pipeline.

Press Ctrl+C (or send SIGTERM) to stop the pipeline cleanly — it will finish
the stage currently running, then exit instead of starting a new one.

At the end of every cycle, a cost summary for THAT cycle (calls, tokens,
$ cost, failures) is written into the `pipeline_runs` table inside
token_usage.db — query that table any time to see cost history per cycle,
rather than only an all-time running total.
"""

import importlib.util
import logging
import signal
import sys
import time
from datetime import datetime
from pathlib import Path

from Execution.token_tracker import record_cycle_summary

# ---------------------------------------------------------------------------
# Logging configuration – mirrors the style used in the individual modules.
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("pipeline.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Graceful shutdown handling.
# ---------------------------------------------------------------------------
shutdown_requested = False


def handle_shutdown(signum, frame):
    global shutdown_requested
    log.info("Shutdown signal received (%s) — will stop after current stage", signum)
    shutdown_requested = True


signal.signal(signal.SIGINT, handle_shutdown)
signal.signal(signal.SIGTERM, handle_shutdown)

# ---------------------------------------------------------------------------
# Helper to import a module from a file path and retrieve its `run_once`.
# ---------------------------------------------------------------------------
def load_run_once(module_path: Path):
    """Load a Python file and return its `run_once` callable.

    Parameters
    ----------
    module_path: Path
        Absolute path to the ``.py`` file containing a ``run_once`` function.
    """
    # Compute package name relative to repository root for proper relative imports
    try:
        relative = module_path.relative_to(REPO_ROOT)
        package_name = ".".join(relative.with_suffix("").parts)
    except Exception:
        package_name = module_path.stem
    spec = importlib.util.spec_from_file_location(package_name, module_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module from {module_path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[arg-type]
    if not hasattr(mod, "run_once"):
        raise AttributeError(f"Module {module_path} does not define run_once()")
    return getattr(mod, "run_once")

# ---------------------------------------------------------------------------
# Resolve module file locations relative to the repository root.
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).parent
STAGES = [
    REPO_ROOT / "Datapulling" / "announcements_nse.py",
    REPO_ROOT / "Dataextraction" / "Parsing.py",
    REPO_ROOT / "Execution" / "newsextractor.py",
]

# Load the callables once at startup.
run_once_functions = []
for path in STAGES:
    log.info("Loading stage from %s", path)
    run_once_functions.append(load_run_once(path))

# ---------------------------------------------------------------------------
# Main execution loop.
# ---------------------------------------------------------------------------
CYCLE_DELAY_SECONDS = 30  # pause between full pipeline runs
log.info("=== Starting unified NSE pipeline ===")

while True:
    cycle_start_time = datetime.now().isoformat()

    for idx, run_once in enumerate(run_once_functions, start=1):
        if shutdown_requested:
            break

        stage_name = STAGES[idx - 1].stem
        try:
            log.info("--- Running stage %d: %s ---", idx, stage_name)
            run_once()
            log.info("Stage %s completed successfully", stage_name)
        except Exception as exc:  # pylint: disable=broad-except
            log.exception("Error in stage %s: %s", stage_name, exc)

    # Record this cycle's token/cost summary regardless of how it ended,
    # so partial cycles (e.g. stopped mid-way) still get their spend logged.
    record_cycle_summary(cycle_start_time, log=log)

    if shutdown_requested:
        log.info("Pipeline stopped cleanly by user request.")
        sys.exit(0)

    log.info("Pipeline cycle complete – sleeping for %d seconds", CYCLE_DELAY_SECONDS)
    for _ in range(CYCLE_DELAY_SECONDS):
        if shutdown_requested:
            break
        time.sleep(1)

if shutdown_requested:
    log.info("Pipeline stopped cleanly by user request.")
    sys.exit(0)