import { HelpCircle, ShieldCheck } from 'lucide-react';

export default function TipsPanel({ title = 'Search tips', tips, note }) {
  return (
    <aside className="card self-start p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><HelpCircle size={14} className="text-primary" /> {title}</h2>
      <ul className="mt-3 list-disc space-y-2.5 pl-4 text-xs leading-relaxed text-body marker:text-smart">{tips.map((t) => <li key={t}>{t}</li>)}</ul>
      {note && <div className="inset-note mt-4 flex gap-2.5 p-3 text-xs leading-relaxed text-label"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" />{note}</div>}
    </aside>
  );
}
