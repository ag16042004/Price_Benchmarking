import { NavLink } from 'react-router-dom';
import { Database, FileText, IndianRupee, ShieldCheck, Check } from 'lucide-react';

const ITEMS = [
  { to: '/admin/sources', label: 'Sources', icon: Database, note: [ShieldCheck, 'Only active allow-listed domains can be scraped.'] },
  { to: '/admin/categories', label: 'Categories', icon: FileText, note: [Check, 'Categories populate the dropdowns in query forms.'] },
  { to: '/admin/rates', label: 'Service rates', icon: IndianRupee, note: [Check, 'Verified published rates answer service queries when scraping finds nothing.'] },
];

/** Left sub-navigation card + content column shared by the admin pages. */
export default function AdminLayout({ active, children }) {
  const [NoteIcon, noteText] = ITEMS.find((i) => i.to === active).note;
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[210px_minmax(0,1fr)]">
      <aside className="card p-3">
        <nav className="space-y-1.5" aria-label="Admin sections">
          {ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold ${isActive ? 'border border-[#c9d6f3] bg-gradient-to-r from-tint to-[#dfe8fb] text-primary shadow-sm' : 'border border-transparent text-label hover:bg-tint-2'}`}>
              <Icon size={15} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="inset-note mt-4 flex gap-2.5 p-3 text-xs leading-relaxed text-label"><NoteIcon size={15} className="mt-0.5 shrink-0 text-primary" />{noteText}</div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
