import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { DisbursementVoucherSheet } from '../../../app/DisbursementVoucherSheet';
import { getDv } from '../api';
import type { DisbursementVoucher } from '../types';

export function PrintDvPage() {
  const { id } = useParams<{ id: string }>();
  const [dv, setDv] = useState<DisbursementVoucher | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getDv(id)
      .then(setDv)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div style={{ padding: 32, color: '#b42318' }}>{error}</div>;
  if (!dv) return <div style={{ padding: 32, color: '#667085' }}>Loading...</div>;

  return <DisbursementVoucherSheet dv={dv} />;
}
