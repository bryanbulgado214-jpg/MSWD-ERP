import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../../app/auth';
import {
  AccountingApiError,
  confirmCoaImport,
  createChartOfAccount,
  getChartOfAccounts,
  getCoaImportPreview,
} from '../api';
import type { ChartOfAccount, CoaImportPreviewResult } from '../types';

import { AccountingSubNav } from './AccountingSubNav';
import './accounting.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: ChartOfAccount[] };

const ACCOUNT_TYPES = ['', 'asset', 'liability', 'equity', 'revenue', 'expense'] as const;

const TEMPLATE_CSV = [
  'accountCode,name,accountType,normalBalance,level,isHeader,parentCode,uacsCode',
  '1000,Cash and Cash Equivalents,asset,debit,1,true,,',
  '1010,Cash on Hand,asset,debit,2,false,1000,10101010',
].join('\n');

const ACTION_LABEL: Record<'create' | 'update' | 'error', string> = {
  create: 'Create',
  update: 'Update',
  error: 'Error',
};

export default function ChartOfAccountsPage() {
  const { permissions } = useAuth();
  const canManage = permissions.has('accounting.coa.manage');

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');

  // ── CSV import state ──
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<CoaImportPreviewResult | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('accountType', typeFilter);
      if (search) params.set('search', search);
      params.set('includeInactive', 'true');
      const data = await getChartOfAccounts(params.toString());
      setState({ status: 'loaded', data });
    } catch (e) {
      const msg = e instanceof AccountingApiError ? e.message : 'Failed to load accounts.';
      setState({ status: 'error', message: msg });
    }
  }, [typeFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');
    const fd = new FormData(e.currentTarget);
    try {
      await createChartOfAccount({
        accountCode: fd.get('accountCode') as string,
        name: fd.get('name') as string,
        accountType: fd.get('accountType') as string,
        normalBalance: fd.get('normalBalance') as string,
        level: Number(fd.get('level')),
        isHeader: fd.get('isHeader') === 'true',
        ...(fd.get('parentAccountId')
          ? { parentAccountId: fd.get('parentAccountId') as string }
          : {}),
        ...(fd.get('uacsCode') ? { uacsCode: fd.get('uacsCode') as string } : {}),
      });
      setShowForm(false);
      load();
    } catch (e) {
      setFormError(e instanceof AccountingApiError ? e.message : 'Failed to create account.');
    }
  }

  function openImport() {
    setShowForm(false);
    setShowImport(true);
  }

  function resetImport() {
    setShowImport(false);
    setCsvText('');
    setPreview(null);
    setImportBusy(false);
    setImportError('');
  }

  function onCsvChange(value: string) {
    setCsvText(value);
    setPreview(null); // any edit invalidates a prior preview
    setImportError('');
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onCsvChange(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => setImportError('Could not read the selected file.');
    reader.readAsText(file);
    e.target.value = ''; // allow re-selecting the same file
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coa-import-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleValidate() {
    setImportError('');
    setImportSuccess('');
    setImportBusy(true);
    try {
      const result = await getCoaImportPreview(csvText);
      setPreview(result);
    } catch (e) {
      setPreview(null);
      setImportError(e instanceof AccountingApiError ? e.message : 'Failed to validate CSV.');
    } finally {
      setImportBusy(false);
    }
  }

  async function handleConfirm() {
    setImportError('');
    setImportBusy(true);
    try {
      const result = await confirmCoaImport(csvText);
      resetImport();
      setImportSuccess(`Import complete: ${result.created} created, ${result.updated} updated.`);
      load();
    } catch (e) {
      setImportError(e instanceof AccountingApiError ? e.message : 'Failed to import CSV.');
    } finally {
      setImportBusy(false);
    }
  }

  const canConfirm = !!preview && preview.summary.errors === 0 && !importBusy;

  return (
    <div className="acct-page">
      <AccountingSubNav />
      <h1>Chart of Accounts</h1>

      {importSuccess && <div className="acct-success">{importSuccess}</div>}

      <div className="acct-toolbar">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {ACCOUNT_TYPES.filter(Boolean).map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search code or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {canManage && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="acct-btn"
              onClick={() => (showImport ? resetImport() : openImport())}
            >
              {showImport ? 'Close Import' : 'Import CSV'}
            </button>
            <button
              type="button"
              className="acct-btn acct-btn--primary"
              onClick={() => {
                setShowImport(false);
                setShowForm(!showForm);
              }}
            >
              {showForm ? 'Cancel' : '+ Add Account'}
            </button>
          </div>
        )}
      </div>

      {canManage && showImport && (
        <div className="acct-form">
          <p className="acct-import-hint">
            Upload a Chart of Accounts CSV. The header row is required (columns are case-insensitive
            and order-independent):{' '}
            <code>
              accountCode,name,accountType,normalBalance,level,isHeader,parentCode,uacsCode
            </code>
            .
            <br />
            <strong>Required:</strong> accountCode, name, accountType (asset | liability | equity |
            revenue | expense), normalBalance (debit | credit). <strong>Optional:</strong> level
            (integer; defaults to 1, or parent level + 1), isHeader (true/false/1/0/yes/no; default
            false), parentCode (must match an accountCode already in the system or earlier in the
            file), uacsCode. Existing account codes are updated; new codes are created.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" className="acct-btn acct-btn--sm" onClick={downloadTemplate}>
              Download template
            </button>
            <button
              type="button"
              className="acct-btn acct-btn--sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose .csv file…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
          </div>

          <div className="acct-field">
            <label>CSV Content</label>
            <textarea
              rows={8}
              value={csvText}
              onChange={(e) => onCsvChange(e.target.value)}
              placeholder="Paste CSV text here, or choose a .csv file above."
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </div>

          {importError && <div className="acct-error">{importError}</div>}

          <div className="acct-form-actions">
            <button type="button" className="acct-btn" onClick={resetImport}>
              Cancel
            </button>
            <button
              type="button"
              className="acct-btn"
              onClick={handleValidate}
              disabled={importBusy || csvText.trim() === ''}
            >
              {importBusy && !preview ? 'Validating…' : 'Validate & Preview'}
            </button>
            <button
              type="button"
              className="acct-btn acct-btn--primary"
              onClick={handleConfirm}
              disabled={!canConfirm}
            >
              {importBusy && preview ? 'Importing…' : 'Confirm Import'}
            </button>
          </div>

          {preview && (
            <>
              <div className="acct-import-summary">
                <span>Total: {preview.summary.total}</span>
                <span style={{ color: '#067647' }}>To create: {preview.summary.toCreate}</span>
                <span style={{ color: '#175cd3' }}>To update: {preview.summary.toUpdate}</span>
                <span style={{ color: '#b42318' }}>Errors: {preview.summary.errors}</span>
              </div>
              {preview.summary.errors > 0 && (
                <div className="acct-error">
                  Fix the {preview.summary.errors} row(s) with errors, then validate again before
                  importing.
                </div>
              )}
              <div style={{ overflowX: 'auto' }}>
                <table className="acct-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Action</th>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Normal Bal.</th>
                      <th>Level</th>
                      <th>Header</th>
                      <th>Parent</th>
                      <th>UACS</th>
                      <th>Messages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr
                        key={row.rowNumber}
                        className={row.action === 'error' ? 'acct-row-error' : undefined}
                      >
                        <td className="acct-text-mono">{row.rowNumber}</td>
                        <td>
                          <span className={`acct-badge acct-badge--${row.action}`}>
                            {ACTION_LABEL[row.action]}
                          </span>
                        </td>
                        <td className="acct-text-mono">{row.accountCode || '—'}</td>
                        <td>{row.name || '—'}</td>
                        <td>{row.accountType || '—'}</td>
                        <td>{row.normalBalance || '—'}</td>
                        <td className="acct-text-mono">{row.level}</td>
                        <td>{row.isHeader ? 'Yes' : 'No'}</td>
                        <td className="acct-text-mono">{row.parentCode || '—'}</td>
                        <td className="acct-text-mono">{row.uacsCode || '—'}</td>
                        <td>
                          {row.errors.length > 0 && (
                            <div className="acct-import-errors">
                              {row.errors.map((err, i) => (
                                <div key={i}>{err}</div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {showForm && (
        <form className="acct-form" onSubmit={handleCreate}>
          {formError && <div className="acct-error">{formError}</div>}
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Account Code</label>
              <input name="accountCode" required maxLength={30} />
            </div>
            <div className="acct-field">
              <label>Name</label>
              <input name="name" required maxLength={255} />
            </div>
          </div>
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Account Type</label>
              <select name="accountType" required>
                {ACCOUNT_TYPES.filter(Boolean).map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="acct-field">
              <label>Normal Balance</label>
              <select name="normalBalance" required>
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </div>
          </div>
          <div className="acct-form-row">
            <div className="acct-field">
              <label>Level</label>
              <select name="level" required>
                <option value="1">1 - Group</option>
                <option value="2">2 - Major Account</option>
                <option value="3">3 - Sub-Account</option>
              </select>
            </div>
            <div className="acct-field">
              <label>Is Header?</label>
              <select name="isHeader" required>
                <option value="true">Yes (Header / Non-postable)</option>
                <option value="false">No (Postable)</option>
              </select>
            </div>
          </div>
          <div className="acct-form-row">
            <div className="acct-field">
              <label>UACS Code (optional)</label>
              <input name="uacsCode" maxLength={30} />
            </div>
            <div className="acct-field">
              <label>Parent Account ID (optional)</label>
              <input name="parentAccountId" placeholder="UUID of parent" />
            </div>
          </div>
          <div className="acct-form-actions">
            <button type="button" className="acct-btn" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" className="acct-btn acct-btn--primary">
              Create Account
            </button>
          </div>
        </form>
      )}

      {state.status === 'loading' && <div className="acct-empty">Loading chart of accounts...</div>}
      {state.status === 'error' && <div className="acct-error">{state.message}</div>}
      {state.status === 'loaded' && state.data.length === 0 && (
        <div className="acct-empty">No accounts found.</div>
      )}
      {state.status === 'loaded' && state.data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="acct-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Account Name</th>
                <th>Type</th>
                <th>Normal Bal.</th>
                <th>UACS</th>
                <th>Kind</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((acct) => (
                <tr key={acct.id}>
                  <td className="acct-text-mono">
                    <span className={`acct-indent-${acct.level}`}>{acct.accountCode}</span>
                  </td>
                  <td style={{ fontWeight: acct.isHeader ? 700 : 400 }}>{acct.name}</td>
                  <td>
                    <span className={`acct-badge acct-badge--${acct.accountType}`}>
                      {acct.accountType}
                    </span>
                  </td>
                  <td>{acct.normalBalance}</td>
                  <td className="acct-text-mono">{acct.uacsCode || '—'}</td>
                  <td>
                    <span
                      className={`acct-badge acct-badge--${acct.isHeader ? 'header' : 'postable'}`}
                    >
                      {acct.isHeader ? 'Header' : 'Postable'}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`acct-badge acct-badge--${acct.isActive ? 'active' : 'inactive'}`}
                    >
                      {acct.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
