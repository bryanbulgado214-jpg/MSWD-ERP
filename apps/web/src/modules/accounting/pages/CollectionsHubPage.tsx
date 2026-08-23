import { useSearchParams } from 'react-router-dom';

import { AccountingSubNav } from './AccountingSubNav';
import CollectionBatchesPage from './CollectionBatchesPage';
import CollectionReconciliationPage from './CollectionReconciliationPage';
import CollectionReportsPage from './CollectionReportsPage';
import './accounting.css';

type Tab = 'batches' | 'reconciliation' | 'reports';

/**
 * One "Collections" item in the Accounting sidebar, split into horizontal
 * sub-tabs — Batches (the maker-checker workflow), Reconciliation (monitoring),
 * and Reports — instead of three separate sidebar entries. The active tab lives
 * in the URL (?tab=reconciliation|reports) so it survives reload.
 */
export default function CollectionsHubPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab =
    raw === 'reconciliation' ? 'reconciliation' : raw === 'reports' ? 'reports' : 'batches';
  const select = (t: Tab) => setParams(t === 'batches' ? {} : { tab: t }, { replace: true });

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'batches', label: 'Batches' },
    { key: 'reconciliation', label: 'Reconciliation' },
    { key: 'reports', label: 'Reports' },
  ];

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>Collections</h1>

      <div className="acct-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`acct-tab${tab === t.key ? ' acct-tab--active' : ''}`}
            onClick={() => select(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'batches' ? (
        <CollectionBatchesPage embedded />
      ) : tab === 'reconciliation' ? (
        <CollectionReconciliationPage embedded />
      ) : (
        <CollectionReportsPage embedded />
      )}
    </div>
  );
}
