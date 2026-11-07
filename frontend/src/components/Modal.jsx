import { useEffect, useRef } from 'react';
import { X, Check } from 'lucide-react';

/** Centered dialog over a blurred backdrop. Closes on Escape; first field gets focus. */
export default function Modal({ title, subtitle, onClose, onSubmit, submitLabel = 'Save changes', children }) {
  const ref = useRef(null);
  // Focus the first field once, when the dialog opens. (Doing this on every render would steal focus while typing.)
  useEffect(() => { ref.current?.querySelector('input, select, textarea')?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1b264f]/25 p-4 backdrop-blur-md" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form ref={ref} role="dialog" aria-modal="true" aria-label={title} onSubmit={onSubmit} noValidate
        className="w-full max-w-[470px] rounded-[26px] border border-white bg-gradient-to-br from-white to-[#f1f4fc] p-6 shadow-[0_30px_70px_-20px_rgba(27,38,79,0.45)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-ink">{title}</h2>
            {subtitle && <p className="mt-1 text-xs text-body">{subtitle}</p>}
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close dialog"><X size={16} /></button>
        </div>
        {children}
        <div className="mt-5 flex justify-end gap-3 border-t border-line pt-4">
          <button type="button" className="btn-soft" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary"><Check size={15} /> {submitLabel}</button>
        </div>
      </form>
    </div>
  );
}
