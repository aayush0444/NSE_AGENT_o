import { useState } from 'react';
import { Link } from 'react-router-dom';

// Built-in SVG Icons
const ChevronDown = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6"/></svg>
);
const ChevronUp = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m18 15-6-6-6 6"/></svg>
);
const AlertCircle = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
);
const TrendingUp = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
);

function sanitizeText(text) {
  if (!text) return '';
  return text
    .replace(/â€[\s\S]?/g, (m) => {
      if (m.includes('‑')) return '-';
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function formatCategory(cat) {
  if (!cat) return 'UPDATE';
  return cat.replace(/_/g, ' ').toUpperCase();
}

export default function FeedItem({ item }) {
  const [sourceOpen, setSourceOpen] = useState(false);

  // Safety check for item
  if (!item) return null;

  const isMaterial = item.has_material_development;
  const symbol = item.company_symbol;

  return (
    <article
      className={`group relative border-l-4 px-6 py-4 transition-all duration-200 hover:bg-[var(--color-bg-hover)] ${
        isMaterial ? 'border-l-[var(--color-warning)]' : 'border-l-[var(--color-accent-primary)]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-[var(--color-accent-primary)]">
            {symbol || 'N/A'}
          </span>
          <span className="text-[var(--color-border-primary)]">·</span>
          <span className="font-sans text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
            {formatCategory(item.event_category)}
          </span>

          {isMaterial && (
            <div className="flex items-center gap-1 px-2 py-1 bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30 rounded-md">
              <AlertCircle className="text-[var(--color-warning)]" />
              <span className="font-sans text-xs font-bold text-[var(--color-warning)]">MATERIAL</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-[var(--color-text-muted)]">
            {item.filing_date || 'No Date'}
          </span>

          {symbol && (
            <Link
              to={`/company/${symbol}`}
              className="flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent-primary)] hover:border-[var(--color-accent-primary)]/50 transition-colors"
            >
              <TrendingUp />
              <span className="font-sans text-xs font-semibold whitespace-nowrap">View Fundamentals</span>
            </Link>
          )}
        </div>
      </div>

      <p className="font-sans text-base leading-relaxed text-[var(--color-text-primary)] mb-3">
        {sanitizeText(item.alert_message)}
      </p>

      <div className="flex items-center gap-4 font-mono text-xs text-[var(--color-text-muted)]">
        {item.page_number != null && (
          <span className="px-2 py-1 bg-[var(--color-bg-secondary)] rounded border border-[var(--color-border-primary)]">
            p.{item.page_number}
          </span>
        )}

        {item.verbatim_source_quote && (
          <button
            type="button"
            onClick={() => setSourceOpen(!sourceOpen)}
            className="flex items-center gap-1 px-2 py-1 rounded hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
          >
            {sourceOpen ? (
              <><ChevronUp /><span>Hide source</span></>
            ) : (
              <><ChevronDown /><span>View source</span></>
            )}
          </button>
        )}
      </div>

      {sourceOpen && item.verbatim_source_quote && (
        <div className="mt-4 p-4 bg-[var(--color-bg-secondary)] border-l-2 border-[var(--color-accent-primary)] rounded animate-in fade-in duration-300">
          <p className="font-mono text-sm italic text-[var(--color-text-secondary)] leading-relaxed">
            "{sanitizeText(item.verbatim_source_quote)}"
          </p>
        </div>
      )}
    </article>
  );
}