import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, FileText, Settings, Database, Check, ClipboardList, ArrowRight } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { Alert, Stat } from '../components/AdminBits.jsx';
import { api } from '../api.js';

import { TYPE_LABEL } from '../labels.js';

const MODES = [
  { to: '/query/exact', icon: Search, title: 'Exact Make/Model', text: 'Search by a specific item, manufacturer and model number.', pill: 'Best for known products' },
  { to: '/query/specs', icon: FileText, title: 'By Specifications', text: 'Find comparable items using technical specification and value pairs.', pill: 'Flexible matching' },
  { to: '/query/service', icon: Settings, title: 'By Services', text: 'Compare service costs by service type, location and requirements.', pill: 'Location-aware' },
];

const initials = (s) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const when = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function QueryHub() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/query/stats').then(setS).catch((e) => setError(e.message)); }, []);

  return (
    <>
      <PageHeader eyebrow="CASPER · Price benchmarking" title="Find Price Benchmarks" subtitle="Choose a search mode to find reliable prices from approved sources." crumbs={[['Find Price Benchmarks']]} />
      <Alert>{error}</Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat icon={ClipboardList} value={s?.total ?? '—'} label="Total queries" />
        <Stat icon={Database} value={s?.activeSources ?? '—'} label="Trusted sources" tag="Active" />
        <Stat icon={Check} value={s?.completed ?? '—'} label="Queries with results" tag="Completed" />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {MODES.map(({ to, icon: Icon, title, text, pill }) => (
          <Link key={to} to={to} className="card group relative flex min-h-[180px] flex-col p-5 hover:border-[#b9c8ee]">
            <span className="raised mb-4 flex h-11 w-11 items-center justify-center rounded-xl text-primary"><Icon size={19} /></span>
            <div className="text-base font-bold text-ink">{title}</div>
            <p className="mt-1.5 max-w-[16rem] text-xs leading-relaxed text-body">{text}</p>
            <div className="mt-auto flex items-center justify-between pt-4">
              <span className="pill">{pill}</span>
              <span className="btn-icon h-7 w-7 rounded-full" aria-hidden="true"><ArrowRight size={13} /></span>
            </div>
          </Link>
        ))}
      </div>

      <section className="card mt-4 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-base font-bold text-ink">Recent queries</h2><p className="mt-1 text-xs text-body">Continue where you left off.</p></div>
          <Link to="/history" className="btn-soft py-2 text-xs">View history <ArrowRight size={13} /></Link>
        </div>
        {!s ? <p className="py-8 text-sm text-body">Loading…</p> : s.recent.length === 0 ? (
          <p className="py-10 text-center text-sm text-body">No queries yet. Choose a search mode above to run your first one.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line/80 border-t border-line/80">
            {s.recent.slice(0, 3).map((q) => (
              <li key={q.queryId} className="flex items-center gap-4 py-3.5">
                <span className="raised flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-primary">{initials(q.summary)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-ink">{q.summary}</div>
                  <div className="text-xs text-body">{TYPE_LABEL[q.queryType]} · {when(q.createdAt)}</div>
                </div>
                <StatusBadge status={q.status} />
                <Link to={`/results/${q.queryId}`} className="btn-icon" aria-label={`Open ${q.summary}`}><ArrowRight size={14} /></Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
