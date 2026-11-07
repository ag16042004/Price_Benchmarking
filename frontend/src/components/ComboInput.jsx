import { useEffect, useId, useRef, useState } from 'react';

/**
 * A text box with a suggestion list. Replaces the browser's <datalist>, whose popup is drawn by the browser and cannot be
 * styled, so it never matched the rest of the interface. Free text is always allowed; suggestions only help.
 * Keyboard: arrows move, Enter picks the highlighted suggestion (and does not submit the form), Escape closes.
 */
export default function ComboInput({ value, onChange, options, placeholder, invalid = false, 'aria-label': ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef(null);
  const listId = useId();
  const q = value.trim().toLowerCase();
  const shown = options.filter((o) => o.toLowerCase().includes(q) && o.toLowerCase() !== q).slice(0, 8);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const pick = (o) => { onChange(o); setOpen(false); setActive(-1); };
  const onKeyDown = (e) => {
    if (!open || !shown.length) { if (e.key === 'ArrowDown') { setOpen(true); setActive(0); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
  };

  return (
    <div ref={root} className="relative">
      <input className="input" role="combobox" aria-autocomplete="list" aria-expanded={open && shown.length > 0} aria-controls={listId}
        aria-label={ariaLabel} aria-invalid={invalid || undefined} placeholder={placeholder} autoComplete="off" value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown} />
      {open && shown.length > 0 && (
        <ul id={listId} role="listbox" aria-label={ariaLabel}
          className="absolute left-0 z-40 mt-2 max-h-60 w-full overflow-auto rounded-2xl border border-white bg-white/[0.96] p-1.5 shadow-[0_1px_0_#fff_inset,0_26px_50px_-18px_rgba(27,38,79,0.45),0_4px_14px_-6px_rgba(44,77,150,0.18)] backdrop-blur-xl">
          {shown.map((o, i) => (
            <li key={o} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} onMouseEnter={() => setActive(i)}
              className={`cursor-pointer rounded-xl border px-3 py-2 text-[13px] ${i === active ? 'border-[#d5e0f7] bg-gradient-to-r from-tint to-[#e2eafc] font-bold text-primary' : 'border-transparent text-label'}`}>{o}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
