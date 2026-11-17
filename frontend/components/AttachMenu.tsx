'use client';

import { useEffect, useRef, useState } from 'react';
import { FileIcon, ImageIcon, PaperclipIcon, PlusIcon } from './Icons';

/** What the file picker should offer for each choice (accept="" = any file). */
const CHOICES = [
  {
    id: 'pdf',
    title: 'PDF',
    hint: 'Documents, including scanned pages (OCR)',
    accept: '.pdf,application/pdf',
    icon: <FileIcon size={17} />,
  },
  {
    id: 'photo',
    title: 'Photo',
    hint: 'JPG, PNG, HEIC… text read in Bangla & English',
    accept: 'image/*,.heic,.heif',
    icon: <ImageIcon size={17} />,
  },
  {
    id: 'other',
    title: 'Other files',
    hint: 'Word, Excel, PowerPoint, HTML, text, code…',
    accept: '',
    icon: <PaperclipIcon size={17} />,
  },
] as const;

/** The "+" button beside the mode picker: choose what kind of file to attach. */
export default function AttachMenu({ disabled, onFile }: { disabled?: boolean; onFile: (f: File) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function choose(accept: string) {
    setOpen(false);
    const input = inputRef.current;
    if (!input) return;
    input.accept = accept;
    input.click();
  }

  function onMenuKey(e: React.KeyboardEvent) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      btnRef.current?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div className="attach-menu" ref={wrapRef}>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ''; // picking the same file again still fires
          if (f) onFile(f);
        }}
      />
      <button
        ref={btnRef}
        type="button"
        className={`tool-btn${open ? ' on' : ''}`}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Attach a file"
        title="Attach a file"
      >
        <PlusIcon size={18} />
      </button>
      {open && (
        <div className="am-menu" role="menu" aria-label="Attach" ref={menuRef} onKeyDown={onMenuKey}>
          {CHOICES.map((c) => (
            <button key={c.id} type="button" role="menuitem" className="am-item" onClick={() => choose(c.accept)}>
              <span className={`am-icon ${c.id}`}>{c.icon}</span>
              <span className="mode-text">
                <strong>{c.title}</strong>
                <small>{c.hint}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
