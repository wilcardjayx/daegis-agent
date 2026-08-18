import { useState, useEffect } from 'react';

export function useSearchHistory(key = 'daegis_search_history', maxItems = 5) {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load search history", e);
    }
  }, [key]);

  const addSearch = (term: string) => {
    if (!term) return;
    setHistory(prev => {
      const filtered = prev.filter(item => item !== term);
      const next = [term, ...filtered].slice(0, maxItems);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch (e) {
        // ignore
      }
      return next;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(key);
    } catch (e) {
      // ignore
    }
  };

  return { history, addSearch, clearHistory };
}
