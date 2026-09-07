import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

import {
  CHECK_HEIGHT_IN,
  CHECK_WIDTH_IN,
  DEFAULT_CHECK_LAYOUT,
  dateCellCenters,
  type CheckLayout,
} from './check-layout';

export type CheckFieldKey = 'date' | 'payee' | 'amount' | 'words';

export interface CheckFaceData {
  /** 8 characters, MMDDYYYY. */
  dateDigits: string;
  payee: string;
  amountFigures: string;
  words: string;
}

interface CheckFaceProps {
  layout: CheckLayout;
  data: CheckFaceData;
  /** Show a faint outline of the pre-printed DBP check (boxes, labels, lines) as
   * an alignment reference. Never printed. */
  showTemplate?: boolean;
  /** Enable selection + drag affordances (the alignment screen). */
  interactive?: boolean;
  selected?: CheckFieldKey | null;
  onFieldPointerDown?: (key: CheckFieldKey, e: ReactPointerEvent) => void;
}

const IN = (n: number) => `${n}in`;

// Fixed reference geometry for the pre-printed check face, taken from the
// measured default positions. These represent the physical check and do NOT
// move while the cashier drags the data — so any gap between a datum and its box
// is exactly the misalignment being corrected.
const REF = DEFAULT_CHECK_LAYOUT;

/**
 * The 8" × 3" check face: the fill-in data overlaid at the layout's positions.
 * Rendered at real inches (a parent may scale it), so what shows here is what
 * lands on the pre-printed stock. Shared by the print page and the alignment
 * screen so calibration is exactly what prints.
 */
export function CheckFace({
  layout,
  data,
  showTemplate = false,
  interactive = false,
  selected = null,
  onFieldPointerDown,
}: CheckFaceProps) {
  const fieldBase: CSSProperties = {
    position: 'absolute',
    fontFamily: "'Courier New', monospace",
    fontWeight: 700,
    color: '#000',
    whiteSpace: 'nowrap',
  };

  const interactiveStyle = (key: CheckFieldKey): CSSProperties => {
    if (!interactive) return {};
    const isSel = selected === key;
    return {
      cursor: 'grab',
      // A background tint hugs the text box (no layout shift) to show it is
      // draggable; the outline marks the current selection.
      background: isSel ? 'rgba(37,99,235,0.16)' : 'rgba(37,99,235,0.06)',
      outline: isSel ? '1.5px solid #2563eb' : 'none',
      outlineOffset: '3px',
      touchAction: 'none',
    };
  };

  const onDown = (key: CheckFieldKey) => (e: ReactPointerEvent) => {
    if (!interactive) return;
    e.preventDefault();
    onFieldPointerDown?.(key, e);
  };

  const centers = dateCellCenters(layout);

  return (
    <div
      className="chk-face"
      style={{
        position: 'relative',
        width: IN(CHECK_WIDTH_IN),
        height: IN(CHECK_HEIGHT_IN),
        background: '#fff',
      }}
    >
      {showTemplate && (
        <div
          className="chk-template"
          aria-hidden
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          {/* Bank name (top-left). */}
          <span style={tmplLabel(0.45, 0.28, 11)}>DEVELOPMENT BANK OF THE PHILIPPINES</span>
          {/* "DATE" caption + the 8 date boxes (top-right). */}
          <span style={tmplLabel(REF.date.gridLeft, REF.date.top - 0.32, 7)}>DATE</span>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const cellW = (REF.date.gridRight - REF.date.gridLeft) / 8;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: IN(REF.date.gridLeft + i * cellW),
                  top: IN(REF.date.top - 0.14),
                  width: IN(cellW),
                  height: IN(0.28),
                  border: '0.5px solid #c9ccd1',
                  boxSizing: 'border-box',
                }}
              />
            );
          })}
          {/* "PAY TO THE ORDER OF" line. */}
          <span style={tmplLabel(0.45, REF.payee.top + 0.02, 7)}>PAY TO THE ORDER OF</span>
          <div style={tmplLine(1.5, REF.payee.top + 0.22, 5.9)} />
          {/* ₱ figures box (top-right). */}
          <div
            style={{
              position: 'absolute',
              left: IN(REF.amount.right - 1.55),
              top: IN(REF.amount.top - 0.05),
              width: IN(1.7),
              height: IN(0.34),
              border: '0.5px solid #c9ccd1',
              boxSizing: 'border-box',
            }}
          />
          <span style={tmplLabel(REF.amount.right - 1.5, REF.amount.top + 0.02, 11)}>₱</span>
          {/* "PESOS" line. */}
          <div style={tmplLine(1.3, REF.words.top + 0.22, 5.2)} />
          <span style={tmplLabel(6.65, REF.words.top + 0.04, 7)}>PESOS</span>
          {/* Signature line (bottom-right). */}
          <div style={tmplLine(5.2, 2.55, 2.4)} />
          <span style={tmplLabel(5.9, 2.6, 7)}>AUTHORIZED SIGNATURE</span>
          {/* Outer edge of the check. */}
          <div style={{ position: 'absolute', inset: 0, border: '0.5px solid #e3e5e9' }} />
        </div>
      )}

      {/* ── The data that prints ── */}

      {/* Date: 8 digits spread across the grid, one per cell. As one draggable unit. */}
      <div
        onPointerDown={onDown('date')}
        style={{
          position: 'absolute',
          left: IN(layout.date.gridLeft),
          top: IN(layout.date.top),
          width: IN(layout.date.gridRight - layout.date.gridLeft),
          transform: 'translateY(-50%)',
          display: 'flex',
          fontFamily: "'Courier New', monospace",
          fontWeight: 700,
          color: '#000',
          lineHeight: 1,
          fontSize: layout.font.dateSize,
          ...interactiveStyle('date'),
        }}
      >
        {data.dateDigits.split('').map((ch, i) => (
          <span key={i} style={{ flex: 1, textAlign: 'center' }} data-center={centers[i]}>
            {ch}
          </span>
        ))}
      </div>

      {/* Payee (left-anchored). */}
      <div
        onPointerDown={onDown('payee')}
        style={{
          ...fieldBase,
          left: IN(layout.payee.left),
          top: IN(layout.payee.top),
          fontSize: layout.font.payeeSize,
          ...interactiveStyle('payee'),
        }}
      >
        {data.payee}
      </div>

      {/* Amount in figures (right-anchored). */}
      <div
        onPointerDown={onDown('amount')}
        style={{
          ...fieldBase,
          right: IN(CHECK_WIDTH_IN - layout.amount.right),
          top: IN(layout.amount.top),
          fontSize: layout.font.amountSize,
          ...interactiveStyle('amount'),
        }}
      >
        {data.amountFigures}
      </div>

      {/* Amount in words (left-anchored). */}
      <div
        onPointerDown={onDown('words')}
        style={{
          ...fieldBase,
          left: IN(layout.words.left),
          top: IN(layout.words.top),
          fontSize: layout.font.wordsSize,
          ...interactiveStyle('words'),
        }}
      >
        {data.words}
      </div>
    </div>
  );
}

function tmplLabel(leftIn: number, topIn: number, fontPx: number): CSSProperties {
  return {
    position: 'absolute',
    left: IN(leftIn),
    top: IN(topIn),
    fontSize: fontPx,
    color: '#aab0b8',
    fontFamily: 'system-ui, sans-serif',
    letterSpacing: '0.03em',
    whiteSpace: 'nowrap',
  };
}

function tmplLine(leftIn: number, topIn: number, widthIn: number): CSSProperties {
  return {
    position: 'absolute',
    left: IN(leftIn),
    top: IN(topIn),
    width: IN(widthIn),
    borderBottom: '0.5px solid #c9ccd1',
  };
}
