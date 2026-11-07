import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * Custom dropdown. A native <select> popup is drawn by the browser and cannot take the
 * glass / raised styling, so this renders its own listbox. Keyboard: arrows, Home/End,
 * Enter or Space to choose, Escape or Tab to close.
 * options: [{ value, label }]. onChange receives the chosen value.
 */
export default function Select({ id, value, onChange, options, placeholder = 'Select', small = false, invalid = false, disabled = false, align = 'left', 'aria-label': ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef(null);
  const list = useRef(null);
  const listId = useId();
  const selectedIndex = options.findIndex((o) => String(o.value) === String(value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  useEffect(() => { if (open) list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' }); }, [open, active]);

  const openList = () => { if (disabled) return; setActive(selectedIndex >= 0 ? selectedIndex : 0); setOpen(true); };
  const choose = (o) => { onChange(o.value); setOpen(false); root.current?.querySelector('button')?.focus(); };
  const move = (d) => setActive((a) => Math.min(options.length - 1, Math.max(0, a + d)));

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); open ? move(1) : openList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); open ? move(-1) : openList(); }
    else if (e.key === 'Home' && open) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && open) { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open && options[active]) choose(options[active]); else openList();
    } else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={root} className={`relative ${small ? 'inline-block' : ''}`}>
      <button type="button" id={id} role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-label={ariaLabel}
        aria-invalid={invalid || undefined} disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKeyDown}
        className={`input flex items-center justify-between gap-3 text-left ${small ? '!w-auto !py-1.5 text-xs' : ''} ${disabled ? 'opacity-60' : ''}`}>
        <span className={`truncate ${selected ? '' : 'text-[#98a1bb]'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={small ? 13 : 15} aria-hidden="true" className={`shrink-0 text-smart ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul ref={list} id={listId} role="listbox" aria-label={ariaLabel}
          className={`absolute z-40 mt-2 max-h-64 w-max min-w-full max-w-xs overflow-auto rounded-2xl border border-white bg-white/[0.96] p-1.5 shadow-[0_1px_0_#fff_inset,0_26px_50px_-18px_rgba(27,38,79,0.45),0_4px_14px_-6px_rgba(44,77,150,0.18)] backdrop-blur-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {options.length === 0 && <li className="px-3 py-2 text-xs text-body">No options</li>}
          {options.map((o, i) => {
            const isSel = i === selectedIndex;
            return (
              <li key={String(o.value)} role="option" aria-selected={isSel}
                onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)} onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl px-3 py-2 text-[13px] ${isSel ? 'border border-[#d5e0f7] bg-gradient-to-r from-tint to-[#e2eafc] font-bold text-primary shadow-[0_6px_12px_-8px_rgba(44,77,150,0.5)]' : 'border border-transparent text-label'} ${i === active && !isSel ? 'bg-tint-2' : ''}`}>
                <span className="whitespace-nowrap">{o.label}</span>
                {isSel && <Check size={14} aria-hidden="true" className="shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
