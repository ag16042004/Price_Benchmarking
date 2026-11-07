import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

/** Loads an admin list and exposes reload(). */
export function useList(path) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => api(path).then((d) => { setRows(d); setError(''); }).catch((e) => setError(e.message)), [path]);
  useEffect(() => { reload(); }, [reload]);
  return { rows, error, reload };
}

export const Alert = ({ children }) => children
  ? <div role="alert" className="mb-4 rounded-2xl border border-[#f3c6cc] bg-bad-bg px-4 py-3 text-sm font-medium text-bad">{children}</div> : null;

/** Table body for the tinted-header tables used across the app. */
export const Table = ({ head, children, empty }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-[13px]">
      <thead className="bg-tint">
        <tr>{head.map((h) => <th key={h} className="th">{h}</th>)}</tr>
      </thead>
      <tbody className="[&>tr]:border-t [&>tr]:border-line/70">{children}</tbody>
    </table>
    {empty && <p className="p-8 text-center text-sm text-body">{empty}</p>}
  </div>
);

export const Stat = ({ icon: Icon, value, label, tag }) => (
  <div className="card flex items-center gap-4 px-5 py-4">
    <span className="raised flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary"><Icon size={18} /></span>
    <div className="min-w-0">
      <div className="tnum text-[22px] font-bold leading-tight text-ink">{value}</div>
      <div className="text-xs text-body">{label}</div>
    </div>
    {tag && <span className="ml-auto self-start text-[11px] font-bold text-ok">{tag}</span>}
  </div>
);
