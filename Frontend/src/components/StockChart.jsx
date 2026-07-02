import { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8420';

function joinUrl(base, path) {
  const b = (base || '').replace(/\/+$/, '');
  const p = (path || '').replace(/^\/+/, '');
  return `${b}/${p}`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-3 shadow-lg">
        <p className="font-sans text-sm font-semibold text-[var(--color-text-primary)]">{label}</p>
        <p className="font-mono text-xs text-[var(--color-text-secondary)]">Open: {data.open?.toFixed(2)}</p>
        <p className="font-mono text-xs text-[var(--color-text-secondary)]">High: {data.high?.toFixed(2)}</p>
        <p className="font-mono text-xs text-[var(--color-text-secondary)]">Low: {data.low?.toFixed(2)}</p>
        <p className="font-mono text-xs text-[var(--color-text-secondary)]">Close: {data.close?.toFixed(2)}</p>
        <p className="font-mono text-xs text-[var(--color-text-secondary)]">Volume: {data.volume?.toLocaleString()}</p>
      </div>
    );
  }
  return null;
};

export default function StockChart() {
  const { symbol: rawSymbol } = useParams();
  const symbol = String(rawSymbol || '').toUpperCase();
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('1y'); // Default period

  const fetchChartData = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError('');
    try {
      const url = joinUrl(API_BASE, `/api/chart/${encodeURIComponent(symbol)}?exchange=NS&period=${period}`);
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || `Request failed (${res.status})`);
      }
      const json = await res.json();
      setChartData(json);
    } catch (e) {
      setError(e?.message || 'Could not load chart data');
      setChartData([]);
    } finally {
      setLoading(false);
    }
  }, [symbol, period]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  const periodOptions = [
    { label: '1M', value: '1mo' },
    { label: '3M', value: '3mo' },
    { label: '6M', value: '6mo' },
    { label: '1Y', value: '1y' },
    { label: '5Y', value: '5y' },
    { label: 'MAX', value: 'max' },
  ];

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-6 py-10 text-center">
        <div className="font-sans text-sm text-[var(--color-text-secondary)]">Loading chart data…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-6 py-10 text-center">
        <div className="font-sans text-sm text-[var(--color-error)]">{error}</div>
        <div className="mt-2 font-sans text-xs text-[var(--color-text-muted)]">
          Try again or verify the symbol is available on Yahoo Finance for NSE (.NS).
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-4">
      <div className="flex justify-end mb-4">
        <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] p-1">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setPeriod(option.value)}
              className={`rounded-md px-3 py-1.5 font-sans text-xs font-medium transition-all ${
                period === option.value
                  ? 'bg-[var(--color-accent-primary)] text-[var(--color-bg-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-primary)" />
          <XAxis dataKey="date" stroke="var(--color-text-muted)" tickFormatter={(tick) => new Date(tick).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })} />
          <YAxis stroke="var(--color-text-muted)" domain={['auto', 'auto']} />
          <Tooltip content={<CustomTooltip />} />
          <Line type="monotone" dataKey="close" stroke="var(--color-accent-primary)" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
