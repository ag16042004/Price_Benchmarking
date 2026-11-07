import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Landmark, Search, ShieldCheck, FileText, Check, ArrowRight, Eye, EyeOff, UserCheck, Database, UserCog, Briefcase } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';

const FEATURES = [
  [Search, 'Multiple query modes', 'Exact make/model, specifications and services.'],
  [ShieldCheck, 'Allow-list governance', 'Only approved sources are searched.'],
  [FileText, 'Source attribution', 'Every accepted result keeps its source and vintage.'],
  [Check, 'Honest outcomes', 'No estimate is substituted when reliable data is missing.'],
];
const STATS = [['3', 'Query modes'], ['1', 'Governed egress'], ['100%', 'Source-linked results']];

export default function Login() {
  const { user, login, register, demoLogin } = useAuth();
  const nav = useNavigate();
  const from = useLocation().state?.from?.pathname || '/';
  const [mode, setMode] = useState('signin');
  const [f, setF] = useState({ name: '', email: '', password: '', inviteCode: '' });
  const [cfg, setCfg] = useState({ emailDomain: '', inviteCodeRequired: false, demoLogin: false });
  const [offline, setOffline] = useState(false);
  useEffect(() => { api('/auth/config').then(setCfg).catch(() => setOffline(true)); }, []);   // the server decides the sign-up rules; the page just shows them
  const [err, setErr] = useState({ message: '', fields: {} });
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  if (user) return <Navigate to={from} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr({ message: '', fields: {} });
    try {
      if (mode === 'signin') await login(f.email, f.password);
      else await register(f);
      nav(from, { replace: true });
    } catch (ex) {
      setErr({ message: Object.keys(ex.details).length ? '' : ex.message, fields: ex.details });
    } finally { setBusy(false); }
  };

  const demo = async (role) => {
    setBusy(true); setErr({ message: '', fields: {} });
    try { await demoLogin(role); nav(from, { replace: true }); }
    catch (ex) { setErr({ message: ex.message, fields: {} }); }
    finally { setBusy(false); }
  };

  const field = (id, label, type, extra = {}) => (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="relative">
        <input id={id} type={id === 'password' && show ? 'text' : type} className={`input ${id === 'password' ? 'pr-11' : ''}`} value={f[id]} onChange={set(id)} aria-invalid={!!err.fields[id]} {...extra} />
        {id === 'password' && (
          <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-3 text-body hover:text-primary" aria-label={show ? 'Hide characters' : 'Show characters'}>
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </div>
      {err.fields[id] ? <p className="mt-1.5 text-xs font-medium text-bad">{err.fields[id]}</p>
        : id === 'email' && mode === 'register' && cfg.emailDomain && <p className="mt-1.5 text-[11px] text-body">Accounts can only be created with an official <strong className="text-label">@{cfg.emailDomain}</strong> email address.</p>}
    </div>
  );

  return (
    <div className="flex min-h-screen items-start justify-center px-4 py-8 md:py-10">
      <div className="grid w-full max-w-[1180px] items-stretch gap-4 md:grid-cols-[1.27fr_1fr]">
        <section className="relative hidden overflow-hidden rounded-[30px] bg-gradient-to-br from-[#24315d] via-[#3a4d8c] to-[#7285b8] p-9 text-white shadow-[0_40px_80px_-30px_rgba(36,49,93,0.6)] md:block">
          <div aria-hidden="true" className="absolute -right-24 top-40 h-[26rem] w-[26rem] rounded-full border border-white/15" />
          <div aria-hidden="true" className="absolute -bottom-24 -left-10 h-[22rem] w-[36rem] -rotate-12 rounded-[50%] border border-white/15" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/90 text-primary shadow-[0_0_24px_rgba(255,255,255,0.45)]"><Landmark size={22} /></span>
              <div className="leading-tight"><div className="text-base font-extrabold">CASPER</div><div className="text-[11px] text-white/70">Government Procurement Intelligence</div></div>
            </div>
            <div className="eyebrow mt-9 !text-white/70">Trusted · Transparent · Evidence-based</div>
            <h1 className="mt-3 text-[40px] font-extrabold leading-[1.08] tracking-tight">Price benchmarking<br />for <span className="text-[#bccfff]">smarter procurement.</span></h1>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-white/85">Search, compare and validate prices for specialized items and services from multiple trusted sources—while keeping source links and data dates visible.</p>
            <div className="mt-7 grid grid-cols-2 gap-3">
              {FEATURES.map(([Icon, t, d]) => (
                <div key={t} className="rounded-2xl border border-white/30 bg-white/15 p-4 shadow-[0_12px_30px_-16px_rgba(0,0,0,0.4)] backdrop-blur-md">
                  <div className="flex items-center gap-2 text-[13px] font-bold"><Icon size={13} /> {t}</div>
                  <p className="mt-1.5 text-[11.5px] leading-snug text-white/80">{d}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-3 divide-x divide-white/20 border-y border-white/20 py-4">
              {STATS.map(([n, l]) => <div key={l} className="px-4 first:pl-2"><div className="text-2xl font-bold">{n}</div><div className="text-[11px] text-white/75">{l}</div></div>)}
            </div>
            <p className="mt-5 rounded-xl border border-white/25 bg-white/15 px-4 py-3 text-xs text-white/90 backdrop-blur-md">“Data-driven procurement for a transparent tomorrow.”</p>
          </div>
        </section>

        <section className="glass rounded-[30px] p-3">
          <form onSubmit={submit} noValidate className="flex h-full flex-col rounded-[24px] bg-white p-7 shadow-[0_1px_0_#fff_inset]">
            <div className="flex items-center gap-3">
              <span className="raised flex h-10 w-10 items-center justify-center rounded-xl text-primary"><Landmark size={19} /></span>
              <div className="leading-tight"><div className="text-base font-extrabold text-ink">CASPER</div><div className="text-[10.5px] text-body">Government Procurement Intelligence</div></div>
            </div>
            <h2 className="mt-7 text-2xl font-bold text-ink">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>
            <p className="mt-1.5 text-xs text-body">{mode === 'signin' ? 'Sign in to access price benchmarking.' : 'Register as a procurement officer.'}</p>

            <div role="tablist" aria-label="Sign in or create account" className="mt-5 grid grid-cols-2 gap-1 rounded-2xl bg-tint p-1 shadow-[0_1px_3px_rgba(44,77,150,0.12)_inset]">
              {[['signin', 'Sign in'], ['register', 'Create account']].map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setErr({ message: '', fields: {} }); }}
                  className={`rounded-xl py-2 text-xs font-bold ${mode === k ? 'raised text-ink' : 'text-body hover:text-ink'}`}>{label}</button>
              ))}
            </div>

            <div className="mt-5 space-y-4">
              {offline && <div role="alert" className="rounded-xl border border-[#f1dca8] bg-warn-bg px-3 py-2 text-xs font-medium text-warn">Cannot reach the CASPER server. Start the backend (cd backend, then npm run dev) and reload this page.</div>}
          {err.message && <div role="alert" className="rounded-xl border border-[#f3c6cc] bg-bad-bg px-3 py-2 text-xs font-medium text-bad">{err.message}</div>}
              {mode === 'register' && field('name', 'Full name', 'text', { autoComplete: 'name', placeholder: 'Your full name' })}
              {mode === 'register' && cfg.inviteCodeRequired && field('inviteCode', 'Invite code', 'text', { autoComplete: 'off', placeholder: 'Given to you by your administrator' })}
              {field('email', 'Official email address', 'email', { autoComplete: 'email', placeholder: 'you@department.gov.in' })}
              {field('password', 'Password', 'password', { autoComplete: mode === 'signin' ? 'current-password' : 'new-password', placeholder: 'Enter your password' })}
            </div>
            <button className="btn-primary mt-5 w-full py-3" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'} {!busy && <ArrowRight size={15} />}
            </button>
            {cfg.demoLogin && (
              <div className="mt-5 rounded-2xl border border-[#f1dca8] bg-warn-bg/60 p-3" aria-label="Demo access">
                <p className="mb-2 text-[11px] font-bold text-warn">Demo mode: sign-in shortcuts are on</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="btn-soft py-2 text-xs" disabled={busy} onClick={() => demo('admin')}><UserCog size={14} /> Continue as administrator</button>
                  <button type="button" className="btn-soft py-2 text-xs" disabled={busy} onClick={() => demo('officer')}><Briefcase size={14} /> Continue as government employee</button>
                </div>
              </div>
            )}
            <div className="mt-auto flex items-center justify-center gap-4 pt-6 text-[11px] text-body">
              <span className="flex items-center gap-1.5"><UserCheck size={12} /> Role-based access</span>
              <span className="flex items-center gap-1.5"><Check size={12} /> Audit-ready</span>
              <span className="flex items-center gap-1.5"><Database size={12} /> Source attribution</span>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
