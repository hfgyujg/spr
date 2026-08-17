import React, { useEffect, useMemo, useState } from 'react';
import { auth } from '../lib/firebase';
import { apiFetch } from '../utils/apiClient';
import { Activity, Bot, BriefcaseBusiness, FileCheck2, GitBranch, Gauge, Network, ShieldCheck, Users, Wrench } from 'lucide-react';

const tabs = [
  ['passports', 'Passports', FileCheck2], ['evidence', 'Evidence', ShieldCheck], ['changes', 'Changes', Activity],
  ['clients', 'Clients', Users], ['policies', 'Policies', ShieldCheck], ['impact', 'Impact', Network],
  ['services', 'Services', BriefcaseBusiness], ['roi', 'ROI', Gauge], ['ai', 'AI / Agents', Bot], ['reports', 'Reports', FileCheck2],
] as const;

type Tab = typeof tabs[number][0];

function useTokenReady() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(!!auth.currentUser);
  useEffect(() => auth.onIdTokenChanged(user => { setSignedIn(!!user); setReady(true); }), []);
  return { ready, signedIn };
}

export default function MSPDigitalTrustConsole() {
  const { ready, signedIn } = useTokenReady();
  const path = window.location.pathname.split('/').filter(Boolean);
  const requested = (path[1] || 'passports') as Tab;
  const active = tabs.some(t => t[0] === requested) ? requested : 'passports';
  const [passportId, setPassportId] = useState('');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    const endpoint = active === 'passports' ? (passportId ? `/api/msp/passport/${encodeURIComponent(passportId)}` : null)
      : active === 'evidence' ? (passportId ? `/api/msp/evidence/${encodeURIComponent(passportId)}` : null)
      : active === 'changes' ? (passportId ? `/api/msp/changes/${encodeURIComponent(passportId)}` : null)
      : active === 'impact' ? (passportId ? `/api/msp/impact/${encodeURIComponent(passportId)}` : null)
      : active === 'services' ? '/api/msp/services'
      : active === 'clients' ? '/api/msp/clients'
      : active === 'policies' ? '/api/msp/policies'
      : null;
    if (!endpoint) { setData(null); setError(null); return; }
    let cancelled = false;
    setError(null); setData(null);
    apiFetch(endpoint).then(async r => { const body = await r.json().catch(() => ({})); if (!r.ok) throw new Error(body?.error || 'SPR could not load this view.'); return body; }).then(body => { if (!cancelled) setData(body); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [active, passportId, signedIn]);

  const summary = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return [{ label: 'Records', value: data.length }];
    return [
      { label: 'Trust state', value: data.trustState || 'UNKNOWN' },
      { label: 'Decision', value: data.decision || 'UNKNOWN' },
      { label: 'Evidence', value: Array.isArray(data.evidenceReferences) ? data.evidenceReferences.length : '—' },
    ];
  }, [data]);

  if (!ready) return <div className="min-h-screen bg-[#030712] text-slate-300 grid place-items-center">Loading SPR trust workspace…</div>;
  if (!signedIn) return <div className="min-h-screen bg-[#030712] text-white grid place-items-center"><div className="max-w-md rounded-2xl border border-white/10 bg-white/[.045] p-8 text-center"><h1 className="text-2xl font-black">MSP Digital Trust</h1><p className="mt-2 text-sm text-slate-400">Sign in to access tenant-isolated trust data.</p><button onClick={() => window.location.href = '/'} className="mt-6 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-bold">Open SPR sign-in</button></div></div>;

  return <main className="min-h-screen bg-[#030712] text-white px-5 py-6 md:px-8">
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div><div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[.25em] text-indigo-300"><Wrench className="h-3 w-3" /> MSP Digital Trust</div><h1 className="mt-2 text-3xl font-black tracking-tight">Evidence-first trust operations</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Passport, evidence, change, client impact, policy, AI assurance, services, ROI and report operations on the existing SPR trust substrate.</p></div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Tenant isolated</div>
      </header>

      <nav className="mt-5 flex flex-wrap gap-2">{tabs.map(([id, label, Icon]) => <a key={id} href={`/msp/${id}`} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${active === id ? 'border-indigo-400/40 bg-indigo-500/15 text-indigo-100' : 'border-white/10 bg-white/[.03] text-slate-400 hover:bg-white/[.06] hover:text-white'}`}><Icon className="h-3.5 w-3.5" />{label}</a>)}</nav>

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[.035] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Current scope</p><p className="mt-1 text-sm text-slate-300">{active.replaceAll('-', ' ')} workspace</p></div><div className="flex gap-2"><input value={passportId} onChange={e => setPassportId(e.target.value)} placeholder="Passport ID for evidence/state views" className="w-full min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400/50 md:w-80" /><a href="/msp/passports" className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300">Reset</a></div></div>
      </section>

      {error && <div role="alert" className="mt-5 rounded-xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
      {data && <section className="mt-5 grid gap-3 md:grid-cols-3">{summary.map(item => <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><p className="text-[10px] font-mono uppercase tracking-widest text-slate-500">{item.label}</p><p className="mt-2 text-xl font-black">{String(item.value)}</p></div>)}</section>}

      <section className="mt-5 rounded-2xl border border-white/10 bg-white/[.035] p-5 min-h-[280px]">
        <div className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-cyan-300" /><h2 className="font-bold">Traceable data</h2></div>
        {!data && <p className="mt-6 max-w-2xl text-sm leading-6 text-slate-500">{active === 'passports' || active === 'evidence' || active === 'changes' || active === 'impact' ? 'Enter a Passport ID to inspect existing evidence-backed data.' : 'This workspace is backed by the secure MSP API. Create or evaluate records through authenticated operations.'}</p>}
        {data && <pre className="mt-5 max-h-[520px] overflow-auto rounded-xl border border-white/10 bg-black/30 p-4 text-xs leading-5 text-slate-300">{JSON.stringify(data, null, 2)}</pre>}
      </section>

      <footer className="mt-6 flex flex-wrap gap-5 border-t border-white/10 pt-5 text-[10px] font-mono uppercase tracking-widest text-slate-600"><span>UNKNOWN never becomes PASS</span><span>Evidence is data, not instructions</span><span>Deterministic rules only</span></footer>
    </div>
  </main>;
}
