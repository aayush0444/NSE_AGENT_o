import { useEffect, useRef, useId } from 'react';

/**
 * Embeds TradingView's free "Advanced Chart" widget for a given symbol.
 * Gives users native TradingView controls: timeframe switcher (1D/1W/1M/1Y/etc.),
 * drawing tools, indicators, and a fullscreen expand icon — all for free,
 * with zero load on our own backend.
 *
 * Docs: https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/
 */
// Update the dependency array and parameters to accept the short stock ticker symbol
export default function TradingViewChart({ symbol, exchange = 'NSE', height = 520 }) {
  const containerRef = useRef(null);
  const widgetRef = useRef(null);
  const reactId = useId();
  const containerId = `tv-chart-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    if (!symbol) return;

    let cancelled = false;

    function render() {
      if (cancelled || !containerRef.current) return;
      containerRef.current.innerHTML = '';
      
      // Construct a valid TradingView ticker identification string (e.g., "NSE:COCHINSHIP")
      const tradingViewSymbol = `${exchange}:${symbol}`;

      // eslint-disable-next-line no-undef
      widgetRef.current = new window.TradingView.widget({
  autosize: true,
  symbol: `BSE:${symbol.replace(/\.(NS|BO)$/i, '')}`,
  interval: 'D',
  timezone: 'Asia/Kolkata',
  theme: 'dark',
  style: '1',
  locale: 'in',
  toolbar_bg: 'rgba(0,0,0,0)',
  enable_publishing: false,
  withdateranges: true,
  hide_side_toolbar: false,
  allow_symbol_change: false,
  save_image: false,
  container_id: containerId,
  
  // ADD THESE TWO LINES FOR INTRADAY TIMEFRAMES:
  disabled_features: [], 
  enabled_features: ["use_localstorage_for_settings__experimental"],
});
    }

    if (window.TradingView && window.TradingView.widget) {
      render();
    } else {
      const existing = document.getElementById('tradingview-widget-script');
      if (existing) {
        existing.addEventListener('load', render, { once: true });
      } else {
        const script = document.createElement('script');
        script.id = 'tradingview-widget-script';
        script.src = 'https://s3.tradingview.com/tv.js';
        script.async = true;
        script.onload = render;
        document.body.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
    };
    // Update dependencies to watch the ticker 'symbol' instead of 'companyName'
  }, [symbol, exchange, containerId]);

  return (
    <div className="rounded-xl border border-(--color-border-primary) bg-(--color-bg-secondary) overflow-hidden">
      <div
        id={containerId}
        ref={containerRef}
        style={{ height, width: '100%' }}
      />
    </div>
  );
}