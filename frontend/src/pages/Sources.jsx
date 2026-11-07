import { useState } from 'react';
import { Plus, Pencil, X, Check, Database, Clock, Search } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import AdminLayout from '../components/AdminLayout.jsx';
import FieldError from '../components/FieldError.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';
import { Req } from '../components/QueryForm.jsx';
import Select from '../components/Select.jsx';
import { Alert, Table, Stat, useList } from '../components/AdminBits.jsx';
import { api } from '../api.js';

// Must match SOURCE_CATEGORIES on the server (the engine routes by these names).
const CATEGORIES = ['RF & Microwave', 'Antennas & Cabling', 'HF/VHF & Antennas', 'HF/VHF & Radios', 'SDR', 'Distributor', 'Manufacturer', 'Retailer', 'Marketplace', 'Government', 'Services'];
const PAGE = 15;
const EMPTY = { domain: '', name: '', category: 'Distributor', trustLevel: 'MEDIUM' };
const TRUST = { HIGH: 'High trust', MEDIUM: 'Medium trust', LOW: 'Low trust' };
const day = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export default function Sources() {
  const { rows, error, reload } = useList('/admin/sources');
  const [form, setForm] = useState(null);          // null = closed; {id?, ...fields}
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [cat, setCat] = useState('');
  const [page, setPage] = useState(1);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault(); setErrors({}); setFormError('');
    const { id, ...body } = form;
    try {
      await api(id ? `/admin/sources/${id}` : '/admin/sources', { method: id ? 'PATCH' : 'POST', body });
      setForm(null); reload();
    } catch (ex) { setErrors(ex.details); setFormError(Object.keys(ex.details).length ? '' : ex.message); }
  };
  const toggle = async (s) => {
    try { await api(`/admin/sources/${s.id}`, { method: 'PATCH', body: { isActive: !s.isActive } }); reload(); }
    catch (ex) { setFormError(ex.message); }
  };

  // Newest change first, so a source you just added or edited is on the first page.
  const shown = [...(rows || [])].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .filter((s) => (!q || `${s.domain} ${s.name}`.toLowerCase().includes(q.toLowerCase())) && (!status || (status === 'active') === s.isActive) && (!cat || s.category === cat));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const pg = Math.min(page, pages);
  const view = shown.slice((pg - 1) * PAGE, pg * PAGE);
  const active = (rows || []).filter((s) => s.isActive).length;
  const latest = rows?.length ? day(Math.max(...rows.map((s) => new Date(s.updatedAt)))) : '—';

  return (
    <>
      <PageHeader eyebrow="CASPER · Admin / Sources" title="Manage data sources" subtitle="Add, edit or deactivate domains that CASPER is allowed to query." crumbs={[['Manage data sources']]}>
        <button className="btn-primary" onClick={() => { setForm(EMPTY); setErrors({}); setFormError(''); }}><Plus size={15} /> Add source</button>
      </PageHeader>
      <Alert>{error || (!form && formError)}</Alert>

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <Stat icon={Database} value={rows?.length ?? '—'} label="Configured domains" tag="Allow-list" />
        <Stat icon={Check} value={rows ? active : '—'} label="Active sources" tag="Approved" />
        <Stat icon={Clock} value={latest} label="Latest change" />
      </div>

      <AdminLayout active="/admin/sources">
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-4 pt-5">
            <div><h2 className="text-base font-bold text-ink">Approved domains</h2><p className="mt-1 text-xs text-body">Source access is governed centrally.</p></div>
            <div className="flex items-center gap-2.5">
              <div className="relative"><Search size={14} className="absolute left-3 top-3 text-body" /><input className="input w-48 py-2 pl-9 text-xs" placeholder="Search domains…" aria-label="Search domains" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
              <Select small align="right" aria-label="Filter by type" value={cat} onChange={(v) => { setCat(v); setPage(1); }}
                options={[{ value: '', label: 'All types' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]} />
              <Select small align="right" aria-label="Filter by status" value={status} onChange={(v) => { setStatus(v); setPage(1); }}
                options={[{ value: '', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
            </div>
          </div>
          {rows === null ? <p className="p-8 text-sm text-body" aria-busy="true">Loading…</p> : (
            <Table head={['Domain', 'Source name', 'Category', 'Status', 'Last updated', 'Actions']} empty={shown.length ? '' : 'No sources match.'}>
              {view.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3.5 font-bold text-primary">{s.domain}</td>
                  <td className="px-4 py-3.5 text-label">{s.name}</td>
                  <td className="px-4 py-3.5 text-label">{s.category}<div className="text-[11px] text-body">{TRUST[s.trustLevel]}</div></td>
                  <td className="px-4 py-3.5"><StatusBadge status={s.isActive ? 'ACTIVE' : 'INACTIVE'} /></td>
                  <td className="px-4 py-3.5 text-body">{day(s.updatedAt)}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-2">
                      <button className="btn-icon" aria-label={`Edit ${s.domain}`} onClick={() => { setForm({ id: s.id, domain: s.domain, name: s.name, category: s.category, trustLevel: s.trustLevel }); setErrors({}); setFormError(''); }}><Pencil size={13} /></button>
                      <button className="btn-icon" aria-label={`${s.isActive ? 'Deactivate' : 'Activate'} ${s.domain}`} onClick={() => toggle(s)}>{s.isActive ? <X size={14} /> : <Check size={14} />}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-6 py-3.5 text-[11px] text-body">
            <span>Showing {shown.length ? (pg - 1) * PAGE + 1 : 0}–{(pg - 1) * PAGE + view.length} of {shown.length} domains · changes apply to future queries</span>
            {pages > 1 && (
              <nav className="flex items-center gap-1.5" aria-label="Pagination">
                {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                  <button key={n} onClick={() => setPage(n)} aria-current={n === pg ? 'page' : undefined}
                    className={`h-7 w-7 rounded-lg text-xs font-bold ${n === pg ? 'bg-gradient-to-b from-primary-2 to-primary text-white shadow-md' : 'raised text-primary'}`}>{n}</button>
                ))}
              </nav>
            )}
          </div>
        </section>
      </AdminLayout>

      {form && (
        <Modal title={form.id ? 'Edit source' : 'Add source'} subtitle="Configure an allowed source domain and its trust level." onClose={() => setForm(null)} onSubmit={save}>
          {formError && <div role="alert" className="mb-4 rounded-xl border border-[#f3c6cc] bg-bad-bg px-3 py-2 text-xs font-medium text-bad">{formError}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="domain">Domain <Req /></label>
              <input id="domain" className="input" placeholder="example.gov.in" value={form.domain} onChange={set('domain')} aria-invalid={!!errors.domain} /><FieldError message={errors.domain} /></div>
            <div><label className="label" htmlFor="name">Source name <Req /></label>
              <input id="name" className="input" placeholder="Name shown in results" value={form.name} onChange={set('name')} aria-invalid={!!errors.name} /><FieldError message={errors.name} /></div>
            <div><label className="label" htmlFor="category">Source type <Req /></label>
              <Select id="category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORIES.map((c) => ({ value: c, label: c }))} /><FieldError message={errors.category} /></div>
            <div><label className="label" htmlFor="trust">Trust level <Req /></label>
              <Select id="trust" value={form.trustLevel} onChange={(v) => setForm({ ...form, trustLevel: v })} options={Object.keys(TRUST).map((k) => ({ value: k, label: k[0] + k.slice(1).toLowerCase() }))} /><FieldError message={errors.trustLevel} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}
