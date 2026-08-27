import { useCallback, useEffect, useState } from 'react';

import {
  CashierCollectionApiError,
  createArea,
  deleteArea,
  listAreas,
  updateArea,
  type CollectionArea,
} from '../../billing/cashierCollectionApi';
import '../../billing/pages/billing.css';

/**
 * Manage the list of collection centers / locations that the daily Cashier
 * Report picks from. Cashier-maintained.
 */
export function CollectionLocationsPage() {
  const [areas, setAreas] = useState<CollectionArea[]>([]);
  const [error, setError] = useState('');
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setAreas(await listAreas());
    } catch (e) {
      setError(e instanceof CashierCollectionApiError ? e.message : 'Failed to load locations.');
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

  function add() {
    if (!name.trim()) return;
    run(async () => {
      await createArea({ name: name.trim() });
      setName('');
    });
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, margin: '4px 0 2px' }}>Collection Locations</h2>
      <p style={{ color: '#667085', fontSize: 13, margin: '0 0 16px', maxWidth: 720 }}>
        The collection centers / locations that appear in the daily Cashier Report&apos;s dropdown.
      </p>

      {error && (
        <div className="bill-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          style={{ ...inputStyle, flex: '1 1 260px' }}
          placeholder="Location / collection center name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
        />
        <button
          type="button"
          className="bill-btn bill-btn--primary bill-btn--sm"
          disabled={!name.trim()}
          onClick={add}
        >
          Add location
        </button>
      </div>

      <table className="bill-table" style={{ maxWidth: 560 }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {areas.map((a) => (
            <tr key={a.id} style={{ opacity: a.isActive ? 1 : 0.5 }}>
              <td>{a.name}</td>
              <td>
                <button
                  type="button"
                  className="bill-link"
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() =>
                    run(() => updateArea(a.id, { name: a.name, isActive: !a.isActive }))
                  }
                  title="Click to activate / deactivate"
                >
                  {a.isActive ? 'Active' : 'Inactive'}
                </button>
              </td>
              <td>
                <button
                  type="button"
                  onClick={() => run(() => deleteArea(a.id))}
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
          {areas.length === 0 && (
            <tr>
              <td colSpan={3} style={{ color: '#98a2b3' }}>
                No locations yet — add one above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
