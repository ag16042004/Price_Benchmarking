import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import Select from '../components/Select.jsx';
import TipsPanel from '../components/TipsPanel.jsx';
import { Field, FormCard, FormActions } from '../components/QueryForm.jsx';
import { api } from '../api.js';

const EMPTY = { itemName: '', itemType: '', make: '', model: '' };
const TIPS = ['Use the official make and model name.', 'Select the closest matching item type.', 'Check variations such as memory, storage and generation.', 'Results retain the source URL and available vintage.'];

export default function ExactMatch() {
  const nav = useNavigate();
  const [f, setF] = useState(EMPTY);
  const [types, setTypes] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { api('/meta/item-types').then(setTypes).catch((e) => setFormError(e.message)); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({}); setFormError('');
    try {
      const res = await api('/query/exact-match', { method: 'POST', body: f });
      nav(`/results/${res.queryId}`);
    } catch (ex) {
      setErrors(ex.details);
      setFormError(Object.keys(ex.details).length ? '' : ex.message);  // form stays filled on error
    } finally { setBusy(false); }
  };

  const text = (id, label) => (
    <Field id={id} label={label} error={errors[id]}>
      <input id={id} className="input" value={f[id]} onChange={set(id)} aria-invalid={!!errors[id]} />
    </Field>
  );

  return (
    <>
      <PageHeader eyebrow="CASPER · Query / Exact Make-Model" title="Exact Make/Model" subtitle="Enter the item details to find source-attributed price benchmarks." crumbs={[['Exact Make/Model']]} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_245px]">
        <FormCard title="Item details" subtitle="Use the manufacturer’s official make and model when available." pill="Required fields marked *" onSubmit={submit} formError={formError}>
          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
            {text('itemName', 'Item name')}
            <Field id="itemType" label="Item type" error={errors.itemType}>
              <Select id="itemType" value={f.itemType} onChange={(v) => setF({ ...f, itemType: v })} placeholder="Select type" invalid={!!errors.itemType} options={types.map((t) => ({ value: t.name, label: t.name }))} />
            </Field>
            {text('make', 'Make / Manufacturer')}
            {text('model', 'Model')}
          </div>
          <FormActions>
            <button type="button" className="btn-soft" onClick={() => { setF(EMPTY); setErrors({}); }}>Clear form</button>
            <button type="submit" className="btn-primary" disabled={busy}><Search size={14} /> {busy ? 'Searching…' : 'Search sources'} {!busy && <ArrowRight size={14} />}</button>
          </FormActions>
        </FormCard>
        <TipsPanel tips={TIPS} note="Only active, allow-listed sources are queried." />
      </div>
    </>
  );
}
