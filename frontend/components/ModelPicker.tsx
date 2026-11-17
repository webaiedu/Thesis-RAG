'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AnswerSettings, EFFORTS, Effort, MODELS, ModelTier, TECHNICALITIES, Technicality,
} from '@/lib/models';
import { CheckIcon, ChevronIcon } from './Icons';

type Props = {
  value: AnswerSettings;
  disabled?: boolean;
  onChange: (s: AnswerSettings) => void;
};

function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: { id: T; label: string; hint: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const current = options.find((o) => o.id === value) ?? options[0];
  function onKey(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = options.findIndex((o) => o.id === value);
    const next = options[(i + (e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length];
    onChange(next.id);
    const btn = (e.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`[data-id="${next.id}"]`);
    btn?.focus();
  }
  return (
    <div className="mp-row">
      <div className="mp-row-head">
        <span>{label}</span>
        <small>{current.hint}</small>
      </div>
      <div className="seg" role="radiogroup" aria-label={label} onKeyDown={onKey}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            data-id={o.id}
            aria-checked={o.id === value}
            tabIndex={o.id === value ? 0 : -1}
            className={`seg-btn${o.id === value ? ' on' : ''}`}
            onClick={() => onChange(o.id)}
            title={o.hint}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Model, effort and technicality, in one menu under the chat box (like Claude's model menu). */
export default function ModelPicker({ value, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const model = MODELS.find((m) => m.id === value.model) ?? MODELS[1];
  const effort = EFFORTS.find((e) => e.id === value.effort) ?? EFFORTS[1];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    menuRef.current?.querySelector<HTMLButtonElement>('.mp-model[aria-checked="true"]')?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function onMenuKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      btnRef.current?.focus();
      return;
    }
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('.mp-model') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (i >= 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    }
  }

  const set = (patch: Partial<AnswerSettings>) => onChange({ ...value, ...patch });

  return (
    <div className="mp" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="mp-btn"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Model, effort and technicality"
      >
        <span className="mp-btn-model">{model.short}</span>
        <span className="mp-btn-effort">{effort.label}</span>
        <ChevronIcon size={13} className="mp-chev" />
      </button>

      {open && (
        <div className="mp-menu" role="dialog" aria-label="Model settings" ref={menuRef} onKeyDown={onMenuKey}>
          <div className="mp-title">Model</div>
          <div role="radiogroup" aria-label="Model" className="mp-models">
            {MODELS.map((m) => {
              const on = m.id === value.model;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`mp-model${on ? ' on' : ''}`}
                  onClick={() => set({ model: m.id as ModelTier })}
                >
                  <span className="mp-model-text">
                    <span className="mp-model-name">
                      {m.name}
                      <span className={`mp-tier ${m.id}`}>{m.tier}</span>
                    </span>
                    <small>{m.hint}</small>
                  </span>
                  <span className="mp-check" aria-hidden="true">{on && <CheckIcon size={16} />}</span>
                </button>
              );
            })}
          </div>
          <div className="mp-sep" />
          <Segmented<Effort> label="Effort" options={EFFORTS} value={value.effort} onChange={(v) => set({ effort: v })} />
          <Segmented<Technicality>
            label="Technicality"
            options={TECHNICALITIES}
            value={value.technicality}
            onChange={(v) => set({ technicality: v })}
          />
        </div>
      )}
    </div>
  );
}
