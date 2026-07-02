# NSE Agent — Automated NSE News & Fundamentals Pipeline

A fully automated system that monitors NSE (National Stock Exchange of India) corporate announcements, extracts AI-powered news alerts using LLMs, and surfaces real-time filings, fundamentals, and charts through a modern React dashboard.

---

## What It Solves

Retail investors, analysts, and algo traders who track NSE-listed companies face a fundamental information asymmetry problem:

1. **NSE publishes hundreds of corporate filings daily** (board meeting outcomes, order wins, earnings results, fundraisings, etc.) through a public portal, but there is no curated, structured feed of what actually matters.
2. **Manually scanning PDFs and ZIP attachments** is unfeasible for more than a handful of stocks.
3. **Existing aggregators** either charge premium fees, delay the data, or bury material announcements under routine compliance noise (newspaper ads, trading window closures, compliance certificates).
4. **Even when you find a filing**, extracting the key financial data, comparing it against historical fundamentals, and viewing price charts requires switching between multiple unrelated tools.

**NSE Agent solves all of this in one integrated system:**

- **Real-time poller** that scrapes NSE every ~3 minutes, filters out low-signal subjects at the source, and downloads only genuine material filings.
- **AI news extraction** that reads each filing through an LLM (OpenRouter) and produces concise, human-readable news alerts — tagged with categories, page references, and verbatim source quotes — so you know *exactly* what happened and where to verify it.
- **Live streaming feed** via Server-Sent Events (SSE) that pushes new filings to your dashboard as they land, with zero page refreshes.
- **Company fundamentals on demand** — instant access to financial statements (P&L, balance sheet, cash flow), valuation ratios, 52-week price ranges, market cap, P/E, ROE, and more — all fetched live from Yahoo Finance.
- **Interactive TradingView charts** embedded for any NSE/BSE stock with full technical analysis tools (indicators, drawing tools, timeframe switching).
- **Personalized watchlist** with Supabase-backed persistence, stock search, and a filtered news feed per symbol.

The result: a single pane of glass where an Indian stock market participant can monitor filings in real time, understand what they mean (without reading the PDF), check the company's financial health, and analyse price action — all in seconds, not hours.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         NSE Agent System                            │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     BACKEND (Python)                         │   │
│  │                                                              │   │
│  │  ┌──────────────┐    ┌──────────────┐    ┌───────────────┐  │   │
│  │  │  NSE Poller   │───▶│  PDF Parser   │───▶│  LLM Extractor │  │   │
│  │  │ (announcements│    │  (Parsing.py) │    │ (newsextractor │  │   │
│  │  │  _nse.py)     │    │               │    │  .py)          │  │   │
│  │  └──────┬───────┘    └──────┬───────┘    └───────┬────────┘  │   │
│  │         │                   │                    │            │   │
│  │         ▼                   ▼                    ▼            │   │
│  │  ┌─────────────────────────────────────────────────────┐     │   │
│  │  │              Supabase (PostgreSQL)                   │     │   │
│  │  │   - nse_stocks table                                 │     │   │
│  │  │   - news_items table                                 │     │   │
│  │  │   - watchlist_items table                            │     │   │
│  │  │   - user auth (Supabase Auth)                        │     │   │
│  │  └─────────────────────────────────────────────────────┘     │   │
│  │                                                              │   │
│  │  ┌─────────────────────────────────────────────────────┐     │   │
│  │  │         FastAPI Server (dashboard_api.py)            │     │   │
│  │  │   - /api/stream   (live SSE filing feed)            │     │   │
│  │  │   - /api/alerts   (material alerts list)            │     │   │
│  │  │   - /api/status   (pipeline health)                 │     │   │
│  │  │   - /api/fundamentals/{symbol}  (yfinance data)     │     │   │
│  │  │   - /api/today_summary                              │     │   │
│  │  │   - /api/cost_history                               │     │   │
│  │  └─────────────────────────────────────────────────────┘     │   │
│  │                                                              │   │
│  │  ┌─────────────────────────────────────────────────────┐     │   │
│  │  │  SQLite Databases (local dedup & telemetry)         │     │   │
│  │  │   - nse_announcements.db  (seen announcement dedup) │     │   │
│  │  │   - downloaded_files.db   (file download tracking)  │     │   │
│  │  │   - processed_files.db    (LLM processing dedup)    │     │   │
│  │  │   - token_usage.db        (LLM cost per cycle)      │     │   │
│  │  └─────────────────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                               │                                     │
│                        HTTP / SSE                                   │
│                               ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    FRONTEND (React + Vite)                   │   │
│  │                                                              │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │   │
│  │  │Dashboard │  │Watchlist  │  │Company   │                   │   │
│  │  │(live feed)│  │(personal) │  │Fundamen- │                   │   │
│  │  │          │  │          │  │tals page │                   │   │
│  │  └──────────┘  └──────────┘  └──────────┘                   │   │
│  │       │              │              │                        │   │
│  │       ▼              ▼              ▼                        │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │               Shared Components                       │   │   │
│  │  │  FeedItem · StatusBar · Navbar · TickerMarquee       │   │   │
│  │  │  StockChart (Recharts) · TradingViewChart (TV.js)     │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  │                                                              │   │
│  │  Hooks: useFilingStream · useWatchlist · useStockSearch ·    │   │
│  │         useNewsFeed                                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Backend Components

### 1. `pipeline.py` — Unified Orchestrator

The main loop that runs the three processing stages sequentially, waits 30 seconds between cycles, and gracefully shuts down on Ctrl+C. At the end of each cycle, it records a cost summary into `token_usage.db`.

Stages executed per cycle:
1. **NSE Poller** — downloads new filings
2. **PDF Parser** — extracts text from PDFs/ZIPs
3. **LLM Extractor** — generates news alerts

### 2. `Datapulling/announcements_nse.py` — NSE Announcement Poller

**What it does:**
- Polls the NSE corporate announcements API every ~3 minutes (+ random jitter up to 60s to evade bot detection)
- Downloads PDF/ZIP attachments for any NEW announcement that isn't a blocked subject
- Writes sidecar `.meta.json` files next to each download with metadata (broadcast time, category, company name)
- Upserts discovered stocks into Supabase `nse_stocks` table

**Anti-detection measures:**
- Cookie harvesting via `curl_cffi` with Chrome 110 impersonation
- Android Pixel 9 user-agent fingerprint
- Randomized delays between requests

**Subject filtering:**
Announcements matching these subjects are **blocked at the poller level** (never downloaded):
- Newspaper publications / advertisements
- Compliance certificates
- Trading window closures
- Investor presentations

**Baseline seeding on first run:**
On the very first execution, all currently visible announcements are marked as "seen" without being downloaded — so only genuinely NEW filings are pulled from that point forward.

### 3. `Dataextraction/Parsing.py` — PDF Text Extraction

Reads raw PDF/ZIP files from `downloaded_files/`, extracts text content using pdfplumber / PyMuPDF, chunks them into logical sections, and writes structured JSON into `parsed_output/` — ready for the LLM stage.

### 4. `Execution/newsextractor.py` — LLM News Extraction

**Core AI engine of the pipeline.** For each parsed JSON file:
1. Loads the filing text + sidecar metadata (broadcast time, category, company name)
2. Builds a prompt instructing the LLM to act like a financial news analyst
3. Calls OpenRouter's LLM API with the Pydantic schema embedded in the prompt
4. Validates the JSON response against `FilingNewsExtraction` schema
5. Writes the validated news alert to `news_output/<symbol>/<filename>_news.json`
6. Inserts each fact into Supabase `news_items` table
7. Records token usage and marks the file as processed (never re-processed)

**LLM output schema** (Pydantic):
```python
class Fact(BaseModel):
    alert_message: str          # One-sentence news-style alert
    event_category: str         # e.g. earnings, M&A, order, litigation
    page_number: int            # Source page in the filing
    verbatim_source_quote: str  # Exact quote for traceability
    reporting_period: str | None

class FilingNewsExtraction(BaseModel):
    facts: List[Fact]
    has_material_development: bool
```

### 5. `Execution/token_tracker.py` — Cost Telemetry

- Logs every LLM call (prompt/completion tokens, cost in USD) into `token_usage.db`
- At the end of each pipeline cycle, aggregates all calls into a `pipeline_runs` summary row
- Provides `print_usage_summary()` for all-time spend by model

### 6. `dashboard_api.py` — FastAPI Backend Server

Exposes REST + SSE endpoints on port **8420**:

| Endpoint | Description |
|---|---|
| `GET /api/stream` | Server-Sent Events — replays today's filings on connect, then streams new ones in real time |
| `GET /api/alerts?limit=30` | Material-only alert list |
| `GET /api/status` | Pipeline health (current stage, last cycle cost/calls/failures) |
| `GET /api/today_summary` | Today's counts: announcements, downloads, parses, LLM extractions, material alerts |
| `GET /api/cost_history?hours=2` | Per-cycle cost history |
| `GET /api/fundamentals/{symbol}?exchange=NS&include_quarterly=true` | Company fundamentals via yfinance (P&L, balance sheet, cash flow, valuation ratios) |
| `GET /api/chart/{symbol}` | Historical price data for stock charts |

The fundamentals endpoint returns a rich JSON payload:
- **info**: longName, shortName, marketCap, currentPrice, trailingPE, forwardPE, priceToBook, bookValue, profitMargins, ROE, ROA, debtToEquity, dividendYield, EPS, 52-week range, shares outstanding, sector, industry, website, and more
- **tables**: financials, balance_sheet, cashflow (annual + quarterly)

Yahoo Finance ticker mapping: `RELIANCE` → `RELIANCE.NS` (NSE) or `RELIANCE.BO` (BSE).

---

## Frontend Components

### `Dashboard.jsx` — Live News Feed

- Connects to the SSE endpoint (`/api/stream`) on mount
- Displays a real-time, scrollable feed of filing alerts
- Each alert shows: company symbol, event category, materiality badge, alert message, page number, and a collapsible source quote
- Daily reset at midnight — fresh session every day
- StatusBar shows LIVE/CONNECTING/OFFLINE indicator, filing count, and current time
- Exponential backoff reconnection on disconnect

### `Watchlist.jsx` — Personal Stock Watchlist

- Two-panel layout: left panel lists watched stocks, right panel shows filtered news
- Search stocks by symbol or company name (queries Supabase `nse_stocks`)
- Add/remove stocks (persisted via Supabase)
- Click a stock to filter its news feed; click again to show all
- Navigate to Company Fundamentals page via chart icon button per stock

### `CompanyFundamentals.jsx` — Full Company Analysis

**Complete financial analysis page** accessible at `/company/<symbol>`:
- **Header**: Company name (longName), current price with change %, symbol, website
- **Ratios grid**: Market Cap, CMP, Stock P/E, P/B, Dividend Yield, ROE, Net Margin, Debt/Equity, EPS (TTM), 52W Range, Shares Outstanding, Float
- **Tabs**: Overview | Chart | Profit & Loss | Balance Sheet | Cash Flow
- **Overview tab**: Valuation cards (Enterprise Value, Market Cap, P/E, P/B) + Operating metrics (Margins, ROA, ROE, Debt/Equity, Dividend Yield) + About section
- **Chart tab**: Full TradingView Advanced Chart with timeframes, indicators, drawing tools
- **Financial tables**: Annual/Quarterly toggle for P&L, Balance Sheet, Cash Flow with key metrics highlighted
- **Refresh button** to re-fetch live data

### `Tradingviewchart.jsx` — TradingView Integration

- Embeds TradingView's free Advanced Chart widget
- Passes the complete company name (e.g., "Reliance Industries Ltd") as the symbol for TradingView's search
- Supports NSE/BSE exchange switching
- Dark theme, India locale, Asia/Kolkata timezone
- Full TradingView features: timeframe switcher, indicators, drawing tools, fullscreen

### `StockChart.jsx` — Recharts Price Chart

- Alternative chart using Recharts (line chart)
- Period selector: 1M, 3M, 6M, 1Y, 5Y, MAX
- Custom tooltip showing Open/High/Low/Close/Volume
- Fetches data from `/api/chart/{symbol}` endpoint

### `FeedItem.jsx` — Filing Alert Card

- Displays each filing alert with: symbol, event category, materiality badge (MATERIAL tag), alert message, page number
- Collapsible verbatim source quote toggle
- Sanitized text rendering for clean display

### `StatusBar.jsx` — Connection Status

- Shows LIVE (green, pulsing) / CONNECTING (yellow) / OFFLINE (red) indicator
- Displays current session date and filing count
- Live clock updating every second

---

## Data Flow

```
NSE API ──▶ announcements_nse.py ──▶ downloaded_files/ (PDFs + .meta.json)
                                               │
                                               ▼
                                     Parsing.py ──▶ parsed_output/ (JSON)
                                               │
                                               ▼
                                    newsextractor.py ──▶ news_output/ (JSON alerts)
                                               │
                                    ┌──────────┴──────────┐
                                    ▼                      ▼
                              Supabase news_items     SSE stream ──▶ Dashboard
                              (persistent storage)    (real-time feed)

User request ──▶ /api/fundamentals/{symbol} ──▶ yfinance ──▶ CompanyFundamentals page
User request ──▶ /api/chart/{symbol} ─────────▶ yfinance ──▶ StockChart / TradingViewChart
```

---

## Setup & Installation

### Prerequisites

- Python 3.12+
- Node.js 18+
- Supabase project (for auth, news_items, nse_stocks, watchlist_items tables)
- OpenRouter API key

### Backend Setup

```bash
# Clone the repository
git clone <repo-url>
cd NSE_AGENT_o

# Create .env file with your keys
cat > .env << EOF
OPENROUTER_KEY=sk-or-v1-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...
EOF

# Install Python dependencies (using uv)
uv sync

# Run the FastAPI server
uv run uvicorn dashboard_api:app --host 0.0.0.0 --port 8420 --reload
```

### Frontend Setup

```bash
cd Frontend

# Install dependencies
npm install

# Create .env file (optional, for custom API URLs)
cat > .env << EOF
VITE_API_URL=http://127.0.0.1:8420
VITE_SSE_URL=http://127.0.0.1:8420/api/stream
EOF

# Start dev server
npm run dev
```

### Running the Pipeline

```bash
# One-time run (downloads new filings, parses them, extracts news)
uv run pipeline.py

# Or run stages individually:
uv run -m Datapulling.announcements_nse   # Step 1: Download new filings
uv run -m Dataextraction.Parsing          # Step 2: Parse PDFs to JSON
uv run -m Execution.newsextractor         # Step 3: Extract news alerts via LLM

# View token usage report
python -c "from Execution.token_tracker import print_usage_summary; print_usage_summary()"
```

---

## Supabase Database Tables

### `nse_stocks`
| Column | Type | Description |
|---|---|---|
| symbol | text (PK) | Stock ticker symbol |
| company_name | text | Full company name |
| exchange | text | NSE / BSE |
| is_active | boolean | Whether the stock is tracked |
| sector | text | Industry sector |
| last_updated | timestamptz | Last sync timestamp |

### `news_items`
| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Auto-generated |
| symbol | text | Stock symbol |
| alert_message | text | LLM-generated news alert |
| event_category | text | Category (earnings, M&A, etc.) |
| has_material_development | boolean | Market-moving flag |
| page_number | int | Source page in filing |
| verbatim_source_quote | text | Exact quote for traceability |
| reporting_period | text | Fiscal period reference |
| source_filename | text | Original filing filename |
| filing_date | text | Broadcast date/time |
| created_at | timestamptz | Insertion timestamp |

### `watchlist_items`
| Column | Type | Description |
|---|---|---|
| id | uuid (PK) | Auto-generated |
| user_id | uuid (FK → auth.users) | Owner |
| symbol | text | Stock symbol |
| display_order | int | Sort order |
| note | text | User note |
| added_at | timestamptz | When added |

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **LLM-based extraction** instead of rule-based parsing | NSE filings have no standardised format — LLMs handle the variance much better than regex/parsers |
| **SSE streaming** instead of WebSockets | Simpler protocol, auto-reconnect, works with standard HTTP infrastructure, sufficient for one-directional filing push |
| **Yahoo Finance for fundamentals** instead of NSE | Consistent, well-documented API via yfinance; NSE doesn't expose fundamentals directly |
| **SQLite + Supabase dual storage** | SQLite for local dedup/telemetry (zero infra); Supabase for user-facing persistence (watchlist, news items) |
| **Blocked subjects at poller level** | Preventing low-signal filings from ever entering the pipeline saves storage, parsing time, and LLM costs |
| **Per-cycle cost tracking in token_usage.db** | Gives queryable cost history: "How much did this pipeline run cost?" |
| **Display name instead of ticker symbol for charts** | TradingView resolves company names better; the full name (e.g., "Reliance Industries Ltd") searches correctly on TradingView's symbol database |

---

## Technologies Used

### Backend
- **Python 3.12** — Core language
- **FastAPI** — REST + SSE API server
- **yfinance** — Stock fundamentals & price data
- **OpenRouter API** — LLM access (GPT, Claude, etc.)
- **Pydantic** — Output schema validation
- **Supabase** — PostgreSQL database + Auth
- **SQLite** — Local dedup & telemetry
- **curl_cffi** — Bot-detection evasion for NSE scraping
- **pdfplumber / PyMuPDF** — PDF text extraction
- **APScheduler** — Periodic polling scheduler
- **httpx** — Async HTTP client for LLM calls

### Frontend
- **React 19** — UI framework
- **Vite** — Build tool and dev server
- **Recharts** — Stock price line charts
- **TradingView Chart** — Advanced technical analysis widget
- **Supabase JS client** — Database queries + Auth
- **React Router** — Client-side routing
- **Tailwind CSS** (via inline CSS variables) — Styling
- **Lucide React** — Icon library
- **Server-Sent Events** — Live data streaming

---

## License

MIT