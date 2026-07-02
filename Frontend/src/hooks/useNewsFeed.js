import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useNewsFeed(symbols = []) {
  const [news, setNews] = useState([])
  const [loading, setLoading] = useState(true)

  const symbolsKey = useMemo(() => symbols.join(','), [symbols])
  const stableSymbols = useMemo(() => (symbolsKey ? symbolsKey.split(',') : []), [symbolsKey])

  useEffect(() => {
    let cancelled = false

    if (stableSymbols.length === 0) {
      setNews([])
      setLoading(false)
      return () => { cancelled = true }
    }

    const channel = supabase
      .channel('news-feed')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'news_items',
      }, (payload) => {
        if (stableSymbols.includes(payload.new.symbol)) {
          setNews(prev => [payload.new, ...prev])
        }
      })
      .subscribe()

    async function fetchNews() {
      setLoading(true)
      const { data, error } = await supabase
        .from('news_items')
        .select('*')
        .in('symbol', stableSymbols)
        .order('filing_date', { ascending: false })
        .limit(100)

      if (!cancelled) {
        if (!error) setNews(data)
        setLoading(false)
      }
    }

    fetchNews()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [stableSymbols])

  return { news, loading }
}
