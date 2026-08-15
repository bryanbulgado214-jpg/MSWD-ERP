import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { DisbursementVoucherSheet } from '../../../app/DisbursementVoucherSheet';
import { AccountingApiError, getDisbursement } from '../api';
import type { DisbursementDetail } from '../types';

export function PrintDisbursementPage() {
  const { id } = useParams<{ id: string }>();
  const [dv, setDv] = useState<DisbursementDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getDisbursement(id)
      .then(setDv)
      .catch((e) => setError(e instanceof AccountingApiError ? e.message : 'Failed to load.'));
  }, [id]);

  if (error) return <div style={{ padding: 32, color: '#b42318' }}>{error}</div>;
  if (!dv) return <div style={{ padding: 32, color: '#667085' }}>Loading...</div>;

  return <DisbursementVoucherSheet dv={dv} />;
}
