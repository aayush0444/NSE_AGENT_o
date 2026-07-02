import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function useStockSearch() {
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  async function search(query) {
    if (!query || query.length < 1) {
      setResults([])
      return
    }

    setSearching(true)

    const { data, error } = await supabase
      .from('nse_stocks')
      .select('symbol, company_name, sector')
      .or(`symbol.ilike.${query}%,company_name.ilike.%${query}%`)
      .eq('is_active', true)
      .limit(10)

    if (!error) setResults(data)
    setSearching(false)
  }

  function clearResults() {
    setResults([])
  }

  return { results, searching, search, clearResults }
}
