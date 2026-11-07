import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Download, ArrowRight, ShieldCheck, ChevronRight } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import Select from '../components/Select.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { Alert } from '../components/AdminBits.jsx';
import { api } from '../api.js';
import { TYPE_LABEL } from '../labels.js';
import { downloadCsv } from '../csv.js';

const PAGE_SIZE = 10;
const fmt = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const ref = (id) => `CSP-${String(id).padStart(5, '0')}`;

export default function History() {
  const [params] = useSearchParams();
  const urlQ = params.get('q') || '';
  const [type, setType] = useState('');
  const [text, setText] = useState(urlQ);
  const [search, setSearch] = useState(urlQ);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { setText(urlQ); setSearch(urlQ); setPage(1); }, [urlQ]);

  const qs = (extra) => new URLSearchParams({ ...(type && { type }), ...(search && { search }), ...extra }).toString();
  useEffect(() => {
    let live = true;
    setError('');
    api(`/query/history?${new URLSearchParams({ page, pageSize: PAGE_SIZE, ...(type && { type }), ...(search && { search }) })}`)
      .then((d) => live && setData(d)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [page, type, search]);

  const exportHistory = async () => {
    try {
      const items = [];                                    // the server sends at most 50 rows a page, so read every page
      for (let p = 1; ; p++) {
        const d = await api(`/query/history?${qs({ page: p, pageSize: 50 })}`);
        items.push(...d.items);
        if (items.length >= d.total || !d.items.length) break;
      }
      downloadCsv(['Query ID', 'Query', 'Mode', 'Date', 'Outcome', 'Results'],
        items.map((q) => [ref(q.queryId), q.summary, TYPE_LABEL[q.queryType], new Date(q.createdAt).toISOString(), q.status, q.resultCount]), 'casper-query-history.csv');
    } catch (e) { setError(e.message); }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  return (
    <>
      <PageHeader eyebrow="CASPER · Workspace / History" title="Query history" subtitle="Review and reopen previous price-benchmarking searches." crumbs={[['Query history']]}>
        <button className="btn-soft" onClick={exportHistory}><Download size={14} /> Export history</button>
      </PageHeader>
      <Alert>{error}</Alert>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
          <form className="relative w-full max-w-xs" role="search" onSubmit={(e) => { e.preventDefault(); setSearch(text.trim()); setPage(1); }}>
            <Search size={15} className="absolute left-3.5 top-3.5 text-body" />
            <input className="input pl-10" placeholder="Search queries or modes…" aria-label="Search past queries" value={text} onChange={(e) => setText(e.target.value)} />
          </form>
          <Select small align="right" aria-label="Filter by type" value={type} onChange={(v) => { setType(v); setPage(1); }}
            options={[{ value: '', label: 'All query types' }, ...Object.entries(TYPE_LABEL).map(([k, v]) => ({ value: k, label: v }))]} />
        </div>

        {!data ? <p className="p-8 text-sm text-body" aria-busy="true">Loading…</p> : data.items.length === 0 ? (
          <p className="p-10 text-center text-sm text-body">No queries found.</p>
        ) : (
          <ul aria-label="Saved queries" className="divide-y divide-line/70">
            {data.items.map((q) => (
              <li key={q.queryId} className="grid items-center gap-x-4 gap-y-2 px-5 py-4 md:grid-cols-[1.5fr_1.1fr_1.1fr_1fr_auto]">
                <div className="min-w-0"><div className="truncate text-[13px] font-bold text-ink">{q.summary}</div><div className="mt-1 text-[11px] text-body">Query ID: {ref(q.queryId)}</div></div>
                <div><div className="mb-1 text-[11px] text-body">Mode</div><span className="pill">{TYPE_LABEL[q.queryType]}</span></div>
                <div><div className="mb-1 text-[11px] text-body">Date / time</div><div className="text-xs font-bold text-ink">{fmt(q.createdAt)}</div></div>
                <div><div className="mb-1 text-[11px] text-body">Outcome</div><StatusBadge status={q.status} /></div>
                <Link to={`/results/${q.queryId}`} className="btn-soft py-2 text-xs">Reopen <ArrowRight size={13} /></Link>
              </li>
            ))}
          </ul>
        )}

        {data && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 px-5 py-3.5 text-[11px] text-body">
            <span>{data.total} saved {data.total === 1 ? 'query' : 'queries'}</span>
            {pages > 1 && (
              <nav className="flex items-center gap-1.5" aria-label="Pagination">
                {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                  <button key={n} onClick={() => setPage(n)} aria-current={n === page ? 'page' : undefined}
                    className={`h-7 w-7 rounded-lg text-xs font-bold ${n === page ? 'bg-gradient-to-b from-primary-2 to-primary text-white shadow-md' : 'raised text-primary'}`}>{n}</button>
                ))}
                <button className="btn-icon h-7 w-7" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={13} /></button>
              </nav>
            )}
          </div>
        )}
      </section>

      <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-[#cfe6dc] bg-ok-bg/70 px-4 py-3 text-xs text-ok">
        <ShieldCheck size={15} /> Query history is retained for traceability so previously reviewed source links and dates can be reopened.
      </div>
    </>
  );
}
