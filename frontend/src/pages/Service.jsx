import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import Select from '../components/Select.jsx';
import TipsPanel from '../components/TipsPanel.jsx';
import { Field, FormCard, FormActions } from '../components/QueryForm.jsx';
import { api } from '../api.js';

const EMPTY = { serviceType: '', location: '', description: '', coverage: '', duration: '' };
const DURATIONS = ['3 months', '6 months', '12 months', '24 months'];
const TIPS = ['State the location or region explicitly.', 'Include scope, quantity and duration.', 'Mention service-level requirements if relevant.', 'Compare the service provider and the source date.'];

export default function Service() {
  const nav = useNavigate();
  const [f, setF] = useState(EMPTY);
  const [types, setTypes] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { api('/meta/service-types').then(setTypes).catch((e) => setFormError(e.message)); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({}); setFormError('');
    // Quantity and duration are optional context. The API takes one free-text description, so they are appended to it.
    const extra = [f.coverage.trim() && `Quantity/coverage: ${f.coverage.trim()}.`, f.duration && `Duration: ${f.duration}.`].filter(Boolean).join(' ');
    const description = [f.description.trim(), extra].filter(Boolean).join(' ');
    try {
      const res = await api('/query/service', { method: 'POST', body: { serviceType: f.serviceType, location: f.location, description } });
      nav(`/results/${res.queryId}`);
    } catch (ex) {
      setErrors(ex.details);
      setFormError(Object.keys(ex.details).length ? '' : ex.message);
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader eyebrow="CASPER · Query / Services" title="Search for Services" subtitle="Enter service details to find comparable costs from approved sources." crumbs={[['Search for Services']]} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_245px]">
        <FormCard title="Service requirements" subtitle="Describe the service and where it is required." pill="Location-aware" onSubmit={submit} formError={formError}>
          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
            <Field id="serviceType" label="Service type" error={errors.serviceType}>
              <Select id="serviceType" value={f.serviceType} onChange={(v) => setF({ ...f, serviceType: v })} placeholder="Select service type" invalid={!!errors.serviceType} options={types.map((t) => ({ value: t.name, label: t.name }))} />
            </Field>
            <Field id="location" label="Location" error={errors.location}>
              <input id="location" className="input" placeholder="City, State (e.g. Indore, Madhya Pradesh)" value={f.location} onChange={set('location')} aria-invalid={!!errors.location} />
            </Field>
            <div className="sm:col-span-2">
              <Field id="description" label="Service description" error={errors.description}
                hint={<div className="mt-1.5 flex justify-between text-[11px] text-body"><span>Avoid including confidential information.</span><span className="tnum">{f.description.length}/500</span></div>}>
                <textarea id="description" rows={4} maxLength={500} className="input resize-y" placeholder="e.g. On-site hardware support for 50 desktop computers including maintenance" value={f.description} onChange={set('description')} aria-invalid={!!errors.description} />
              </Field>
            </div>
            <div>
              <label className="label" htmlFor="coverage">Quantity / coverage</label>
              <input id="coverage" className="input" placeholder="e.g. 50 desktop computers" value={f.coverage} onChange={set('coverage')} />
            </div>
            <div>
              <label className="label" htmlFor="duration">Duration</label>
              <Select id="duration" value={f.duration} onChange={(v) => setF({ ...f, duration: v })} placeholder="Not specified" options={[{ value: '', label: 'Not specified' }, ...DURATIONS.map((d) => ({ value: d, label: d }))]} />
            </div>
          </div>
          <FormActions>
            <Link to="/query" className="btn-soft">Cancel</Link>
            <button type="submit" className="btn-primary" disabled={busy}><Search size={14} /> {busy ? 'Searching…' : 'Search service costs'} {!busy && <ArrowRight size={14} />}</button>
          </FormActions>
        </FormCard>
        <TipsPanel title="Service search tips" tips={TIPS} note="Service prices may vary by location, scope and contract duration." />
      </div>
    </>
  );
}
