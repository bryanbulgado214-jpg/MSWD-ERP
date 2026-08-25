import { useCallback, useEffect, useState } from 'react';

import {
  CashierCollectionApiError,
  createArea,
  createCollector,
  deleteArea,
  deleteCollector,
  listAreas,
  listCollectors,
  updateArea,
  updateCollector,
  type CollectionArea,
  type Collector,
} from '../cashierCollectionApi';

import BillingSubNav from './BillingSubNav';
import './billing.css';

export default function CollectionSetupPage() {
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [areas, setAreas] = useState<CollectionArea[]>([]);
  const [error, setError] = useState('');
  const [newCollector, setNewCollector] = useState('');
  const [newCollectorIsCashier, setNewCollectorIsCashier] = useState(false);
  const [newArea, setNewArea] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [c, a] = await Promise.all([listCollectors(), listAreas()]);
      setCollectors(c);
      setAreas(a);
    } catch (e) {
      setError(e instanceof CashierCollectionApiError ? e.message : 'Failed to load.');
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
    <div className="bill-page">
      <BillingSubNav />
      <h1>Collection Setup</h1>
      <p style={{ color: '#667085', fontSize: 13, marginTop: -6, marginBottom: 18, maxWidth: 760 }}>
        Maintain the collector and collection-area lists the cashier picks from when keying the
        daily collection report. Add each field teller and the cashier&apos;s own name.
      </p>

      {error && (
        <div className="bill-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Collectors */}
        <div style={{ flex: '1 1 380px', minWidth: 0 }}>
          <h2 style={{ fontSize: 16 }}>Collectors (tellers + cashier)</h2>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              marginBottom: 12,
              flexWrap: 'wrap',
            }}
          >
            <input
              style={{ ...inputStyle, flex: '1 1 160px' }}
              placeholder="Collector name"
              value={newCollector}
              onChange={(e) => setNewCollector(e.target.value)}
            />
            <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={newCollectorIsCashier}
                onChange={(e) => setNewCollectorIsCashier(e.target.checked)}
              />
              Cashier
            </label>
            <button
              type="button"
              className="bill-btn bill-btn--primary bill-btn--sm"
              disabled={!newCollector.trim()}
              onClick={() =>
                run(async () => {
                  await createCollector({
                    name: newCollector.trim(),
                    isCashier: newCollectorIsCashier,
                  });
                  setNewCollector('');
                  setNewCollectorIsCashier(false);
                })
              }
            >
              Add
            </button>
          </div>
          <table className="bill-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Active</th>
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
                    No collectors yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Areas */}
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <h2 style={{ fontSize: 16 }}>Collection Areas</h2>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              style={{ ...inputStyle, flex: '1 1 auto' }}
              placeholder="Area name"
              value={newArea}
              onChange={(e) => setNewArea(e.target.value)}
            />
            <button
              type="button"
              className="bill-btn bill-btn--primary bill-btn--sm"
              disabled={!newArea.trim()}
              onClick={() =>
                run(async () => {
                  await createArea({ name: newArea.trim() });
                  setNewArea('');
                })
              }
            >
              Add
            </button>
          </div>
          <table className="bill-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Active</th>
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
                    No areas yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
