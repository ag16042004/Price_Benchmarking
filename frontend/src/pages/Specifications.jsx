import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ArrowRight, Plus, Trash2 } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import ComboInput from '../components/ComboInput.jsx';
import Select from '../components/Select.jsx';
import TipsPanel from '../components/TipsPanel.jsx';
import FieldError from '../components/FieldError.jsx';
import { Field, FormCard, FormActions, Req } from '../components/QueryForm.jsx';
import { api } from '../api.js';

const SUGGESTED_KEYS = ['Processor', 'RAM', 'Storage', 'Display', 'Operating System', 'Frequency Range', 'Gain', 'Connector', 'Impedance', 'Power', 'Interface'];
const EMPTY_ROW = { key: '', value: '' };
const TIPS = ['Use standard units (GB, GHz, inches, watts).', 'Keep the product type broad enough for matching.', 'Use multiple specifications to reduce false matches.', 'A listing is shown when it meets at least 60% of your specifications; each result shows its match percentage.'];

export default function Specifications() {
  const nav = useNavigate();
  const [itemName, setItemName] = useState('');
  const [itemType, setItemType] = useState('');
  const [rows, setRows] = useState([{ ...EMPTY_ROW }]);
  const [types, setTypes] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/meta/item-types').then(setTypes).catch((e) => setFormError(e.message)); }, []);

  const setRow = (i, k) => (e) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));
  const removeRow = (i) => setRows(rows.length === 1 ? [{ ...EMPTY_ROW }] : rows.filter((_, j) => j !== i));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({}); setFormError('');
    // Fully blank rows are ignored; half-filled rows are sent so the server can flag them.
    const specs = rows.filter((r) => r.key.trim() || r.value.trim());
    try {
      const res = await api('/query/specs', { method: 'POST', body: { itemName, itemType, specs } });
      nav(`/results/${res.queryId}`);
    } catch (ex) {
      // Server row indexes refer to the filtered list; keep the rows we sent so they line up.
      setRows(specs.length ? specs : [{ ...EMPTY_ROW }]);
      setErrors(ex.details);
      setFormError(Object.keys(ex.details).length ? '' : ex.message);
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader eyebrow="CASPER · Query / Specifications" title="Search by Specifications" subtitle="Describe technical requirements to find comparable items." crumbs={[['Search by Specifications']]} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_245px]">
        <FormCard title="Item details" subtitle="Add one or more specification–value pairs." pill="Dynamic specifications" onSubmit={submit} formError={formError}>
          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
            <Field id="itemName" label="Item name" error={errors.itemName}>
              <input id="itemName" className="input" value={itemName} onChange={(e) => setItemName(e.target.value)} aria-invalid={!!errors.itemName} />
            </Field>
            <Field id="itemType" label="Item type" error={errors.itemType}>
              <Select id="itemType" value={itemType} onChange={setItemType} placeholder="Select type" invalid={!!errors.itemType} options={types.map((t) => ({ value: t.name, label: t.name }))} />
            </Field>
          </div>

          <fieldset className="mt-5">
            <legend className="label">Specifications <Req /></legend>
            <div className="space-y-2.5">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2.5">
                  <div>
                    <ComboInput options={SUGGESTED_KEYS} placeholder="e.g. RAM" aria-label={`Specification ${i + 1} name`} value={r.key}
                      onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, key: v } : x)))} invalid={!!errors[`specs.${i}.key`]} />
                    <FieldError message={errors[`specs.${i}.key`]} />
                  </div>
                  <div>
                    <input className="input" placeholder="e.g. 16 GB" aria-label={`Specification ${i + 1} value`} value={r.value} onChange={setRow(i, 'value')} aria-invalid={!!errors[`specs.${i}.value`]} />
                    <FieldError message={errors[`specs.${i}.value`]} />
                  </div>
                  <button type="button" className="btn-icon mt-1.5" onClick={() => removeRow(i)} aria-label={`Remove specification ${i + 1}`}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <FieldError message={errors.specs} />
            <button type="button" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#e3eafa] bg-tint-2 py-2.5 text-xs font-bold text-primary shadow-[0_8px_16px_-12px_rgba(44,77,150,0.45)] hover:bg-tint disabled:opacity-50"
              onClick={() => setRows([...rows, { ...EMPTY_ROW }])} disabled={rows.length >= 15}>
              <Plus size={14} /> Add specification
            </button>
            <p className="mt-2 text-[11px] text-body">Add only requirements that matter for product comparability.</p>
          </fieldset>

          <FormActions>
            <Link to="/query" className="btn-soft">Cancel</Link>
            <button type="submit" className="btn-primary" disabled={busy}><Search size={14} /> {busy ? 'Searching…' : 'Search sources'} {!busy && <ArrowRight size={14} />}</button>
          </FormActions>
        </FormCard>
        <TipsPanel title="Specification tips" tips={TIPS} note="Products are compared only when the item name matches and enough of your specifications are found." />
      </div>
    </>
  );
}
