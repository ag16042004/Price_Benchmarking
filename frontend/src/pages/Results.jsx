import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileText, ExternalLink, TriangleAlert, Loader2, Download, Pencil, ArrowRight, ChevronRight, Info } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import Select from '../components/Select.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { api } from '../api.js';
import { TYPE_LABEL } from '../labels.js';
import { downloadCsv } from '../csv.js';

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—');
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const vintageTip = (b) => (b === 'listing' ? 'Date we saw this listing. The price was read from the search listing, not the shop page: open the link to confirm it' : b === 'curated' ? 'Rate entered by an administrator from the linked source' : b === 'retrieved' ? 'No date on the page: shown as the date we retrieved it' : b === 'header' ? 'Date from the page’s Last-Modified header' : 'Date published on the page');

const SORTS = {
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  newest: (a, b) => new Date(b.vintage || 0) - new Date(a.vintage || 0),
};
const MODES = { EXACT_MATCH: '/query/exact', SPECIFICATION: '/query/specs', SERVICE: '/query/service' };

function titleOf(q) {
  if (q.queryType === 'SERVICE') return `${q.serviceType} in ${q.location}`;
  if (q.queryType === 'SPECIFICATION') return q.itemName;
  return `${q.make} ${q.model}`;
}

const TIPS = {
  EXACT_MATCH: ['Check the item name, make and model spelling.', 'Try a more general model or item type.', 'Use specifications instead of an exact model.', 'Check whether an approved source lists the item.'],
  SPECIFICATION: ['Remove the least important specification.', 'Use more common wording and units (e.g. “16 GB”).', 'Try an exact make and model if you know it.', 'Check whether an approved source lists the item.'],
  SERVICE: ['Many services are priced on request, so no public rate may exist.', 'Try a larger nearby city.', 'Use a broader service type.', 'Check whether an approved source lists the service.'],
};

/** Plain-language account of where a "no data" search dropped out, from the counts the server kept. */
function explain(d) {
  const out = [];
  const found = d.searched + (d.shopping || 0);
  if (!found) return ['The search service returned no pages for this item.'];
  out.push(`The search found ${d.searched} pages${d.shopping ? ` and ${d.shopping} shopping listings` : ''}.`);
  if (!d.looked) out.push('None of them looked like the exact item you asked for (the name or model did not match).');
  else if (!d.fromListings) out.push(`${d.looked} looked like the item, but none showed a price that could be read from the listing.`);
  if (d.approved) out.push(`${d.approved} ${d.approved === 1 ? 'was' : 'were'} on approved sources.`);
  if (d.refused) out.push(`${d.refused} ${d.refused === 1 ? 'page was' : 'pages were'} refused by the website${d.refusedSites?.length ? ` (${d.refusedSites.join(', ')})` : ''}. CASPER respects that and does not work around it.`);
  if (d.opened) out.push(`${d.opened} ${d.opened === 1 ? 'page was' : 'pages were'} opened; ${d.withPrice} showed a recognisable price, but none matched the item you asked for.`);
  return out;
}

const exportCsv = (rows, title) => downloadCsv(['Price', 'Currency', 'Source', 'Item details', 'Vintage', 'Link'],
  rows.map((r) => [r.price, r.currency, r.sourceName, r.itemDetails, r.vintage ? new Date(r.vintage).toISOString().slice(0, 10) : '', r.sourceUrl]),
  `casper-${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`);

const Notice = ({ tone, children }) => (
  <div role="note" className={`mb-4 flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-xs ${tone}`}>
    <TriangleAlert size={15} className="mt-0.5 shrink-0" /><span>{children}</span>
  </div>
);

function Shell({ eyebrow, title, subtitle, crumb, children }) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} crumbs={[[crumb]]} />
      {children}
    </>
  );
}

export default function Results() {
  const { id } = useParams();
  const nav = useNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [sort, setSort] = useState('price-asc');
  const [perPage, setPerPage] = useState(25);
  const [pageNo, setPageNo] = useState(1);

  // The API answers 202 immediately; poll until the background job leaves PENDING.
  useEffect(() => {
    let cancelled = false, timer;
    const load = async () => {
      try {
        const d = await api(`/query/${id}`);
        if (cancelled) return;
        setData(d);
        if (d.status === 'PENDING') timer = setTimeout(load, 2000);
      } catch (e) {
        if (!cancelled) setError(e.status === 404 ? 'This query could not be found.' : e.message);
      }
    };
    setData(null); setError(''); load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id]);

  // Re-run the same search and skip the cache.
  const searchAgain = async () => {
    const q = data.query;
    const [path, body] = q.queryType === 'SERVICE' ? ['/query/service', { serviceType: q.serviceType, location: q.location, description: q.description }]
      : q.queryType === 'SPECIFICATION' ? ['/query/specs', { itemName: q.itemName, itemType: q.itemType, specs: q.specifications }]
      : ['/query/exact-match', { itemName: q.itemName, itemType: q.itemType, make: q.make, model: q.model }];
    setRefreshing(true);
    try { nav(`/results/${(await api(path, { method: 'POST', body: { ...body, refresh: true } })).queryId}`); }
    catch (e) { setError(e.message); setRefreshing(false); }
  };

  const rows = useMemo(() => (data ? [...data.results].sort(SORTS[sort]) : []), [data, sort]);

  if (error) return <div role="alert" className="card p-6 text-sm text-bad">{error} <Link className="font-bold underline" to="/query">Back to Query Hub</Link></div>;
  if (!data) return <div className="card p-6 text-sm text-body" aria-busy="true">Loading results…</div>;

  const q = data.query;
  const title = titleOf(q);
  // A saved answer can be stale (a short outage looks like "no data"), so it always comes with a way to search again.
  const cacheBar = data.fromCache && (
    <div role="note" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#d6e0f7] bg-tint px-4 py-3 text-xs text-primary">
      <span className="flex items-center gap-2"><Info size={14} /> Served from a recent identical search. Each row shows the date its price was captured.</span>
      <button className="btn-soft py-1.5 text-xs" onClick={searchAgain} disabled={refreshing}>{refreshing ? 'Searching…' : 'Search again'}</button>
    </div>
  );

  if (data.status === 'PENDING') {
    return (
      <Shell eyebrow="CASPER · Query / Search status" title="Searching approved sources" subtitle="CASPER is checking allowed sources and validating potential matches." crumb="Searching approved sources">
        <div className="card mx-auto max-w-[690px] p-8 text-center" role="status" aria-live="polite">
          <Loader2 className="mx-auto mb-4 animate-spin text-primary" size={34} />
          <h2 className="text-xl font-bold text-ink">Searching sources…</h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-body">We are collecting prices for “{title}” and checking product identity, source eligibility and vintage information. This can take up to a minute.</p>
          <div className="mx-auto mt-7 max-w-lg space-y-2.5" aria-hidden="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-3 animate-pulse rounded-full bg-tint" style={{ width: `${100 - i * 18}%` }} />)}
          </div>
          <div className="mt-8 flex justify-center"><Link to="/query" className="btn-soft">Back to Query Hub</Link></div>
        </div>
      </Shell>
    );
  }

  if (data.status === 'FAILED') {
    return (
      <Shell eyebrow="CASPER · Query / Error" title="The search could not be completed" subtitle="This is a problem on our side, not a “no data” result." crumb="Search failed">
        <div role="alert" className="card mx-auto max-w-[600px] p-8 text-center">
          <span className="raised mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-warn"><TriangleAlert size={24} /></span>
          <h2 className="text-xl font-bold text-ink">Please try again</h2>
          <p className="mt-2 text-xs text-body">Nothing was found and nothing was estimated. Try the search again in a moment.</p>
          <div className="mt-6 flex justify-center"><Link to={MODES[q.queryType]} className="btn-primary">Try again <ArrowRight size={14} /></Link></div>
        </div>
      </Shell>
    );
  }

  if (data.noDataFlag) {
    return (
      <Shell eyebrow="CASPER · Query / No data" title="No reliable data found" subtitle="We could not verify a suitable listing for this query." crumb="No reliable data found">
        <div className="mx-auto max-w-[600px]">{cacheBar}</div>
        <div className="card mx-auto max-w-[600px] p-9 text-center">
          <span className="raised mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-primary"><FileText size={24} /></span>
          <span className="pill relative z-10 mt-3">No verified matches</span>
          <h2 className="mt-2 text-[22px] font-bold text-ink">No reliable data found</h2>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-body">CASPER did not find enough trustworthy source data to return a price benchmark. No estimate has been substituted.</p>
          {data.diagnosis && (
            <div className="mx-auto mt-5 max-w-[420px] text-left text-xs text-body" aria-label="What we tried">
              <div className="mb-1.5 font-bold text-ink">What we tried</div>
              <ul className="list-disc space-y-1 pl-4 marker:text-smart">{explain(data.diagnosis).map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}
          <div className="inset-note mx-auto mt-6 max-w-[420px] p-4 text-left">
            <div className="text-xs font-bold text-ink">Try broadening your search</div>
            <ul className="mt-2.5 list-disc space-y-1.5 pl-4 text-xs text-body marker:text-smart">{TIPS[q.queryType].map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
          <div className="mt-6 flex justify-center gap-3">
            <Link to={MODES[q.queryType]} className="btn-soft"><Pencil size={13} /> Modify query</Link>
            <Link to="/query" className="btn-primary">Start a new search <ArrowRight size={14} /></Link>
          </div>
          <p className="mt-4 text-[11px] text-body">No prices are shown when reliable evidence is unavailable.</p>
        </div>
      </Shell>
    );
  }

  // ---- results
  const showMatch = q.queryType !== 'EXACT_MATCH' && data.results.some((r) => r.matchScore != null);
  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  const pg = Math.min(pageNo, totalPages);
  const first = (pg - 1) * perPage;
  const pageRows = rows.slice(first, first + perPage);
  const cur = rows[0]?.currency;
  const oneCurrency = rows.every((r) => r.currency === cur);
  const money = (n) => new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
  const prices = rows.map((r) => r.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const sources = new Set(rows.map((r) => r.sourceName)).size;
  const summaryLine = [TYPE_LABEL[q.queryType], q.itemType, title].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader eyebrow="CASPER · Query / Results" title={`Results for “${title}”`} subtitle="Showing source-attributed listings returned by the selected query." crumbs={[[`Results for “${title}”`]]}>
        <button className="btn-soft" onClick={() => exportCsv(rows, title)}><Download size={14} /> Export</button>
      </PageHeader>

      {rows.some((r) => r.isReplay) && <Notice tone="border-violet-200 bg-violet-50 text-violet-800">These results were <strong>replayed from a saved recording</strong>, not searched live. Each row shows the date its price was captured.</Notice>}
      {cacheBar}
      {rows.some((r) => r.isMock) && <Notice tone="border-amber-200 bg-warn-bg text-warn">This is <strong>sample data</strong>, not a live search result. It is shown for demonstration, or because no live search provider is configured. Do not cite these figures.</Notice>}

      <section className="card mb-4 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-white to-tint px-6 py-4" aria-label="Query summary">
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-ink">Query summary</div>
          <div className="mt-0.5 truncate text-[11px] text-body">{summaryLine}</div>
          {q.queryType === 'SPECIFICATION' && q.specifications.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Requested specifications">
              {q.specifications.map((x) => <span key={x.key} className="pill">{x.key}: {x.value}</span>)}
            </div>
          )}
        </div>
        <dl className="flex gap-8 text-right">
          {[[rows.length, 'Results'], [sources, 'Sources'], [oneCurrency ? money(lo) : '—', 'Lowest price']].map(([v, l]) => (
            <div key={l}><dd className="tnum text-[15px] font-bold text-ink">{v}</dd><dt className="text-[11px] text-body">{l}</dt></div>
          ))}
        </dl>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 pb-4 pt-5">
          <div><h2 className="text-base font-bold text-ink">Price comparison</h2><p className="mt-1 text-xs text-body">Every price includes the source domain and available vintage.</p></div>
          <div className="flex items-center gap-2.5 text-[11px] text-body">
            <span className="flex items-center gap-2">Sort by
              <Select small align="right" aria-label="Sort results" value={sort} onChange={setSort}
                options={[{ value: 'price-asc', label: 'Price (low to high)' }, { value: 'price-desc', label: 'Price (high to low)' }, { value: 'newest', label: 'Newest first' }]} />
            </span>
            <Select small align="right" aria-label="Results per page" value={perPage} onChange={(v) => { setPerPage(Number(v)); setPageNo(1); }}
              options={[10, 25, 50].map((n) => ({ value: n, label: `${n} per page` }))} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-tint">
              <tr><th className="th w-14">#</th><th className="th">Price{oneCurrency && cur ? ` (${cur})` : ''}</th><th className="th">Source</th><th className="th">Vintage</th><th className="th">Actions</th></tr>
            </thead>
            <tbody className="[&>tr]:border-t [&>tr]:border-line/70">
              {pageRows.map((r, i) => (
                <tr key={r.sourceUrl + i} className="hover:bg-tint-2/60">
                  <td className="px-4 py-4 text-body">{first + i + 1}</td>
                  <td className="px-4 py-4">
                    <div className="tnum text-[15px] font-bold text-ink">{r.formattedPrice}</div>
                    {r.itemDetails && <div className="mt-0.5 max-w-[260px] truncate text-[11px] text-body" title={r.itemDetails}>{r.itemDetails}</div>}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="raised flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-primary">{(r.sourceName || '?')[0].toUpperCase()}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 font-bold text-primary">{r.sourceName}<ExternalLink size={10} aria-hidden="true" /></div>
                        <div className="text-[11px] text-body">{domainOf(r.sourceUrl)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body" title={vintageTip(r.vintageBasis)}>{fmtDate(r.vintage)}</span>
                      {r.vintageBasis === 'curated' && <StatusBadge status="CURATED" />}
                      {r.vintageBasis === 'listing' && <span title={vintageTip('listing')}><StatusBadge status="LISTING" /></span>}
                      {r.unlisted && <span title="Not on the administrator's approved list of sources. Check the shop before citing this price."><StatusBadge status="UNLISTED" /></span>}
                      {r.isStale && <StatusBadge status="OLDER" />}
                      {r.matchScore != null && (showMatch || r.matchScore < 1) && <span className="pill tnum" title={r.matchScore < 1 && !showMatch ? 'The model matches, but the maker was not shown in the listing' : undefined}>{Math.round(r.matchScore * 100)}% match</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <a className="btn-icon" href={r.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`View listing at ${r.sourceName}`}><ExternalLink size={13} /></a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 px-6 py-3.5 text-[11px] text-body">
          <span>Showing {first + 1}–{first + pageRows.length} of {rows.length} source-attributed result{rows.length === 1 ? '' : 's'}</span>
          {totalPages > 1 && (
            <nav className="flex items-center gap-1.5" aria-label="Pagination">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button key={n} onClick={() => setPageNo(n)} aria-current={n === pg ? 'page' : undefined}
                  className={`h-7 w-7 rounded-lg text-xs font-bold ${n === pg ? 'bg-gradient-to-b from-primary-2 to-primary text-white shadow-md' : 'raised text-primary'}`}>{n}</button>
              ))}
              <button className="btn-icon h-7 w-7" disabled={pg === totalPages} onClick={() => setPageNo(pg + 1)} aria-label="Next page"><ChevronRight size={13} /></button>
            </nav>
          )}
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className="card p-6">
          <h2 className="text-base font-bold text-ink">Price spread</h2>
          <p className="mt-1 text-xs text-body">Observed prices across available sources.</p>
          {rows.length >= 2 && oneCurrency ? (
            <>
              <div className="mt-5 flex h-24 items-end gap-2.5" role="img" aria-label={`Price spread from ${money(lo)} to ${money(hi)}`}>
                {[...rows].sort(SORTS['price-asc']).map((r, i) => (
                  <div key={r.sourceUrl + i} className="flex-1 rounded-t-lg bg-gradient-to-b from-primary to-[#c9d4ee]" style={{ height: `${30 + (hi === lo ? 0 : ((r.price - lo) / (hi - lo)) * 70)}%` }} />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-body"><span>Lowest {money(lo)}</span><span>Highest {money(hi)}</span></div>
            </>
          ) : <p className="mt-6 text-xs text-body">The spread is shown when two or more results share a currency.</p>}
        </section>
        <section className="card p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-bold text-ink">Data transparency</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-bg px-2.5 py-1 text-[11px] font-bold text-ok"><span className="h-1.5 w-1.5 rounded-full bg-current" />Traceable</span>
          </div>
          <p className="mt-1 text-xs text-body">Source and vintage are retained for review.</p>
          <p className="mt-4 text-xs leading-relaxed text-body">CASPER reports observed listings only. Prices marked “From listing” were read from a search listing, so open the link to confirm them. Sources marked “Unlisted” are not on the administrator’s approved list. Older data is flagged, and no estimated price is substituted when reliable results are unavailable.</p>
        </section>
      </div>
    </>
  );
}
