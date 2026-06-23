import sys
import json
import logging
import os
import zipfile
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# -- Logging --
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)
import sqlite3
from datetime import datetime

# -- Config --
BASE_DOWNLOAD_DIR = Path("downloaded_files")
BASE_PARSED_DIR   = Path("parsed_output")

# ── Parsed files dedup DB ────────────────────────────────────────────────────────
PARSED_DB = "parsed_files.db"

def init_parsed_db():
    conn = sqlite3.connect(PARSED_DB)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS parsed_files (
            filename    TEXT PRIMARY KEY,
            symbol      TEXT,
            parsed_at   TEXT,
            chunk_count INTEGER
        )
        """
    )
    conn.commit()
    conn.close()
    log.info("Parsed DB initialised: %s", PARSED_DB)

def is_already_parsed(filename: str) -> bool:
    conn = sqlite3.connect(PARSED_DB)
    row = conn.execute("SELECT 1 FROM parsed_files WHERE filename=?", (filename,)).fetchone()
    conn.close()
    return row is not None

def record_parsed(filename: str, symbol: str, chunk_count: int):
    conn = sqlite3.connect(PARSED_DB)
    conn.execute(
        "INSERT OR REPLACE INTO parsed_files (filename, symbol, parsed_at, chunk_count) VALUES (?,?,?,?)",
        (filename, symbol, datetime.now().isoformat(), chunk_count)
    )
    conn.commit()
    conn.close()
    log.info("Recorded parsed file: %s", filename)


def convert_table_to_markdown(table_data: list) -> str:
    if not table_data or not table_data[0]:
        return ""
    try:
        clean_table = [[(str(item) if item is not None else "") for item in row] for row in table_data]
        num_cols = len(clean_table[0])
        col_widths = [max(len(str(item)) for item in col) for col in zip(*clean_table)]
        markdown_table = []
        header = clean_table[0]
        markdown_table.append("|" + "|".join(f" {str(h).ljust(col_widths[i])} " for i, h in enumerate(header)) + "|")
        markdown_table.append("|" + "|".join(f"-{'-' * col_widths[i]}-" for i in range(num_cols)) + "|")
        for row in clean_table[1:]:
            markdown_table.append("|" + "|".join(f" {str(item).ljust(col_widths[i])} " for i, item in enumerate(row)) + "|")
        return "\n".join(markdown_table)
    except Exception as e:
        log.warning(f"Table to Markdown conversion failed: {e}")
        return ""


def build_chunk(page_num, chunk_type: str, content, source: str = "text_layer") -> dict:
    return {"page_num": page_num, "type": chunk_type, "content": content, "source": source}


# ── TASK 1: pull PDFs out of ZIP attachments ────────────────────────────────
def extract_pdfs_from_zip(zip_path: Path, extract_dir: Path) -> list[Path]:
    """
    Looks inside a ZIP for any PDF files and copies them out flat into
    extract_dir. Non-PDF contents (XBRL/XML/etc.) are ignored — only the PDF
    is needed downstream. Returns the list of extracted PDF paths (existing
    ones included, so re-runs are idempotent and cheap).
    """
    extracted = []
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            pdf_members = [n for n in zf.namelist() if n.lower().endswith(".pdf")]

            if not pdf_members:
                log.info(f"No PDF inside ZIP: {zip_path.name}")
                return extracted

            extract_dir.mkdir(parents=True, exist_ok=True)
            for member in pdf_members:
                # Flatten any folder structure inside the zip; prefix with the
                # zip's own stem so PDFs from different zips never collide.
                pdf_filename = f"{zip_path.stem}__{Path(member).name}"
                target_path = extract_dir / pdf_filename

                if target_path.exists():
                    extracted.append(target_path)
                    continue

                with zf.open(member) as src, open(target_path, "wb") as dst:
                    dst.write(src.read())
                log.info(f"Extracted PDF from ZIP: {target_path.name}")
                extracted.append(target_path)

    except zipfile.BadZipFile:
        log.error(f"Bad/corrupt ZIP file: {zip_path.name}")
    except Exception as e:
        log.error(f"ZIP extraction failed for {zip_path.name}: {e}")

    return extracted


# ── TASK 2: turn a PDF into raw JSON chunks ─────────────────────────────────
def parse_pdf(filepath: Path, symbol: str) -> dict:
    import fitz
    import pdfplumber
    chunks = []
    log.info(f"Parsing PDF: {filepath.name}")

    doc = fitz.open(str(filepath))

    # 1. Page-by-Page text extraction (text layer only — no Vision OCR fallback).
    for page_num, page in enumerate(doc, start=1):
        text = page.get_text("text").strip()
        if text:
            chunks.append(build_chunk(page_num, "text", text, source="text_layer"))
        else:
            log.warning(
                f"No extractable text on page {page_num} of {filepath.name} "
                f"(possible scanned/image-only page — will be missing from output)"
            )

    doc.close()

    # 2. Table Extraction (Standard selectable tables)
    try:
        with pdfplumber.open(str(filepath)) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                tables = page.extract_tables()
                for table in tables:
                    if table:
                        md_table = convert_table_to_markdown(table)
                        if md_table:
                            chunks.append(build_chunk(page_num, "table", md_table, source="pdfplumber"))
    except Exception as e:
        log.error(f"Table extraction failed for {filepath.name}: {e}")

    return {"filename": filepath.name, "symbol": symbol, "chunks": chunks}


def parse_and_save(file_path: Path, symbol: str, target_dir: Path):
    output_file = target_dir / f"{file_path.stem}.json"
    if output_file.exists():
        return

    try:
        parsed_data = parse_pdf(file_path, symbol)
        if parsed_data["chunks"]:
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(parsed_data, f, indent=2, ensure_ascii=False)
            log.info(f"Successfully saved: {output_file.name}")
        else:
            log.warning(
                f"No chunks extracted for {file_path.name} — likely a scanned/"
                f"image-only PDF with no text layer. No JSON written; this file "
                f"will not reach the news extractor."
            )
    except Exception as e:
        log.error(f"Failed to process {file_path.name}: {e}")


def process_all_companies():
    if not BASE_DOWNLOAD_DIR.exists():
        log.error(f"Download directory {BASE_DOWNLOAD_DIR} does not exist.")
        return

    for company_dir in BASE_DOWNLOAD_DIR.iterdir():
        if not company_dir.is_dir():
            continue

        symbol = company_dir.name
        target_dir = BASE_PARSED_DIR / symbol
        target_dir.mkdir(parents=True, exist_ok=True)
        extracted_dir = company_dir / "_extracted_from_zip"

        # TASK 1 — pull any PDFs out of ZIP attachments for this company
        for zip_path in company_dir.glob("*.zip"):
            extract_pdfs_from_zip(zip_path, extracted_dir)

        # TASK 2 — turn every PDF (directly downloaded + just extracted) into raw JSON
        pdf_paths = list(company_dir.glob("*.pdf"))
        if extracted_dir.exists():
            pdf_paths += list(extracted_dir.glob("*.pdf"))

        for file_path in pdf_paths:
            filename = file_path.name
            if is_already_parsed(filename):
                log.info(f"Skipping already parsed file: {filename}")
                continue
            parse_and_save(file_path, symbol, target_dir)
            # Determine chunk count from the saved JSON
            json_path = target_dir / f"{file_path.stem}.json"
            try:
                with open(json_path, "r", encoding="utf-8") as jf:
                    parsed = json.load(jf)
                chunk_count = len(parsed.get("chunks", []))
            except Exception:
                chunk_count = 0
            record_parsed(filename, symbol, chunk_count)


def run_once():
    init_parsed_db()
    process_all_companies()

if __name__ == "__main__":
    run_once()