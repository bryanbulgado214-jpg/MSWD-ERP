import { useCallback, useEffect, useState } from 'react';

import {
  CashierCollectionApiError,
  createCollector,
  deleteCollector,
  listCollectors,
  updateCollector,
  type Collector,
} from '../../billing/cashierCollectionApi';
import '../../billing/pages/billing.css';

/**
 * Manage the list of tellers (and the cashier) that the daily Cashier Report
 * picks from. Cashier-maintained — same idea as the accountant's list of payees.
 */
export function TellersPage() {
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [isCashier, setIsCashier] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setCollectors(await listCollectors());
    } catch (e) {
      setError(e instanceof CashierCollectionApiError ? e.message : 'Failed to load tellers.');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  function run(fn: () => Promise<unknown>) {
    fn()
      .then(load)
      .catch((e) =>
        setError(e instanceof CashierCollectionApiError ? e.message : 'Action failed.'),
      );
  }

  const inputStyle: React.CSSProperties = {
    padding: '7px 9px',
    border: '1px solid #d0d5dd',
    borderRadius: 6,
    fontSize: 13,
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, margin: '4px 0 2px' }}>Tellers</h2>
      <p style={{ color: '#667085', fontSize: 13, margin: '0 0 16px', maxWidth: 720 }}>
        The tellers (and the cashier) that appear in the daily Cashier Report&apos;s dropdown. Add
        each field teller here; tick <strong>Cashier</strong> for the cashier&apos;s own entry.
      </p>

      {error && (
        <div className="bill-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <input
          style={{ ...inputStyle, flex: '1 1 240px' }}
          placeholder="Teller name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim())
              run(async () => {
                await createCollector({ name: name.trim(), isCashier });
                setName('');
                setIsCashier(false);
              });
          }}
        />
        <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={isCashier}
            onChange={(e) => setIsCashier(e.target.checked)}
          />
          Cashier
        </label>
        <button
          type="button"
          className="bill-btn bill-btn--primary bill-btn--sm"
          disabled={!name.trim()}
          onClick={() =>
            run(async () => {
              await createCollector({ name: name.trim(), isCashier });
              setName('');
              setIsCashier(false);
            })
          }
        >
          Add teller
        </button>
      </div>

      <table className="bill-table" style={{ maxWidth: 640 }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {collectors.map((c) => (
            <tr key={c.id} style={{ opacity: c.isActive ? 1 : 0.5 }}>
              <td>{c.name}</td>
              <td>{c.isCashier ? 'Cashier' : 'Teller'}</td>
              <td>
                <button
                  type="button"
                  className="bill-link"
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() =>
                    run(() => updateCollector(c.id, { name: c.name, isActive: !c.isActive }))
                  }
                  title="Click to activate / deactivate"
                >
                  {c.isActive ? 'Active' : 'Inactive'}
                </button>
              </td>
              <td>
                <button
                  type="button"
                  onClick={() => run(() => deleteCollector(c.id))}
                  style={{
                    color: '#b42318',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {collectors.length === 0 && (
            <tr>
              <td colSpan={4} style={{ color: '#98a2b3' }}>
                No tellers yet — add one above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
