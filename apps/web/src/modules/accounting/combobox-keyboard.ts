import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';

/**
 * Keyboard navigation for the type-to-search comboboxes (payee, account).
 *   Tab / ↓        → highlight the first item, then the next (wraps around)
 *   Shift+Tab / ↑  → previous item
 *   Enter          → select the highlighted item
 *   Escape         → close the list
 * Mouse selection still works; this just adds the keyboard path. The caller
 * passes how many items are in the list, whether it's open, and what to do when
 * an item is chosen; it gets back the highlighted index and the input's keydown
 * handler.
 */
export function useComboKeyboard(opts: {
  count: number;
  open: boolean;
  setOpen: (b: boolean) => void;
  onSelect: (index: number) => void;
}) {
  const { count, open, setOpen, onSelect } = opts;
  const [highlight, setHighlight] = useState(-1);

  // Clear the highlight when the list closes; keep it in range as it shrinks.
  useEffect(() => {
    if (!open) setHighlight(-1);
  }, [open]);
  useEffect(() => {
    setHighlight((h) => (h >= count ? -1 : h));
  }, [count]);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (!open) {
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) setOpen(true);
      return;
    }
    if (count === 0) return;
    if (e.key === 'Tab' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const back = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey);
      e.preventDefault();
      setHighlight((h) => (back ? (h <= 0 ? count - 1 : h - 1) : (h + 1) % count));
    } else if (e.key === 'Enter') {
      if (highlight >= 0 && highlight < count) {
        e.preventDefault();
        onSelect(highlight);
      }
    }
  }

  return { highlight, setHighlight, onKeyDown };
}
