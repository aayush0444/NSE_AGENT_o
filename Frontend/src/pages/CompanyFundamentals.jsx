import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Star } from 'lucide-react';
import TradingViewChart from './Tradingviewchart';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8420';

const RefreshIcon = ({ className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </svg>
);

function joinUrl(base, path) {
  const b = (base || '').replace(/\/+$/, '');
  const p = (path || '').replace(/^\/+/, '');
  return `${b}/${p}`;
}

function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function isNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function formatCompactNumber(n) {
  if (!isNumber(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return `${n.toFixed(0)}`;
}

function formatCrores(n) {
  if (!isNumber(n)) return '—';
  return `${(n / 1e7).toFixed(2)} Cr`;
}

function formatPercent(ratio) {
  if (!isNumber(ratio)) return '—';
  return `${(ratio * 100).toFixed(2)}%`;
}

function formatSignedPercent(value) {
  if (!isNumber(value)) return '';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatMaybeNumber(v) {
  if (!isNumber(v)) return '—';
  if (Math.abs(v) >= 1e7) { // If absolute value is 1 Crore or more
    return formatCrores(v);
  }
  return v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatDateLabel(s) {
  const raw = String(s || '').trim();
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
  }
  return raw.length > 18 ? raw.slice(0, 18) : raw;
}

function pickRows(table, preferredRows) {
  if (!table || !Array.isArray(table.index) || !Array.isArray(table.data)) return [];
  const index = table.index;
  const byKey = new Map(index.map((k, i) => [normalizeKey(k), i]));
  const rows = [];
  for (const key of preferredRows) {
    const idx = byKey.get(normalizeKey(key));
    if (typeof idx === 'number') rows.push(idx);
  }
  return rows;
}

function TableCard({ title, subtitle, table, rowOrder, valueHint }) {
  const hasData = table && Array.isArray(table.columns) && table.columns.length > 0 && Array.isArray(table.index) && table.index.length > 0;

  const cols = useMemo(() => (table?.columns || []).map(formatDateLabel), [table]);
  const rowIndexes = useMemo(() => {
    if (!hasData) return [];
    const picked = pickRows(table, rowOrder);
    return picked.length > 0 ? picked : table.index.map((_, i) => i).slice(0, 16);
  }, [hasData, rowOrder, table]);

  return (
    <div className="rounded-xl border border-(--color-border-primary) bg-(--color-bg-secondary) overflow-hidden">
      <div className="border-b border-(--color-border-primary) px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-sans text-sm font-semibold text-(--color-text-primary)">{title}</h3>
            {subtitle ? (
              <p className="mt-1 font-sans text-xs text-(--color-text-muted)">{subtitle}</p>
            ) : null}
          </div>
          {valueHint ? (
            <span className="shrink-0 rounded-md border border-(--color-border-primary) bg-(--color-bg-primary) px-2 py-1 font-mono text-[10px] text-(--color-text-muted)">
              {valueHint}
            </span>
          ) : null}
        </div>
      </div>

      {!hasData ? (
        <div className="px-6 py-6 font-sans text-sm text-(--color-text-secondary) opacity-70">
          No data available.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="bg-(--color-bg-tertiary)">
                <th className="sticky left-0 z-20 whitespace-nowrap border-b border-(--color-border-primary) bg-(--color-bg-tertiary) px-4 py-3 text-left font-sans text-xs font-semibold text-(--color-text-secondary)">
                  Metric
                </th>
                {cols.map((c, i) => (
                  <th key={`${c}_${i}`} className="whitespace-nowrap border-b border-(--color-border-primary) px-4 py-3 text-right font-sans text-xs font-semibold text-(--color-text-secondary)">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowIndexes.map((rowIdx) => {
                const label = table.index[rowIdx];
                const row = table.data[rowIdx] || [];
                return (
                  <tr key={label} className="odd:bg-(--color-bg-secondary) even:bg-(--color-bg-primary)">
                    <td className="sticky left-0 z-10 max-w-65 truncate border-b border-(--color-border-primary) bg-inherit px-4 py-3 font-sans text-sm text-(--color-text-primary)">
                      {label}
                    </td>
                    {row.map((v, i) => (
                      <td key={`${label}_${i}`} className="whitespace-nowrap border-b border-(--color-border-primary) px-4 py-3 text-right font-mono text-xs text-(--color-text-secondary)">
                        {typeof v === 'number' ? formatMaybeNumber(v) : (v ?? '—')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, subvalue }) {
  return (
    <div className="rounded-xl border border-(--color-border-primary) bg-(--color-bg-secondary) px-4 py-3">
      <div className="font-sans text-xs text-(--color-text-muted)">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-(--color-text-primary)">{value}</div>
      {subvalue ? (
        <div className="mt-1 font-sans text-[11px] text-(--color-text-tertiary)">{subvalue}</div>
      ) : null}
    </div>
  );
}

export default function CompanyFundamentals() {
  const navigate = useNavigate();
  const { symbol: rawSymbol } = useParams();
  const symbol = String(rawSymbol || '').toUpperCase();

  const [tab, setTab] = useState('overview');
  const [period, setPeriod] = useState('annual');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Optimization State: Tracks if the user has triggered the chart tab at least once
  const [hasLoadedChart, setHasLoadedChart] = useState(false);

  const load = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError('');
    try {
      const url = joinUrl(API_BASE, `/api/fundamentals/${encodeURIComponent(symbol)}?exchange=NS&include_quarterly=true`);
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || `Request failed (${res.status})`);
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e?.message || 'Could not load fundamentals');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    load();
  }, [load]);

  // Handle lazy loading trigger for the chart component
  useEffect(() => {
    if (tab === 'chart' && !hasLoadedChart) {
      setHasLoadedChart(true);
    }
  }, [tab, hasLoadedChart]);

  const info = data?.info || {};
  const tables = data?.tables || {};

  const displayName = info.longName || info.shortName || symbol;
  const price = info.currentPrice;
  const currency = info.currency || 'INR';
  const range = info.fiftyTwoWeekLow && info.fiftyTwoWeekHigh ? `${formatMaybeNumber(info.fiftyTwoWeekLow)} — ${formatMaybeNumber(info.fiftyTwoWeekHigh)}` : '—';

  const changePercent = info.regularMarketChangePercent;
  const changeIsPositive = isNumber(changePercent) && changePercent >= 0;
  const changeColorClass = changeIsPositive ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]';

  const ratioCards = [
    { label: 'Market Cap', value: isNumber(info.marketCap) ? `${formatCrores(info.marketCap)} ${currency}` : '—' },
    { label: 'CMP', value: isNumber(price) ? `${formatMaybeNumber(price)} ${currency}` : '—' },
    { label: 'Stock P/E', value: isNumber(info.trailingPE) ? formatMaybeNumber(info.trailingPE) : '—', subvalue: isNumber(info.forwardPE) ? `Forward: ${formatMaybeNumber(info.forwardPE)}` : '' },
    { label: 'P/B', value: isNumber(info.priceToBook) ? formatMaybeNumber(info.priceToBook) : '—', subvalue: isNumber(info.bookValue) ? `Book: ${formatMaybeNumber(info.bookValue)}` : '' },
    { label: 'Dividend Yield', value: formatPercent(info.dividendYield) },
    { label: 'ROE', value: formatPercent(info.returnOnEquity) },
    { label: 'Net Margin', value: formatPercent(info.profitMargins) },
    { label: 'Debt/Equity', value: isNumber(info.debtToEquity) ? formatMaybeNumber(info.debtToEquity) : '—' },
    { label: 'EPS (TTM)', value: isNumber(info.trailingEps) ? formatMaybeNumber(info.trailingEps) : '—' },
    { label: '52W Range', value: range },
    { label: 'Shares Out.', value: isNumber(info.sharesOutstanding) ? formatCompactNumber(info.sharesOutstanding) : '—' },
    { label: 'Float', value: isNumber(info.floatShares) ? formatCompactNumber(info.floatShares) : '—' },
  ];

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'chart', label: 'Chart' },
    { id: 'pl', label: 'Profit & Loss' },
    { id: 'bs', label: 'Balance Sheet' },
    { id: 'cf', label: 'Cash Flow' },
  ];

  const periodToggle = (
    <div className="flex items-center gap-1 rounded-lg border border-(--color-border-primary) bg-(--color-bg-primary) p-1">
      {[
        { id: 'annual', label: 'Annual' },
        { id: 'quarterly', label: 'Quarterly' },
      ].map((p) => {
        const active = period === p.id;
        return (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`rounded-md px-3 py-1.5 font-sans text-xs font-medium transition-all ${
              active
                ? 'bg-(--color-accent-primary) text-(--color-bg-primary)'
                : 'text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-hover)'
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );

  const financials = period === 'quarterly' ? tables.quarterly_financials : tables.financials;
  const balanceSheet = period === 'quarterly' ? tables.quarterly_balance_sheet : tables.balance_sheet;
  const cashflow = period === 'quarterly' ? tables.quarterly_cashflow : tables.cashflow;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-(--color-bg-primary)">
      <div className="border-b border-(--color-border-primary) bg-(--color-bg-secondary)">
        <div className="mx-auto flex items-center justify-between gap-4 px-6 py-4">
          {/* Left Section: Company Info */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-sans text-2xl font-bold text-(--color-text-primary)">{displayName}</h1>
              {isNumber(price) && (
                <span className="font-mono text-lg font-semibold text-(--color-text-primary)">
                  {formatMaybeNumber(price)} {currency}
                </span>
              )}
              {isNumber(changePercent) && (
                <span className={`font-mono text-sm ${changeColorClass}`}>
                  {formatSignedPercent(changePercent)}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-(--color-text-muted)">
              {info.website ? (
                <>
                  <a
                    href={info.website}
                    target="_blank"
                    rel="noreferrer"
                    className="font-sans text-xs text-(--color-accent-primary) hover:text-(--color-accent-light)"
                  >
                    {info.website.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0]}
                  </a>
                  <span className="text-(--color-border-primary)">·</span>
                </>
              ) : null}
              <span className="font-mono text-xs text-(--color-text-muted)">NSE: {symbol}</span>
              {info.exchange === 'BO' && (
                <>
                  <span className="text-(--color-border-primary)">·</span>
                  <span className="font-mono text-xs text-(--color-text-muted)">BSE: {info.symbol}</span>
                </>
              )}
            </div>
          </div>

          {/* Right Section: Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button className="inline-flex items-center gap-2 rounded-lg bg-(--color-accent-primary) px-3 py-2 font-sans text-sm font-semibold text-(--color-bg-primary) hover:bg-(--color-accent-dark)">
              <Star size={16} />
              Follow
            </button>
            <button
              onClick={load}
              className="inline-flex items-center gap-2 rounded-lg border border-(--color-border-primary) bg-(--color-bg-primary) px-3 py-2 font-sans text-sm text-(--color-text-secondary) hover:bg-(--color-bg-hover) hover:text-(--color-text-primary)"
            >
              <RefreshIcon className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto px-6 py-6">
        {loading ? (
          <div className="rounded-xl border border-(--color-border-primary) bg-(--color-bg-secondary) px-6 py-10 text-center">
                    <div className="font-sans text-sm text-(--color-text-secondary)">Loading fundamentals…</div>
                    <div className="mt-2 font-mono text-xs text-(--color-text-muted)">
                      Data on-demand · no caching
                    </div>
                  </div>
                ) : error ? (
                  <div className="rounded-xl border border-(--color-border-primary) bg-(--color-bg-secondary) px-6 py-10 text-center">
                    <div className="font-sans text-sm text-(--color-error)">{error}</div>
                    <div className="mt-2 font-sans text-xs text-(--color-text-muted)">
                      Try again or verify the symbol is available.
                    </div>
                  </div>
        ) : (
          <>
            {/* Core Snapshot Ratios Grid */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-(--color-border-primary) bg-(--color-bg-secondary) p-6">
                <div className="grid grid-cols-2 gap-y-3">
                  {ratioCards.slice(0, 6).map((c) => (
                    <div key={c.label} className="contents">
                      <div className="font-sans text-sm text-(--color-text-muted)">{c.label}</div>
                      <div className="font-mono text-sm font-semibold text-(--color-text-primary) text-right">
                        {c.value}
                        {c.subvalue && <span className="ml-2 text-[11px] text-(--color-text-tertiary)">{c.subvalue}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-(--color-border-primary) bg-(--color-bg-secondary) p-6">
                <div className="grid grid-cols-2 gap-y-3">
                  {ratioCards.slice(6, 12).map((c) => (
                    <div key={c.label} className="contents">
                      <div className="font-sans text-sm text-(--color-text-muted)">{c.label}</div>
                      <div className="font-mono text-sm font-semibold text-(--color-text-primary) text-right">
                        {c.value}
                        {c.subvalue && <span className="ml-2 text-[11px] text-(--color-text-tertiary)">{c.subvalue}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-(--color-border-primary) bg-(--color-bg-secondary) p-6">
                <h3 className="font-sans text-sm font-semibold text-(--color-text-primary) mb-4">About</h3>
                <p className="font-sans text-sm text-(--color-text-secondary) leading-relaxed">
                  {info.longBusinessSummary || 'No business summary available.'}
                </p>

                <h3 className="font-sans text-sm font-semibold text-(--color-text-primary) mt-6 mb-4">Key Points</h3>
                <ul className="list-disc list-inside font-sans text-sm text-(--color-text-secondary) space-y-1">
                  <li>Market Cap: {isNumber(info.marketCap) ? `${formatCrores(info.marketCap)} ${currency}` : '—'}</li>
                  <li>P/E Ratio: {isNumber(info.trailingPE) ? formatMaybeNumber(info.trailingPE) : '—'}</li>
                  <li>Sector: {info.sector || 'N/A'}</li>
                  <li>Industry: {info.industry || 'N/A'}</li>
                </ul>
              </div>
            </div>

            {/* Navigation Tab Layout Bar */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 rounded-lg border border-(--color-border-primary) bg-(--color-bg-secondary) p-1">
                {tabs.map((t) => {
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`rounded-md px-4 py-2 font-sans text-sm font-medium transition-all ${
                        active
                          ? 'bg-(--color-accent-primary) text-(--color-bg-primary)'
                          : 'text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-bg-hover)'
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {tab !== 'overview' && tab !== 'chart' ? periodToggle : null}
            </div>

            {/* Sub-view Rendering Blocks via Persistent Display States */}
            <div className="mt-4 space-y-4">
              
              {/* Overview Sub-cards */}
              <div className={tab === 'overview' ? 'block' : 'hidden'}>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-(--color-border-primary) bg-(--color-bg-secondary) px-6 py-5">
                    <h3 className="font-sans text-sm font-semibold text-(--color-text-primary)">Valuation</h3>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <StatCard label="Enterprise Value" value={isNumber(info.enterpriseValue) ? `${formatCrores(info.enterpriseValue)} ${currency}` : '—'} />
                      <StatCard label="Market Cap" value={isNumber(info.marketCap) ? `${formatCrores(info.marketCap)} ${currency}` : '—'} />
                      <StatCard label="P/E (Trailing)" value={isNumber(info.trailingPE) ? formatMaybeNumber(info.trailingPE) : '—'} />
                      <StatCard label="P/B" value={isNumber(info.priceToBook) ? formatMaybeNumber(info.priceToBook) : '—'} subvalue={isNumber(info.bookValue) ? `Book value: ${formatMaybeNumber(info.bookValue)}` : ''} />
                    </div>
                  </div>
                  <div className="rounded-xl border border-(--color-border-primary) bg-(--color-bg-secondary) px-6 py-5">
                    <h3 className="font-sans text-sm font-semibold text-(--color-text-primary)">Operating</h3>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <StatCard label="Net Margin" value={formatPercent(info.profitMargins)} />
                      <StatCard label="Operating Margin" value={formatPercent(info.operatingMargins)} />
                      <StatCard label="ROA" value={formatPercent(info.returnOnAssets)} />
                      <StatCard label="ROE" value={formatPercent(info.returnOnEquity)} />
                      <StatCard label="Debt/Equity" value={isNumber(info.debtToEquity) ? formatMaybeNumber(info.debtToEquity) : '—'} />
                      <StatCard label="Dividend Yield" value={formatPercent(info.dividendYield)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Chart Component Layout Block (Lazy loads on first click, stays alive afterwards) */}
              <div className={tab === 'chart' ? 'block' : 'hidden'}>
                {hasLoadedChart && (
                  <TradingViewChart 
                    symbol={symbol.replace(/\.(NS|BO)$/i, '')} 
                    exchange="BSE" 
                    height={560} 
                  />
                )}
              </div>

              {/* Profit & Loss Block */}
              <div className={tab === 'pl' ? 'block' : 'hidden'}>
                <TableCard
                  title="Profit & Loss"
                  subtitle={period === 'quarterly' ? 'Quarterly financials' : 'Annual financials'}
                  table={financials}
                  rowOrder={['Total Revenue', 'Cost Of Revenue', 'Operating Income', 'Ebit', 'Ebitda', 'Interest Expense', 'Net Income']}
                  valueHint="All values in Cr"
                />
              </div>

              {/* Balance Sheet Block */}
              <div className={tab === 'bs' ? 'block' : 'hidden'}>
                <TableCard
                  title="Balance Sheet"
                  subtitle={period === 'quarterly' ? 'Quarterly balance sheet' : 'Annual balance sheet'}
                  table={balanceSheet}
                  rowOrder={['Total Stockholder Equity', 'Stockholders Equity', 'Capital Stock', 'Retained Earnings', 'Total Debt', 'Long Term Debt', 'Investments', 'Cash And Cash Equivalents']}
                  valueHint="All values in Cr"
                />
              </div>

              {/* Cash Flow Block */}
              <div className={tab === 'cf' ? 'block' : 'hidden'}>
                <TableCard
                  title="Cash Flow"
                  subtitle={period === 'quarterly' ? 'Quarterly cash flow' : 'Annual cash flow'}
                  table={cashflow}
                  rowOrder={['Total Cash From Operating Activities', 'Total Cashflows From Investing Activities', 'Total Cash From Financing Activities', 'Free Cash Flow']}
                  valueHint="All values in Cr"
                />
              </div>

            </div>
          </>
        )}
      </div>
    </div>
  );
}