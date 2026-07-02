import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWatchlist } from '../hooks/useWatchlist';
import { useNewsFeed } from '../hooks/useNewsFeed';
import { useStockSearch } from '../hooks/useStockSearch';
import FeedItem from '../components/FeedItem';
import { LineChart } from 'lucide-react'; // Import LineChart icon

// Built-in SVG Icons
const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
);
const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
);
const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
);
const LoaderIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
);

export default function Watchlist() {
  const navigate = useNavigate();
  // Safety: Ensure hooks return values or provide defaults
  const watchlistHook = useWatchlist() || { watchlist: [], addStock: () => {}, removeStock: () => {} };
  const { watchlist, addStock, removeStock } = watchlistHook;
  
  const searchHook = useStockSearch() || { results: [], search: () => {}, clearResults: () => {} };
  const { results, search, clearResults } = searchHook;

  const [query, setQuery] = useState('');
  const [activeSymbol, setActiveSymbol] = useState(null); // Reintroduce activeSymbol

  const symbols = watchlist ? watchlist.map((w) => w.symbol) : [];
  const filterSymbols = activeSymbol ? [activeSymbol] : symbols; // Reintroduce filterSymbols
  
  const newsHook = useNewsFeed(filterSymbols) || { news: [], loading: false }; // Use filterSymbols
  const { news, loading } = newsHook;

  function handleSearch(e) {
    const val = e.target.value;
    setQuery(val);
    search(val);
  }

  function handleAdd(symbol) {
    addStock(symbol);
    setQuery('');
    clearResults();
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-[var(--color-bg-primary)] overflow-hidden">
      {/* LEFT PANEL */}
      <div className="flex h-full w-full max-w-xs flex-col border-r border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
        <div className="border-b border-[var(--color-border-primary)] px-6 py-4">
          <h2 className="font-sans text-xs font-bold tracking-widest text-[var(--color-accent-primary)] uppercase mb-1">Watchlist</h2>
          <p className="font-sans text-sm text-[var(--color-text-secondary)]">{symbols.length} stocks tracked</p>
        </div>

        <div className="relative border-b border-[var(--color-border-primary)] px-4 py-3">
          <div className="relative">
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--color-text-muted)]">
              <SearchIcon />
            </div>
            <input
              className="w-full pl-9 pr-3 py-2 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-lg font-sans text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-primary)]"
              placeholder="Add stock..."
              value={query}
              onChange={handleSearch}
              onBlur={() => setTimeout(clearResults, 150)}
            />
          </div>

          {results && results.length > 0 && (
            <div className="absolute left-4 right-4 top-full mt-2 z-50 max-h-64 overflow-y-auto border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] rounded-lg shadow-xl">
              {results.map((stock) => {
                const inList = symbols.includes(stock.symbol);
                return (
                  <div
                    key={stock.symbol}
                    onMouseDown={() => !inList && handleAdd(stock.symbol)}
                    className={`flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-border-primary)] transition-colors ${inList ? 'opacity-50' : 'cursor-pointer hover:bg-[var(--color-bg-hover)]'}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[var(--color-accent-primary)]">{stock.symbol}</div>
                      <div className="text-xs text-[var(--color-text-muted)] truncate">{stock.company_name}</div>
                    </div>
                    <div>{inList ? <CheckIcon /> : <PlusIcon />}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {symbols.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center opacity-60">
              <SearchIcon />
              <p className="font-sans text-sm">No stocks yet. Search above to add.</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border-primary)]">
              {watchlist.map((w, i) => {
                const isActive = activeSymbol === w.symbol; // Reintroduce isActive
                return (
                  <div
                    key={w.symbol}
                    onClick={() => setActiveSymbol(isActive ? null : w.symbol)} // Revert click behavior
                    className={`flex items-center justify-between gap-3 px-4 py-3 cursor-pointer transition-all border-l-4 ${isActive ? 'border-l-[var(--color-accent-primary)] bg-[var(--color-bg-hover)]' : 'border-l-transparent hover:bg-[var(--color-bg-hover)]'}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="font-mono text-xs text-[var(--color-text-muted)]">{String(i + 1).padStart(2, '0')}</span>
                      <span className={`font-mono text-sm font-bold ${isActive ? 'text-[var(--color-accent-primary)]' : 'text-[var(--color-text-primary)]'}`}>{w.symbol}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/company/${w.symbol}`); }} // New button for navigation
                      className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-accent-primary)]"
                      title="View Fundamentals"
                    >
                      <LineChart size={16} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeStock(w.symbol); if (activeSymbol === w.symbol) setActiveSymbol(null); }}
                      className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
                    ><XIcon /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-6 py-4">
          <div className="flex items-center gap-2">
            <h2 className="font-sans text-xs font-bold tracking-widest text-[var(--color-text-muted)] uppercase">Filings</h2>
            <span className="text-[var(--color-border-primary)]">·</span>
            <span className="font-mono text-sm font-semibold text-[var(--color-accent-primary)]">{activeSymbol || 'ALL WATCHLIST'}</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-[var(--color-text-muted)]">
            {loading ? <><LoaderIcon className="animate-spin" /><span>Loading...</span></> : <span>{news ? news.length : 0} filings</span>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {symbols.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center opacity-60">
              <h3 className="font-sans text-lg font-semibold">No stocks added</h3>
              <p className="font-sans text-sm">Add stocks from the left panel to see filings</p>
            </div>
          ) : news && news.length > 0 ? (
            <div className="divide-y divide-[var(--color-border-primary)]">
              {news.map((item) => <FeedItem key={item.id} item={item} />)}
            </div>
          ) : !loading && (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center opacity-60">
              <h3 className="font-sans text-lg font-semibold">No filings found</h3>
              <p className="font-sans text-sm">No recent filings for {activeSymbol || 'these stocks'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
