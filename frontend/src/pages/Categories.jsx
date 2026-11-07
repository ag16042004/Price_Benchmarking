import { useState } from 'react';
import { Plus, Pencil, X, Check } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import Select from '../components/Select.jsx';
import AdminLayout from '../components/AdminLayout.jsx';
import FieldError from '../components/FieldError.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';
import { Req } from '../components/QueryForm.jsx';
import { Alert, Table, useList } from '../components/AdminBits.jsx';
import { api } from '../api.js';

const TABS = [['item-types', 'Item types', 'item type'], ['service-types', 'Service types', 'service type']];

export default function Categories() {
  const [tab, setTab] = useState('item-types');
  const { rows, error, reload } = useList(`/admin/${tab}`);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const label = TABS.find((t) => t[0] === tab)[2];

  const save = async (e) => {
    e.preventDefault(); setErrors({}); setFormError('');
    const { id, kind, active, ...body } = form;
    try {
      await api(id ? `/admin/${kind}/${id}` : `/admin/${kind}`, { method: id ? 'PATCH' : 'POST', body: { ...body, isActive: active === 'active' } });
      if (kind !== tab) setTab(kind);
      setForm(null); reload();
    } catch (ex) { setErrors(ex.details); setFormError(Object.keys(ex.details).length ? '' : ex.message); }
  };
  const toggle = async (c) => {
    try { await api(`/admin/${tab}/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } }); reload(); }
    catch (ex) { setFormError(ex.message); }
  };

  return (
    <>
      <PageHeader eyebrow="CASPER · Admin / Categories" title="Manage categories" subtitle="Maintain the item and service types used in query forms." crumbs={[['Manage categories']]}>
        <button className="btn-primary" onClick={() => { setForm({ kind: tab, name: '', description: '', active: 'active' }); setErrors({}); setFormError(''); }}><Plus size={15} /> Add {label}</button>
      </PageHeader>
      <Alert>{error || (!form && formError)}</Alert>

      <AdminLayout active="/admin/categories">
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-4 pt-5">
            <div><h2 className="text-base font-bold text-ink">Category configuration</h2><p className="mt-1 text-xs text-body">Changes affect future queries.</p></div>
            <div role="tablist" aria-label="Category kind" className="flex gap-1 rounded-2xl bg-tint p-1">
              {TABS.map(([k, name]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setForm(null); setFormError(''); }}
                  className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === k ? 'raised text-primary' : 'text-body hover:text-ink'}`}>{name}</button>
              ))}
            </div>
          </div>
          {rows === null ? <p className="p-8 text-sm text-body" aria-busy="true">Loading…</p> : (
            <Table head={['#', 'Category', 'Description', 'Status', 'Actions']} empty={rows.length ? '' : 'No categories yet.'}>
              {rows.map((c, i) => (
                <tr key={c.id}>
                  <td className="w-12 px-4 py-3.5 text-body">{i + 1}</td>
                  <td className="px-4 py-3.5 font-bold text-ink">{c.name}</td>
                  <td className="px-4 py-3.5 text-body">{c.description || '—'}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={c.isActive ? 'ACTIVE' : 'INACTIVE'} /></td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-2">
                      <button className="btn-icon" aria-label={`Edit ${c.name}`} onClick={() => { setForm({ id: c.id, kind: tab, name: c.name, description: c.description ?? '', active: c.isActive ? 'active' : 'inactive' }); setErrors({}); setFormError(''); }}><Pencil size={13} /></button>
                      <button className="btn-icon" aria-label={`${c.isActive ? 'Deactivate' : 'Activate'} ${c.name}`} onClick={() => toggle(c)}>{c.isActive ? <X size={14} /> : <Check size={14} />}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-6 py-3.5 text-[11px] text-body">
            <span>{rows?.length ?? 0} {label}s</span><span>Admin-only changes</span>
          </div>
        </section>
      </AdminLayout>

      {form && (
        <Modal title={form.id ? 'Edit category' : 'Add category'} subtitle="Maintain the categories available in query forms." onClose={() => setForm(null)} onSubmit={save}>
          {formError && <div role="alert" className="mb-4 rounded-xl border border-[#f3c6cc] bg-bad-bg px-3 py-2 text-xs font-medium text-bad">{formError}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="cname">Category name <Req /></label>
              <input id="cname" className="input" placeholder="Category name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} /><FieldError message={errors.name} /></div>
            <div><label className="label" htmlFor="ckind">Category type <Req /></label>
              <Select id="ckind" value={form.kind} disabled={!!form.id} onChange={(v) => setForm({ ...form, kind: v })} options={[{ value: 'item-types', label: 'Item' }, { value: 'service-types', label: 'Service' }]} /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="cdesc">Description</label>
              <input id="cdesc" className="input" placeholder="Short category description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><FieldError message={errors.description} /></div>
            <div><label className="label" htmlFor="cstatus">Status <Req /></label>
              <Select id="cstatus" value={form.active} onChange={(v) => setForm({ ...form, active: v })} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} /></div>
          </div>
        </Modal>
      )}
    </>
  );
}
