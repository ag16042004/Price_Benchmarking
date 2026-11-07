import { useEffect, useState } from 'react';
import { Plus, Pencil, X, Check } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import Select from '../components/Select.jsx';
import AdminLayout from '../components/AdminLayout.jsx';
import FieldError from '../components/FieldError.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';
import { Alert, Table, useList } from '../components/AdminBits.jsx';
import { api } from '../api.js';

const EMPTY = { serviceType: '', location: '', description: '', price: '', currency: 'INR', sourceName: '', sourceUrl: '', vintage: '' };

export default function Rates() {
  const { rows, error, reload } = useList('/admin/rates');
  const [types, setTypes] = useState([]);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  useEffect(() => { api('/meta/service-types').then(setTypes).catch(() => {}); }, []);

  const save = async (e) => {
    e.preventDefault(); setErrors({}); setFormError('');
    const { id, ...body } = form;
    try {
      await api(id ? `/admin/rates/${id}` : '/admin/rates', { method: id ? 'PATCH' : 'POST', body });
      setForm(null); reload();
    } catch (ex) { setErrors(ex.details); setFormError(Object.keys(ex.details).length ? '' : ex.message); }
  };
  const toggle = async (r) => {
    try { await api(`/admin/rates/${r.id}`, { method: 'PATCH', body: { isActive: !r.isActive } }); reload(); }
    catch (ex) { setFormError(ex.message); }
  };
  const field = (id, label, props = {}) => (
    <div><label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input" value={form[id]} onChange={set(id)} aria-invalid={!!errors[id]} {...props} />
      <FieldError message={errors[id]} /></div>
  );

  return (
    <>
      <PageHeader eyebrow="CASPER · Admin / Service rates" title="Service rates" subtitle="Published rates you have verified (rate contracts, official schedules). They answer service queries when scraping finds nothing." crumbs={[['Service rates']]}>
        <button className="btn-primary" onClick={() => { setForm(EMPTY); setErrors({}); setFormError(''); }}><Plus size={15} /> Add rate</button>
      </PageHeader>
      <Alert>{error || (!form && formError)}</Alert>

      <AdminLayout active="/admin/rates">
        <section className="card overflow-hidden">
          <div className="px-6 pb-4 pt-5"><h2 className="text-base font-bold text-ink">Curated rates</h2><p className="mt-1 text-xs text-body">Every rate needs a source link and a publication date.</p></div>
          {rows === null ? <p className="p-8 text-sm text-body" aria-busy="true">Loading…</p> : (
            <Table head={['Service', 'Location', 'Price', 'Source', 'Published', 'Status', 'Actions']} empty={rows.length ? '' : 'No curated rates yet.'}>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3.5 font-bold text-ink">{r.serviceType}</td>
                  <td className="px-4 py-3.5 text-label">{r.location}</td>
                  <td className="tnum px-4 py-3.5 font-bold text-ink">{new Intl.NumberFormat(r.currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: r.currency }).format(r.price)}</td>
                  <td className="px-4 py-3.5"><a className="font-bold text-primary hover:underline" href={r.sourceUrl} target="_blank" rel="noopener noreferrer">{r.sourceName}</a></td>
                  <td className="px-4 py-3.5 text-body">{new Date(r.vintage).toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={r.isActive ? 'ACTIVE' : 'INACTIVE'} /></td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-2">
                      <button className="btn-icon" aria-label={`Edit rate ${r.sourceName}`} onClick={() => { setForm({ ...EMPTY, ...r, description: r.description ?? '', vintage: r.vintage.slice(0, 10) }); setErrors({}); setFormError(''); }}><Pencil size={13} /></button>
                      <button className="btn-icon" aria-label={`${r.isActive ? 'Deactivate' : 'Activate'} rate ${r.sourceName}`} onClick={() => toggle(r)}>{r.isActive ? <X size={14} /> : <Check size={14} />}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
          <div className="border-t border-line/70 px-6 py-3.5 text-[11px] text-body">Changes are applied to future queries.</div>
        </section>
      </AdminLayout>

      {form && (
        <Modal title={form.id ? 'Edit rate' : 'Add rate'} subtitle="Enter a verified, published service rate." onClose={() => setForm(null)} onSubmit={save}>
          {formError && <div role="alert" className="mb-4 rounded-xl border border-[#f3c6cc] bg-bad-bg px-3 py-2 text-xs font-medium text-bad">{formError}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="serviceType">Service type *</label>
              <Select id="serviceType" value={form.serviceType} onChange={(v) => setForm({ ...form, serviceType: v })} placeholder="Select service type" invalid={!!errors.serviceType} options={types.map((t) => ({ value: t.name, label: t.name }))} />
              <FieldError message={errors.serviceType} /></div>
            {field('location', 'Location (city) *', { placeholder: 'e.g. Indore' })}
            {field('price', 'Price *', { inputMode: 'decimal' })}
            {field('currency', 'Currency', { maxLength: 3 })}
            {field('sourceName', 'Source name *', { placeholder: 'e.g. MP Rate Contract 2026' })}
            {field('sourceUrl', 'Source link *', { placeholder: 'https://…' })}
            {field('vintage', 'Date published *', { type: 'date' })}
            {field('description', 'Description')}
          </div>
        </Modal>
      )}
    </>
  );
}
