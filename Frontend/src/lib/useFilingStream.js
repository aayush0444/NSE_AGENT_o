import { useEffect, useRef, useState, useCallback } from 'react';

// Point this at your backend's SSE endpoint. Set VITE_SSE_URL in a .env file
// (see .env.example) instead of editing this line directly.
const SSE_URL = import.meta.env.VITE_SSE_URL || 'http://127.0.0.1:8420/api/stream';
console.log('SSE_URL is:', SSE_URL);

const MAX_ITEMS = 300;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

function todayKey(date = new Date()) {
  return date.toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
}

function msUntilNextMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}

// Deterministic id from content, so a reconnect that replays the same
// filing doesn't create a duplicate card on the wire.
function factId(filing, fact, index) {
  const raw = `${filing.company_symbol}|${filing.filing_date}|${fact.subject_entity}|${fact.event_category}|${index}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return `f_${hash}`;
}

export function useFilingStream() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('connecting'); // connecting | live | offline
  const [sessionDate, setSessionDate] = useState(todayKey());

  const esRef = useRef(null);
  const attemptRef = useRef(0);
  const seenIds = useRef(new Set());
  const reconnectTimer = useRef(null);

  const ingest = useCallback((filing) => {
    if (!filing || !Array.isArray(filing.facts)) return;

    const fresh = filing.facts
      .map((fact, idx) => ({
        id: factId(filing, fact, idx),
        company_symbol: filing.company_symbol,
        filing_date: filing.filing_date,
        has_material_development: !!filing.has_material_development,
        receivedAt: Date.now(),
        ...fact,
      }))
      .filter((it) => {
        if (seenIds.current.has(it.id)) return false;
        seenIds.current.add(it.id);
        return true;
      });

    if (fresh.length === 0) return;
    setItems((prev) => [...fresh.reverse(), ...prev].slice(0, MAX_ITEMS));
  }, []);

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close();
    setStatus('connecting');

    const es = new EventSource(SSE_URL);
    esRef.current = es;

    es.onopen = () => {
      attemptRef.current = 0;
      setStatus('live');
    };

    // Default, unnamed SSE events: `data: {...}\n\n`
    es.onmessage = (evt) => {
      try {
        ingest(JSON.parse(evt.data));
      } catch (err) {
        console.error('Could not parse filing payload', err, evt.data);
      }
    };

    // Also support a named event, in case your backend sends `event: filing`.
    es.addEventListener('filing', (evt) => {
      try {
        ingest(JSON.parse(evt.data));
      } catch (err) {
        console.error('Could not parse filing payload', err, evt.data);
      }
    });

    es.onerror = () => {
      setStatus('offline');
      es.close();
      const attempt = attemptRef.current + 1;
      attemptRef.current = attempt;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
      reconnectTimer.current = setTimeout(connect, delay);
    };
  }, [ingest]);

  // Daily reset: clear the wire at local midnight and start a fresh session.
  useEffect(() => {
    const timer = setTimeout(() => {
      setItems([]);
      seenIds.current.clear();
      setSessionDate(todayKey());
    }, msUntilNextMidnight() + 250);
    return () => clearTimeout(timer);
  }, [sessionDate]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  return { items, status, sessionDate };
}