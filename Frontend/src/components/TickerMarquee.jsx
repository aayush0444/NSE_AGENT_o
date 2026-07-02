export default function TickerMarquee({ watchlist = [] }) {
  const symbols = watchlist.map((w) => w.symbol);
  const display =
    symbols.length > 0 ? [...symbols, ...symbols] : ['ADD STOCKS TO YOUR WATCHLIST'];

  return (
    <div className="ticker-wrapper">
      <div className="ticker-track">
        {display.map((sym, i) => (
          <span key={i} className="ticker-item">
            {sym}
          </span>
        ))}
      </div>
    </div>
  );
}