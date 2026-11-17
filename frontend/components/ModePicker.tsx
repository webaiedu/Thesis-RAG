'use client';

import { useEffect, useRef, useState } from 'react';
import type { Mode } from '@/lib/api';
import { CheckIcon, ChevronIcon, InfoIcon, ScaleIcon, SparkIcon } from './Icons';

type Props = {
  mode: Mode;
  disabled?: boolean;
  /** "law" = Specific: the chat box then asks which law field (the "/" list). */
  onChange: (mode: Mode) => void;
};

const OPTIONS: { m: Mode; title: string; hint: string; icon: React.ReactNode }[] = [
  { m: 'auto', title: 'Auto', hint: 'Detects whether it’s legal and which law to search', icon: <InfoIcon size={16} /> },
  { m: 'general', title: 'General', hint: 'Answer directly, no law search', icon: <SparkIcon size={16} /> },
  { m: 'law', title: 'Specific', hint: 'Search one law field you choose (or type /)', icon: <ScaleIcon size={16} /> },
];

export default function ModePicker({ mode, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = OPTIONS.find((o) => o.m === mode) ?? OPTIONS[0];

  // Close on outside click; focus the selected item when opening.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    const checked = menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    (checked ?? items?.[0])?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function pick(m: Mode) {
    setOpen(false);
    onChange(m); // the parent moves focus to the chat box
  }

  function onMenuKey(e: React.KeyboardEvent) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [],
    );
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      btnRef.current?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div className="mode" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={`mode-btn ${mode}`}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Choose how your question is answered"
      >
        {mode === 'general' ? <SparkIcon size={14} /> : mode === 'law' ? <ScaleIcon size={14} /> : <InfoIcon size={14} />}
        <span className="mode-label">{current.title}</span>
        <ChevronIcon size={13} className="mode-chev" />
      </button>

      {open && (
        <div className="mode-menu" role="menu" aria-label="Answer mode" ref={menuRef} onKeyDown={onMenuKey}>
          {OPTIONS.map((o) => (
            <button
              key={o.m}
              type="button"
              role="menuitemradio"
              aria-checked={mode === o.m}
              className={`mode-item${mode === o.m ? ' active' : ''}`}
              onClick={() => pick(o.m)}
            >
              <span className="mode-icon">{o.icon}</span>
              <span className="mode-text">
                <strong>{o.title}</strong>
                <small>{o.hint}</small>
              </span>
              {mode === o.m && <CheckIcon size={15} className="mode-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
