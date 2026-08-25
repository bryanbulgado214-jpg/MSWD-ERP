import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../../../app/auth';
import {
  AccountingApiError,
  deleteAccountMapping,
  getAccountMappings,
  getChartOfAccounts,
  upsertAccountMapping,
} from '../api';
import type { AccountMapping, ChartOfAccount } from '../types';

import { AccountCombobox } from './AccountCombobox';
import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

type LoadState<T> =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'loaded'; data: T };

const STANDARD_MAPPINGS = [
  { key: 'ap.accounts_payable', label: 'Accounts Payable' },
  { key: 'ap.due_to_bir', label: 'Due to BIR' },
  { key: 'ap.due_to_gsis', label: 'Due to GSIS' },
  { key: 'ap.due_to_pagibig', label: 'Due to Pag-IBIG' },
  { key: 'ap.due_to_philhealth', label: 'Due to PhilHealth' },
  { key: 'cash.in_bank', label: 'Cash in Bank' },
  { key: 'cash.collecting_officer', label: 'Cash - Collecting Officer' },
  { key: 'expense.office_supplies', label: 'Office Supplies Expenses' },
  { key: 'expense.other_supplies', label: 'Other Supplies & Materials Expenses' },
  { key: 'inventory.office_supplies', label: 'Office Supplies Inventory' },
  { key: 'ppe.office_equipment', label: 'PPE — Office Equipment' },
  { key: 'ppe.ict_equipment', label: 'PPE — ICT Equipment' },
  { key: 'depreciation.office_equipment', label: 'Depreciation — Office Equipment' },
  { key: 'depreciation.ict_equipment', label: 'Depreciation — ICT Equipment' },
  // Cashier daily collection report — which GL each nature of collection credits.
  { key: 'collection.water_sales', label: 'Collection — Water Sales' },
  { key: 'collection.new_connection', label: 'Collection — New Connection Fee' },
  { key: 'collection.reconnection', label: 'Collection — Reconnection Fee' },
  { key: 'collection.relocation', label: 'Collection — Relocation Fee' },
  { key: 'collection.guaranty_deposit', label: 'Collection — Guaranty Deposit' },
  { key: 'collection.unclassified', label: 'Collection — Unclassified (holding)' },
];

export default function AccountMappingsPage() {
  const { permissions } = useAuth();
  const canManage = permissions.has('accounting.coa.manage');

  const [mappings, setMappings] = useState<LoadState<AccountMapping[]>>({ status: 'loading' });
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [m, a] = await Promise.all([
        getAccountMappings(),
        getChartOfAccounts('includeInactive=false'),
      ]);
      setMappings({ status: 'loaded', data: m });
      setAccounts(a.filter((x) => !x.isHeader));
    } catch (e) {
      setMappings({
        status: 'error',
        message: e instanceof AccountingApiError ? e.message : 'Failed to load.',
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMap(mappingKey: string, chartOfAccountId: string) {
    if (!chartOfAccountId) return;
    setSaving(mappingKey);
    setError('');
    try {
      await upsertAccountMapping({ mappingKey, chartOfAccountId });
      load();
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to save mapping.');
    } finally {
      setSaving(null);
    }
  }

  async function handleUnmap(mappingKey: string) {
    setSaving(mappingKey);
    setError('');
    try {
      await deleteAccountMapping(mappingKey);
      load();
    } catch (e) {
      setError(e instanceof AccountingApiError ? e.message : 'Failed to remove mapping.');
    } finally {
      setSaving(null);
    }
  }

  const mappingMap = new Map<string, AccountMapping>();
  if (mappings.status === 'loaded') {
    for (const m of mappings.data) mappingMap.set(m.mappingKey, m);
  }

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>Account Mappings</h1>
      <p style={{ color: '#667085', fontSize: 13, marginBottom: 20 }}>
        Configure which COA account is used for each transaction type. This avoids hardcoding UACS
        codes in integrations.
      </p>

      {error && <div className="acct-error">{error}</div>}

      {mappings.status === 'loading' && <div className="acct-empty">Loading mappings...</div>}
      {mappings.status === 'error' && <div className="acct-error">{mappings.message}</div>}
      {mappings.status === 'loaded' && (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Mapping Key</th>
                <th>Label</th>
                <th>Mapped Account</th>
                {canManage && <th>Change</th>}
              </tr>
            </thead>
            <tbody>
              {STANDARD_MAPPINGS.map((sm) => {
                const existing = mappingMap.get(sm.key);
                return (
                  <tr key={sm.key}>
                    <td className="acct-text-mono" style={{ fontSize: 12 }}>
                      {sm.key}
                    </td>
                    <td style={{ fontWeight: 500 }}>{sm.label}</td>
                    <td>
                      {existing ? (
                        <span>
                          <span className="acct-text-mono">
                            {existing.chartOfAccount.accountCode}
                          </span>
                          {' — '}
                          {existing.chartOfAccount.name}
                        </span>
                      ) : (
                        <span style={{ color: '#98a2b3', fontStyle: 'italic' }}>Not mapped</span>
                      )}
                    </td>
                    {canManage && (
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            gap: 6,
                            alignItems: 'center',
                            maxWidth: 360,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <AccountCombobox
                              accounts={accounts}
                              value={existing?.chartOfAccount.id ?? ''}
                              onChange={(id) => handleMap(sm.key, id)}
                              placeholder="Type code or name…"
                            />
                          </div>
                          {existing && (
                            <button
                              type="button"
                              className="acct-btn acct-btn--sm"
                              onClick={() => handleUnmap(sm.key)}
                              disabled={saving === sm.key}
                              title="Remove this mapping"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
