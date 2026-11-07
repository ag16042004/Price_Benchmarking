import FieldError from './FieldError.jsx';

export const Req = () => <span className="text-bad">*</span>;

/** Label + control + error, used by the three query forms. */
export function Field({ id, label, error, children, hint }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label} <Req /></label>
      {children}
      {hint}
      <FieldError message={error} />
    </div>
  );
}

/** The white form card with its header row (title, helper line, pill on the right). */
export function FormCard({ title, subtitle, pill, onSubmit, formError, children }) {
  return (
    <form onSubmit={onSubmit} noValidate className="card p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div><h2 className="text-base font-bold text-ink">{title}</h2><p className="mt-1 text-xs text-body">{subtitle}</p></div>
        <span className="pill whitespace-nowrap">{pill}</span>
      </div>
      {formError && <div role="alert" className="mb-4 rounded-xl border border-[#f3c6cc] bg-bad-bg px-3 py-2 text-xs font-medium text-bad">{formError}</div>}
      {children}
    </form>
  );
}

export const FormActions = ({ children }) => <div className="mt-6 flex justify-end gap-3 border-t border-line pt-5">{children}</div>;
