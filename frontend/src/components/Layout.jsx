import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Landmark, Search, History, Database, HelpCircle, LogOut } from 'lucide-react';
import { useAuth } from '../auth.jsx';

function NavItem({ to, icon: Icon, label, active }) {
  return (
    <Link to={to} aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold ${active ? 'border border-[#c9d6f3] bg-gradient-to-b from-white to-tint text-primary shadow-[0_8px_16px_-8px_rgba(44,77,150,0.45)]' : 'border border-transparent text-label hover:bg-white/70'}`}>
      <Icon size={15} /> {label}
    </Link>
  );
}

/** A small button that opens a floating panel; closes on outside click or Escape. */
function Popover({ button, label, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label={label} className={typeof button === 'function' ? '' : 'btn-icon h-9 w-9'}>
        {typeof button === 'function' ? button() : button}
      </button>
      {open && <div role="region" aria-label={label} className="absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl border border-white bg-white p-4 text-xs text-body shadow-[0_24px_50px_-20px_rgba(27,38,79,0.45)]">{children}</div>}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const initials = user.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const isQuery = pathname.startsWith('/query') || pathname.startsWith('/results');

  return (
    <div className="flex min-h-screen flex-col px-4 pt-3">
      <header className="glass relative z-20 mx-auto flex w-full max-w-[1380px] items-center justify-between gap-4 rounded-[22px] px-3 py-2.5">
        <div className="flex items-center gap-10">
        <Link to="/query" className="flex items-center gap-3 pr-2">
          <span className="raised flex h-10 w-10 items-center justify-center rounded-xl text-primary"><Landmark size={20} /></span>
          <span className="leading-tight">
            <span className="block text-base font-extrabold tracking-tight text-ink">CASPER</span>
            <span className="hidden text-[10.5px] text-body sm:block">Government Procurement Intelligence</span>
          </span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1.5">
          <NavItem to="/query" icon={Search} label="Query" active={isQuery} />
          <NavItem to="/history" icon={History} label="History" active={pathname.startsWith('/history')} />
          {user.role === 'ADMIN' && <NavItem to="/admin/sources" icon={Database} label="Admin" active={pathname.startsWith('/admin')} />}
        </nav>
        </div>
        <div className="flex items-center gap-2.5">
          <Popover button={<HelpCircle size={16} />} label="Help">
            <p className="mb-1.5 text-sm font-bold text-ink">How CASPER works</p>
            <p>Pick a search mode, fill the form, and CASPER checks only approved sources. Each price keeps its source link and date; if nothing reliable is found, it says so.</p>
          </Popover>
          <Popover label="Account menu" button={() => (
            <span className="raised flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-2 text-[11px] font-bold text-white">{initials}</span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-xs font-bold text-ink">{user.name}</span>
                <span className="block text-[10.5px] text-body">{user.role === 'ADMIN' ? 'Administrator' : 'Procurement Officer'}</span>
              </span>
            </span>
          )}>
            <button onClick={logout} className="btn-soft w-full justify-start"><LogOut size={15} /> Sign out</button>
          </Popover>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1131px] flex-1 pb-6 pt-10"><Outlet /></main>

      <footer className="mx-auto flex w-full max-w-[1131px] flex-wrap items-center justify-between gap-2 pb-6 text-[11px] text-body">
        <span><strong className="text-label">CASPER</strong> · Centralized Automated Solution for Price Estimation and Reasonability <span className="pill ml-2 py-0.5 text-[10px]">Beta</span></span>
        <span>Transparent · Reliable · Evidence-based</span>
      </footer>
    </div>
  );
}
