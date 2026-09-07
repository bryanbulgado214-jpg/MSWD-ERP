import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../../app/auth';
import { getBankAccountsForCheckPrinting, saveCheckLayout } from '../api';
import {
  CHECK_HEIGHT_IN,
  CHECK_WIDTH_IN,
  DEFAULT_CHECK_LAYOUT,
  checkAmountWords,
  normalizeCheckLayout,
  type CheckLayout,
} from '../check-layout';
import { CheckFace, type CheckFieldKey } from '../CheckFace';
import type { BankAccount } from '../types';

import { AccountingSubNav } from './AccountingSubNav';

import './accounting.css';

const FIELD_LABELS: Record<CheckFieldKey, string> = {
  date: 'Date',
  payee: 'Payee',
  amount: 'Amount (figures)',
  words: 'Amount in words',
};

const round = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Apply a movement (in inches) to one field, keeping it on the check. */
function applyDelta(l: CheckLayout, key: CheckFieldKey, dx: number, dy: number): CheckLayout {
  const next: CheckLayout = {
    date: { ...l.date },
    payee: { ...l.payee },
    amount: { ...l.amount },
    words: { ...l.words },
    font: { ...l.font },
  };
  if (key === 'date') {
    const width = l.date.gridRight - l.date.gridLeft;
    const gl = clamp(l.date.gridLeft + dx, 0, CHECK_WIDTH_IN - width);
    next.date.gridLeft = round(gl);
    next.date.gridRight = round(gl + width);
    next.date.top = round(clamp(l.date.top + dy, 0, CHECK_HEIGHT_IN));
  } else if (key === 'payee') {
    next.payee.left = round(clamp(l.payee.left + dx, 0, CHECK_WIDTH_IN));
    next.payee.top = round(clamp(l.payee.top + dy, 0, CHECK_HEIGHT_IN));
  } else if (key === 'words') {
    next.words.left = round(clamp(l.words.left + dx, 0, CHECK_WIDTH_IN));
    next.words.top = round(clamp(l.words.top + dy, 0, CHECK_HEIGHT_IN));
  } else if (key === 'amount') {
    // amount.right is a left-origin x-coordinate of the text's right edge, so a
    // rightward drag increases it.
    next.amount.right = round(clamp(l.amount.right + dx, 0, CHECK_WIDTH_IN));
    next.amount.top = round(clamp(l.amount.top + dy, 0, CHECK_HEIGHT_IN));
  }
  return next;
}

const FONT_KEY: Record<CheckFieldKey, keyof CheckLayout['font']> = {
  date: 'dateSize',
  payee: 'payeeSize',
  amount: 'amountSize',
  words: 'wordsSize',
};

export function CheckAlignmentPage() {
  const { permissions } = useAuth();
  const canPrint = permissions.has('accounting.check.print');

  const [searchParams] = useSearchParams();
  const wantedAccountId = searchParams.get('bankAccountId') ?? '';

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [loadError, setLoadError] = useState('');

  const [layout, setLayout] = useState<CheckLayout>(DEFAULT_CHECK_LAYOUT);
  const [baseline, setBaseline] = useState<CheckLayout>(DEFAULT_CHECK_LAYOUT);
  const [selected, setSelected] = useState<CheckFieldKey | null>('payee');

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');

  // Sample content — editable, so the cashier can paste a real (often long)
  // payee name and amount and check it fits before saving.
  const [samplePayee, setSamplePayee] = useState('JUAN DELA CRUZ CONSTRUCTION SUPPLY');
  const [sampleAmount, setSampleAmount] = useState('12345.67');
  const [sampleDate, setSampleDate] = useState(new Date().toISOString().slice(0, 10));

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const dragRef = useRef<{
    key: CheckFieldKey;
    startX: number;
    startY: number;
    startLayout: CheckLayout;
    pxPerIn: number;
  } | null>(null);

  // ── Load the accounts the cashier can calibrate ──
  useEffect(() => {
    if (!canPrint) return;
    getBankAccountsForCheckPrinting()
      .then((data) => {
        setAccounts(data);
        const pick =
          data.find((a) => a.id === wantedAccountId) ??
          data.find((a) => a.status === 'active') ??
          data[0];
        if (pick) setAccountId(pick.id);
      })
      .catch((e) => setLoadError(e.message ?? 'Failed to load bank accounts.'));
  }, [canPrint]);

  // Load a saved layout as the baseline only when the user switches to a
  // different account — not on every accounts-array change. (Saving updates the
  // accounts array; without this guard that would clobber the just-saved state
  // and hide the "Saved ✓" confirmation.)
  const loadedAccountRef = useRef<string | null>(null);
  useEffect(() => {
    const acct = accounts.find((a) => a.id === accountId);
    if (!acct || loadedAccountRef.current === accountId) return;
    loadedAccountRef.current = accountId;
    const l = normalizeCheckLayout(acct.checkLayout ?? null);
    setLayout(l);
    setBaseline(l);
    setSaveState('idle');
  }, [accountId, accounts]);

  // Scale the check to fit the stage width so the whole face is visible without
  // horizontal scrolling. Drag math reads the sheet's measured size, so it stays
  // correct at any scale.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const natural = CHECK_WIDTH_IN * 96;
    const recompute = () => {
      const avail = el.clientWidth - 44; // stage padding (22px each side)
      setScale(Math.min(1, Math.max(0.4, avail / natural)));
    };
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    recompute();
    return () => ro.disconnect();
  }, []);

  // ── Drag ──
  const onMove = useCallback((ev: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (ev.clientX - d.startX) / d.pxPerIn;
    const dy = (ev.clientY - d.startY) / d.pxPerIn;
    setLayout(applyDelta(d.startLayout, d.key, dx, dy));
  }, []);
  const onUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }, [onMove]);
  const onFieldPointerDown = useCallback(
    (key: CheckFieldKey, e: React.PointerEvent) => {
      const rect = sheetRef.current?.getBoundingClientRect();
      if (!rect) return;
      dragRef.current = {
        key,
        startX: e.clientX,
        startY: e.clientY,
        startLayout: layoutRef.current,
        pxPerIn: rect.width / CHECK_WIDTH_IN,
      };
      setSelected(key);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [onMove, onUp],
  );

  // ── Arrow-key nudge (fine 0.02", Shift = coarse 0.1") ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selected) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const step = e.shiftKey ? 0.1 : 0.02;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;
      e.preventDefault();
      setLayout((l) => applyDelta(l, selected, dx, dy));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  function nudgeFont(key: CheckFieldKey, delta: number) {
    const fk = FONT_KEY[key];
    setLayout((l) => ({
      ...l,
      font: { ...l.font, [fk]: clamp(l.font[fk] + delta, 8, 40) },
    }));
  }

  const dirty = useMemo(
    () => JSON.stringify(layout) !== JSON.stringify(baseline),
    [layout, baseline],
  );

  async function handleSave() {
    if (!accountId) return;
    setSaveState('saving');
    setSaveError('');
    try {
      const updated = await saveCheckLayout(accountId, layout);
      setAccounts((prev) => prev.map((a) => (a.id === accountId ? updated : a)));
      setBaseline(layout);
      setSaveState('saved');
    } catch (e: any) {
      setSaveState('error');
      setSaveError(e.message ?? 'Failed to save.');
    }
  }

  // Sample values, formatted the way the real check prints them.
  const amountNum = Number(sampleAmount) || 0;
  const amountFigures = amountNum.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const words = checkAmountWords(amountNum);
  const iso = sampleDate || new Date().toISOString().slice(0, 10);
  const [yyyy, mm, dd] = iso.split('-') as [string, string, string];
  const dateDigits = `${mm}${dd}${yyyy}`;
  const faceData = { dateDigits, payee: samplePayee, amountFigures, words };

  if (!canPrint) {
    return (
      <div className="acct-page">
        <AccountingSubNav />
        <h1>Check Alignment</h1>
        <div className="acct-empty">
          Check alignment is calibrated by the cashier who prints checks. You don't have that
          access.
        </div>
      </div>
    );
  }

  const selectedFont = selected ? layout.font[FONT_KEY[selected]] : null;

  return (
    <div className="acct-page">
      <AccountingSubNav />

      <style>{`
        .chk-align-stage { background: #eef0f3; border: 1px solid #e4e7ec; border-radius: 10px;
          padding: 22px; overflow: hidden; }
        .chk-align-sheet { position: relative; width: ${CHECK_WIDTH_IN}in; height: ${CHECK_HEIGHT_IN}in;
          background: #fff; box-shadow: 0 2px 12px rgba(16,24,40,.18); touch-action: none; }
        .chk-align-grid { display: grid; grid-template-columns: minmax(0,1fr) 300px; gap: 20px;
          align-items: start; }
        @media (max-width: 900px) { .chk-align-grid { grid-template-columns: 1fr; } }
        .chk-chip { padding: 6px 12px; border: 1px solid #d0d5dd; border-radius: 999px;
          background: #fff; cursor: pointer; font-size: 12.5px; color: #344054; }
        .chk-chip.active { background: var(--mswd-navy,#0a2a66); color: #fff; border-color: transparent; }
        .chk-panel { border: 1px solid #e4e7ec; border-radius: 10px; padding: 16px; }
        .chk-panel h3 { margin: 0 0 10px; font-size: 13px; color: #344054; }
        .chk-step { display: inline-flex; align-items: center; gap: 8px; }
        .chk-step button { width: 28px; height: 28px; border: 1px solid #d0d5dd; border-radius: 6px;
          background: #fff; cursor: pointer; font-size: 16px; line-height: 1; }
        .chk-field-lbl { display:block; font-size: 11px; font-weight: 600; color: #667085;
          text-transform: uppercase; letter-spacing: .03em; margin-bottom: 4px; }
        .chk-print-only { position: fixed; left: -10000px; top: 0; }
        @media print {
          @page { size: ${CHECK_WIDTH_IN}in ${CHECK_HEIGHT_IN}in; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          .chk-print-only, .chk-print-only * { visibility: visible !important; }
          .chk-print-only { left: 0 !important; box-shadow: none; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <h1 style={{ marginBottom: 4 }}>Check Alignment</h1>
        <Link to="/accounting/checks" className="acct-table__link" style={{ fontSize: 13 }}>
          ← Back to Check Register
        </Link>
      </div>
      <p style={{ color: '#667085', fontSize: 13, marginTop: 0, marginBottom: 16, maxWidth: 820 }}>
        If a printed check lands off its lines, calibrate it here — no need to touch the code. Do a
        test print on a real check, see where each value landed, then drag it (or select it and use
        the arrow keys) until it sits in its blank. Long payee names or amounts can be shrunk with
        the font controls. The layout is saved per bank account, so each printer keeps its own
        calibration.
      </p>

      {loadError && <div className="acct-error">{loadError}</div>}

      <div style={{ marginBottom: 16, maxWidth: 460 }}>
        <span className="chk-field-lbl">Bank account</span>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px',
            border: '1px solid #d0d5dd',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {accounts.length === 0 && <option value="">No bank accounts</option>}
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.bank.code} — {a.accountName} ({a.accountNumber})
              {a.checkLayout ? ' · calibrated' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="chk-align-grid">
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {(Object.keys(FIELD_LABELS) as CheckFieldKey[]).map((k) => (
              <button
                key={k}
                className={`chk-chip${selected === k ? ' active' : ''}`}
                onClick={() => setSelected(k)}
              >
                {FIELD_LABELS[k]}
              </button>
            ))}
          </div>

          <div className="chk-align-stage" ref={stageRef}>
            <div
              style={{
                width: CHECK_WIDTH_IN * 96 * scale,
                height: CHECK_HEIGHT_IN * 96 * scale,
                margin: '0 auto',
              }}
            >
              <div
                className="chk-align-sheet"
                ref={sheetRef}
                style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
              >
                <CheckFace
                  layout={layout}
                  data={faceData}
                  showTemplate
                  interactive
                  selected={selected}
                  onFieldPointerDown={onFieldPointerDown}
                />
              </div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: '#667085', marginTop: 10 }}>
            Drag a field to move it, or select it and nudge with the arrow keys —{' '}
            <strong>arrow = fine (0.02&quot;)</strong>,{' '}
            <strong>Shift + arrow = coarse (0.1&quot;)</strong>. The grey boxes and lines show where
            the pre-printed check has its blanks.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="chk-panel">
            <h3>Selected field</h3>
            {selected ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0a2a66', marginBottom: 10 }}>
                  {FIELD_LABELS[selected]}
                </div>
                <span className="chk-field-lbl">Font size</span>
                <div className="chk-step" style={{ marginBottom: 6 }}>
                  <button onClick={() => selected && nudgeFont(selected, -1)} aria-label="Smaller">
                    −
                  </button>
                  <span style={{ minWidth: 40, textAlign: 'center', fontSize: 13 }}>
                    {selectedFont}px
                  </span>
                  <button onClick={() => selected && nudgeFont(selected, +1)} aria-label="Larger">
                    +
                  </button>
                </div>
                <p style={{ fontSize: 11.5, color: '#98a2b3', margin: 0 }}>
                  Shrink the font if a long payee name or amount runs past the line.
                </p>
              </>
            ) : (
              <p style={{ fontSize: 12.5, color: '#667085', margin: 0 }}>
                Click a field on the check (or a chip above) to select it.
              </p>
            )}
          </div>

          <div className="chk-panel">
            <h3>Test content</h3>
            <span className="chk-field-lbl">Payee</span>
            <input
              value={samplePayee}
              onChange={(e) => setSamplePayee(e.target.value)}
              style={inputStyle}
            />
            <span className="chk-field-lbl" style={{ marginTop: 10 }}>
              Amount
            </span>
            <input
              value={sampleAmount}
              onChange={(e) => setSampleAmount(e.target.value)}
              inputMode="decimal"
              style={inputStyle}
            />
            <span className="chk-field-lbl" style={{ marginTop: 10 }}>
              Date
            </span>
            <input
              type="date"
              value={sampleDate}
              onChange={(e) => setSampleDate(e.target.value)}
              style={inputStyle}
            />
            <p style={{ fontSize: 11.5, color: '#98a2b3', margin: '10px 0 0' }}>
              Only for previewing and the test print — this isn't saved.
            </p>
          </div>

          <div className="chk-panel">
            <h3>Save & test</h3>
            {saveError && (
              <div className="acct-error" style={{ marginBottom: 10 }}>
                {saveError}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="acct-btn acct-btn--primary"
                onClick={handleSave}
                disabled={!dirty || saveState === 'saving' || !accountId}
              >
                {saveState === 'saving'
                  ? 'Saving…'
                  : saveState === 'saved' && !dirty
                    ? 'Saved ✓'
                    : 'Save alignment'}
              </button>
              <button className="acct-btn" onClick={() => window.print()}>
                Print test on a check
              </button>
              <button
                className="acct-btn"
                onClick={() => setLayout(DEFAULT_CHECK_LAYOUT)}
                disabled={JSON.stringify(layout) === JSON.stringify(DEFAULT_CHECK_LAYOUT)}
              >
                Reset to default
              </button>
            </div>
            {dirty && (
              <p style={{ fontSize: 11.5, color: '#b54708', margin: '10px 0 0' }}>
                Unsaved changes.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Off-screen clean copy used for the test print — no guides, no tints, so
          it prints exactly like a real check. */}
      <div className="chk-print-only">
        <CheckFace layout={layout} data={faceData} />
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 9px',
  border: '1px solid #d0d5dd',
  borderRadius: 6,
  fontSize: 13,
  boxSizing: 'border-box',
};
