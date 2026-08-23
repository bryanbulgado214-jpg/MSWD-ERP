import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { BillingApiError, getCurrentSession, openTellerSession } from '../api';
import type { TellerSession } from '../types';

import BillingSubNav from './BillingSubNav';
import CollectionPage from './CollectionPage';
import OtherCollectionPage from './OtherCollectionPage';
import TellerSessionPage from './TellerSessionPage';
import './billing.css';

type Tab = 'revenue' | 'other' | 'session';

/**
 * One Collection tab in the left nav, split into horizontal sub-tabs:
 *   - Revenue Collection — water-bill payments (CollectionPage)
 *   - Other Collection   — non-revenue fees & deposits (OtherCollectionPage)
 *   - My Session         — the teller's shift (TellerSessionPage), for users who
 *                          manage sessions (billing.session.manage)
 *
 * A teller who manages sessions can only collect while a session is OPEN;
 * otherwise the two collection tabs are locked behind an Open Session prompt.
 * The active tab is kept in the URL (?tab=other|session) so it survives reload.
 */
export default function CollectionHubPage() {
  const { hasPermission } = useAuth();
  const managesSessions = hasPermission('billing.session.manage');

  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = raw === 'other' ? 'other' : raw === 'session' ? 'session' : 'revenue';
  const select = (t: Tab) => setParams(t === 'revenue' ? {} : { tab: t }, { replace: true });

  const [openSession, setOpenSession] = useState<TellerSession | null>(null);
  const [checking, setChecking] = useState(managesSessions);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');

  const refreshSession = useCallback(async () => {
    if (!managesSessions) {
      setOpenSession(null);
      setChecking(false);
      return;
    }
    try {
      setOpenSession(await getCurrentSession());
    } catch {
      setOpenSession(null);
    }
    setChecking(false);
  }, [managesSessions]);

  // Re-check the open session on mount and whenever the tab changes, so opening
  // a session in the My Session tab unlocks collection when the teller returns.
  useEffect(() => {
    refreshSession();
  }, [refreshSession, tab]);

  async function openNow() {
    setOpening(true);
    setError('');
    try {
      await openTellerSession();
    } catch (e) {
      // "Already have an open session" is benign — we just re-sync below.
      const msg = e instanceof BillingApiError ? e.message : 'Could not open a session.';
      if (!/already have an open session/i.test(msg)) setError(msg);
    } finally {
      // Always re-sync so the UI reflects the true session state, unlocking when
      // a session now exists (whether we just opened it or one already did).
      await refreshSession();
      setOpening(false);
    }
  }

  // Collection is locked for a session-managing teller with no open session.
  const locked = managesSessions && !openSession;

  return (
    <div className="bill-page">
      <BillingSubNav />
      <h1>Collection</h1>

      <div className="bill-tabs" role="tablist">
        <TabButton active={tab === 'revenue'} onClick={() => select('revenue')}>
          Revenue Collection
        </TabButton>
        <TabButton active={tab === 'other'} onClick={() => select('other')}>
          Other Collection
        </TabButton>
        {managesSessions && (
          <TabButton active={tab === 'session'} onClick={() => select('session')}>
            My Session
          </TabButton>
        )}
      </div>

      {tab === 'session' ? (
        <TellerSessionPage embedded onSessionChange={refreshSession} />
      ) : checking ? (
        <p style={{ color: '#667085' }}>Checking your session…</p>
      ) : locked ? (
        <div className="bill-card" style={{ padding: 28, textAlign: 'center', maxWidth: 520 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#101828', marginBottom: 6 }}>
            Collection is locked
          </div>
          <p style={{ color: '#475467', margin: '0 auto 16px' }}>
            Open a collection session before accepting payments. Every receipt you issue is tallied
            against your open session until you close and remit it to the cashier.
          </p>
          {error && <div className="bill-error">{error}</div>}
          <button
            type="button"
            className="bill-btn bill-btn--primary"
            onClick={openNow}
            disabled={opening}
          >
            {opening ? 'Opening…' : 'Open Session'}
          </button>
        </div>
      ) : tab === 'revenue' ? (
        <CollectionPage embedded />
      ) : (
        <OtherCollectionPage embedded />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`bill-tab${active ? ' bill-tab--active' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
