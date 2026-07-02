import { useEffect, useState } from 'react';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const STATUS_META = {
  live: { label: 'LIVE', color: 'bg-[var(--color-success)]', textColor: 'text-[var(--color-success)]', pulse: true },
  connecting: { label: 'CONNECTING', color: 'bg-[var(--color-warning)]', textColor: 'text-[var(--color-warning)]', pulse: false },
  offline: { label: 'OFFLINE', color: 'bg-[var(--color-error)]', textColor: 'text-[var(--color-error)]', pulse: false },
};

export default function StatusBar({
  status = 'live',
  sessionDate = new Date().toISOString().slice(0, 10),
  newsCount = 0,
}) {
  const now = useClock();
  const meta = STATUS_META[status] || STATUS_META.offline;

  return (
    <div className="flex items-center justify-between border-b border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-6 py-3 font-sans text-sm text-[var(--color-text-secondary)]">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${meta.color} ${meta.pulse ? 'animate-pulse' : ''}`} />
          <span className={`font-mono font-bold text-xs tracking-wider ${meta.textColor}`}>{meta.label}</span>
        </div>
        <span className="text-[var(--color-border-primary)]">·</span>
        <span className="font-mono text-xs">{sessionDate}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold">{newsCount}</span>
          <span className="text-[var(--color-text-muted)]">filings today</span>
        </div>
        <span className="text-[var(--color-border-primary)]">·</span>
        <span className="font-mono text-xs font-semibold">
          {now.toLocaleTimeString('en-IN', { hour12: false })}
        </span>
      </div>
    </div>
  );
}
