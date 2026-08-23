import { useSearchParams } from 'react-router-dom';

import BillingSubNav from './BillingSubNav';
import CollectionPage from './CollectionPage';
import OtherCollectionPage from './OtherCollectionPage';
import './billing.css';

/**
 * One Collection tab in the left nav, split into two horizontal tabs:
 *   - Revenue Collection — water-bill payments (CollectionPage)
 *   - Other Collection   — non-revenue fees & deposits (OtherCollectionPage)
 * The active tab is kept in the URL (?tab=other) so it survives reload.
 */
export default function CollectionHubPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'other' ? 'other' : 'revenue';
  const select = (t: 'revenue' | 'other') =>
    setParams(t === 'other' ? { tab: 'other' } : {}, { replace: true });

  return (
    <div className="bill-page">
      <BillingSubNav />
      <h1>Collection</h1>

      <div className="bill-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'revenue'}
          className={`bill-tab${tab === 'revenue' ? ' bill-tab--active' : ''}`}
          onClick={() => select('revenue')}
        >
          Revenue Collection
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'other'}
          className={`bill-tab${tab === 'other' ? ' bill-tab--active' : ''}`}
          onClick={() => select('other')}
        >
          Other Collection
        </button>
      </div>

      {tab === 'revenue' ? <CollectionPage embedded /> : <OtherCollectionPage embedded />}
    </div>
  );
}
