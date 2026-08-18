import { useEffect, useState } from 'react';

import { generateDemoData, getDemoStatus, wipeDemoData } from '../api';

import { AdminSubNav } from './AdminSubNav';
import './admin.css';

export function DemoDataPage() {
  const [status, setStatus] = useState<{ present: boolean; jevCount: number } | null>(null);
  const [busy, setBusy] = useState<'generate' | 'wipe' | null>(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  function refresh() {
    getDemoStatus()
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load status.'));
  }

  useEffect(refresh, []);

  async function generate() {
    setBusy('generate');
    setError('');
    setFlash('');
    try {
      const r = await generateDemoData();
      setFlash(
        `Generated ${r.created} demo journal entries (Jan–Aug 2026). Reload the dashboard and reports to see them.`,
      );
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate demo data.');
    } finally {
      setBusy(null);
    }
  }

  async function wipe() {
    if (
      !window.confirm(
        'Remove all demo data? This deletes only the generated sample entries, not any real data.',
      )
    ) {
      return;
    }
    setBusy('wipe');
    setError('');
    setFlash('');
    try {
      const r = await wipeDemoData();
      setFlash(`Removed ${r.removed} demo entries. The books are back to their prior state.`);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to wipe demo data.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-page">
      <AdminSubNav />
      <h1>Demo Data</h1>
      <p style={{ color: '#667085', fontSize: 13, margin: '0 0 18px', maxWidth: 680 }}>
        Populate the system with realistic sample accounting entries for a client demonstration,
        then remove them in one click. The sample entries are tagged internally, so wiping deletes
        <strong> only the generated demo data</strong> and never touches real transactions.
      </p>

      <div
        style={{
          background: '#fffaeb',
          border: '1px solid #fec84b',
          color: '#93370d',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 13,
          marginBottom: 18,
          maxWidth: 680,
        }}
      >
        <strong>For demonstrations only.</strong> Wipe the demo data before you begin entering the
        district's real books.
      </div>

      {error && (
        <div className="admin-error" style={{ marginBottom: 12, maxWidth: 680 }}>
          {error}
        </div>
      )}
      {flash && (
        <div
          style={{
            background: '#ecfdf3',
            border: '1px solid #6ce9a6',
            color: '#027a48',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
            marginBottom: 14,
            maxWidth: 680,
          }}
        >
          {flash}
        </div>
      )}

      <div
        style={{
          border: '1px solid #eaecf0',
          borderRadius: 10,
          padding: 18,
          maxWidth: 680,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ fontSize: 14 }}>
          Status:{' '}
          {status == null ? (
            <span style={{ color: '#98a2b3' }}>checking…</span>
          ) : status.present ? (
            <strong style={{ color: '#027a48' }}>
              {status.jevCount} demo entries currently loaded
            </strong>
          ) : (
            <strong style={{ color: '#475467' }}>No demo data loaded</strong>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            onClick={generate}
            disabled={busy !== null || (status?.present ?? false)}
            title={status?.present ? 'Wipe the existing demo data first' : ''}
          >
            {busy === 'generate' ? 'Generating…' : 'Generate demo data'}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--danger"
            onClick={wipe}
            disabled={busy !== null || !(status?.present ?? false)}
          >
            {busy === 'wipe' ? 'Wiping…' : 'Wipe demo data'}
          </button>
        </div>

        <div style={{ fontSize: 12, color: '#667085' }}>
          Generates opening balances plus monthly billing, collections, salaries, utilities,
          supplies and depreciation entries from January through August 18, 2026 — enough to
          populate the dashboard, trial balance, general ledger, and financial statements.
        </div>
      </div>
    </div>
  );
}
