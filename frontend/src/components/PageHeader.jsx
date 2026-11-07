import { Link } from 'react-router-dom';

/** crumbs: [[label, to?], ...] after the fixed "Workspace" root. eyebrow is the small caps line. */
export default function PageHeader({ title, subtitle, eyebrow, crumbs = [], children }) {
  return (
    <div className="mb-6">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs text-body">
        <Link to="/query" className="hover:text-primary">Workspace</Link>
        {crumbs.map(([label, to]) => (
          <span key={label} className="flex items-center gap-2">
            <span aria-hidden="true">›</span>
            {to ? <Link to={to} className="hover:text-primary">{label}</Link> : <span className="font-bold text-ink">{label}</span>}
          </span>
        ))}
      </nav>
      {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-2 max-w-2xl text-sm text-body">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
