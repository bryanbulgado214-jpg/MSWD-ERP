import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { globalSearch, type SearchResult } from './searchApi';
import './search.css';

const CATEGORY_ICON: Record<string, string> = {
  'Journal Entries': '📒',
  'Disbursement Vouchers': '📤',
  Checks: '💳',
  Collections: '🧾',
};

function peso(v: string) {
  const n = parseFloat(v);
  return isNaN(n) ? '' : n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function SearchResultsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [input, setInput] = useState(q);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    if (!q.trim()) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError('');
    globalSearch(q)
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : 'Search failed.'))
      .finally(() => setLoading(false));
  }, [q]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = input.trim();
    setParams(v ? { q: v } : {});
  }

  return (
    <div className="search-page">
      <h1>Search</h1>
      <form onSubmit={submit} className="search-page__form" role="search">
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search by name, amount, OR / DV / check number…"
        />
        <button type="submit" className="search-page__btn">
          Search
        </button>
      </form>

      {loading && <div className="search-page__muted">Searching…</div>}
      {error && <div className="search-page__error">{error}</div>}

      {!loading && !q.trim() && (
        <div className="search-page__muted">
          Type a name, amount, or document number above to search across journal entries,
          disbursement vouchers, checks, and collections.
        </div>
      )}

      {!loading && result && result.total === 0 && (
        <div className="search-page__muted">
          No results for “{result.query}”. Try a different name, amount, or number.
        </div>
      )}

      {!loading && result && result.total > 0 && (
        <>
          <p className="search-page__muted">
            {result.total} result{result.total === 1 ? '' : 's'} for “{result.query}”
          </p>
          {result.groups.map((g) => (
            <section key={g.category} className="search-group">
              <h2 className="search-group__title">
                <span className="search-group__icon">{CATEGORY_ICON[g.category] ?? '•'}</span>
                {g.category}
                <span className="search-group__count">{g.items.length}</span>
              </h2>
              <div className="search-group__list">
                {g.items.map((it) => (
                  <Link key={it.id} to={it.link} className="search-item">
                    <div className="search-item__main">
                      <span className="search-item__label">{it.label}</span>
                      <span className="search-item__desc">{it.description}</span>
                    </div>
                    <div className="search-item__meta">
                      {peso(it.amount) && (
                        <span className="search-item__amt">{peso(it.amount)}</span>
                      )}
                      <span className="search-item__sub">
                        {fmtDate(it.date)}
                        {it.status ? ` · ${it.status}` : ''}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
