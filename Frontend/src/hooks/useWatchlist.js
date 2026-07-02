import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchWatchlist()
  }, [])

  async function fetchWatchlist() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data, error } = await supabase
      .from('watchlist_items')
      .select('symbol, display_order, note, added_at')
      .eq('user_id', user.id)
      .order('display_order', { ascending: true })

    if (!error) setWatchlist(data)
    setLoading(false)
  }

  async function addStock(symbol) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('watchlist_items')
      .insert({ user_id: user.id, symbol, display_order: watchlist.length })

    if (!error) setWatchlist(prev => [...prev, { symbol }])
  }

  async function removeStock(symbol) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('watchlist_items')
      .delete()
      .eq('user_id', user.id)
      .eq('symbol', symbol)

    if (!error) setWatchlist(prev => prev.filter(w => w.symbol !== symbol))
  }

  return { watchlist, loading, addStock, removeStock }
}
