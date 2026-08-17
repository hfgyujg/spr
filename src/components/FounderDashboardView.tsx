import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, BarChart3, CheckCircle2, CircleDollarSign, Database,
  GitBranch, Gauge, LockKeyhole, RefreshCw, Server, ShieldCheck, Users,
  XCircle, Zap, FileCheck2, Clock3, Radio, Boxes, CreditCard
} from 'lucide-react';
import { apiFetch } from '../utils/apiClient';

type LoadState = 'ok' | 'error' | 'loading' | 'unknown';
type AnyRecord = Record<string, any>;

const money = (value: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 }).format(value || 0);
const dateTime = (value: any) => value ? new Date(value).toLocaleString() : 'Not observed';
const arrayData = (value: any) => Array.isArray(value) ? value : [];

function StatusDot({ state }: { state: LoadState }) {
  if (state === 'ok') return <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />Healthy</span>;
  if (state === 'error') return <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-300"><XCircle className="h-4 w-4" />Unavailable</span>;
  if (state === 'loading') return <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-300"><RefreshCw className="h-4 w-4 animate-spin" />Checking</span>;
  return <span className="inline-flex items-center gap-1.5 text-slate-500"><AlertTriangle className="h-4 w-4" />Unknown</span>;
}

function Metric({ icon: Icon, label, value, detail }: { icon: any; label: string; value: React.ReactNode; detail?: string }) {
  return <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
    <div className="flex items-center gap-2 text-slate-500 dark:text-zinc-400"><Icon className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-[.18em]">{label}</span></div>
    <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-zinc-50">{value}</div>
    {detail && <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">{detail}</p>}
  </article>;
}

export default function FounderDashboardView({ userRole }: { userRole: string }) {
  const ownerAccess = userRole === 'Owner';
  const [data, setData] = useState<AnyRecord>({});
  const [states, setStates] = useState<Record<string, LoadState>>({});
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ownerAccess) return;
    setLoading(true); setError(null);
    const endpoints: Record<string, string> = {
      health: '/api/health',
      founder: '/api/founder/metrics',
      clients: '/api/clients',
      passports: '/api/passports',
      selfPassport: '/api/passports/self-passport',
      scans: '/api/scans',
      alerts: '/api/alerts',
      integrations: '/api/integrations',
      vendors: '/api/vendors',
      billing: '/api/billing',
      monitoring: '/api/monitoring-configurations',
      jobs: '/api/collector-jobs'
    };
    const results = await Promise.all(Object.entries(endpoints).map(async ([key, url]) => {
      try {
        const response = await apiFetch(url);
        const body = await response.json().catch(() => null);
        return [key, { ok: response.ok, status: response.status, body }] as const;
      } catch (cause: any) {
        return [key, { ok: false, status: 0, body: null, error: cause?.message || 'Request failed' }] as const;
      }
    }));
    const nextData: AnyRecord = {}; const nextStates: Record<string, LoadState> = {};
    for (const [key, result] of results) {
      nextData[key] = result.body;
      nextStates[key] = result.ok ? 'ok' : 'error';
    }
    setData(nextData); setStates(nextStates); setLastRefresh(new Date().toISOString());
    const failed = results.filter(([, result]) => !result.ok).map(([key]) => key);
    if (failed.length) setError(`${failed.length} owner telemetry source${failed.length === 1 ? '' : 's'} unavailable: ${failed.join(', ')}`);
    setLoading(false);
  }, [ownerAccess]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!ownerAccess) return; const id = window.setInterval(() => void load(), 60000); return () => window.clearInterval(id); }, [load, ownerAccess]);

  if (!ownerAccess) return <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-slate-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-slate-100"><div className="flex items-center gap-3"><LockKeyhole className="h-6 w-6 text-rose-600" /><div><h1 className="text-xl font-bold">Owner access required</h1><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">The Sovereign Command Center is restricted to the SPR Owner role.</p></div></div></div>;

  const clients = arrayData(data.clients);
  const passports = arrayData(data.passports);
  const scans = arrayData(data.scans);
  const alerts = arrayData(data.alerts);
  const integrations = arrayData(data.integrations);
  const vendors = arrayData(data.vendors);
  const billing = arrayData(data.billing);
  const monitoring = arrayData(data.monitoring);
  const jobs = arrayData(data.jobs);
  const activeAlerts = alerts.filter((a: AnyRecord) => String(a.status || '').toLowerCase() === 'active');
  const paid = billing.filter((b: AnyRecord) => String(b.status || '').toLowerCase() === 'paid').reduce((n: number, b: AnyRecord) => n + Number(b.totalAmount || 0), 0);
  const billed = billing.reduce((n: number, b: AnyRecord) => n + Number(b.totalAmount || 0), 0);
  const outstanding = billing.filter((b: AnyRecord) => String(b.status || '').toLowerCase() !== 'paid').reduce((n: number, b: AnyRecord) => n + Number(b.totalAmount || 0), 0);
  const runningJobs = jobs.filter((j: AnyRecord) => ['queued', 'claimed', 'running'].includes(String(j.state || '').toLowerCase()));
  const failedJobs = jobs.filter((j: AnyRecord) => ['failed', 'timed_out', 'dead_lettered'].includes(String(j.state || '').toLowerCase()));
  const healthySources = Object.values(states).filter(v => v === 'ok').length;
  const sourceCount = Object.keys(states).length;
  const systemState = states.health === 'ok' && activeAlerts.length === 0 ? 'Healthy' : (states.health === 'error' || failedJobs.length ? 'Attention required' : 'Degraded');
  const selfPassport = data.selfPassport || {};
  const founder = data.founder || {};
  const selfScore = selfPassport.overallScore ?? founder.overallScore;

  const activity = useMemo(() => {
    const items: AnyRecord[] = [];
    for (const item of scans.slice(0, 8)) items.push({ when: item.createdAt || item.updatedAt || item.startedAt, title: `Scan ${item.status || 'recorded'}`, detail: item.name || item.target || item.id });
    for (const item of alerts.slice(0, 8)) items.push({ when: item.createdAt || item.updatedAt, title: `Alert ${item.status || 'recorded'}`, detail: item.title || item.message || item.id });
    for (const item of jobs.slice(0, 8)) items.push({ when: item.completedAt || item.createdAt, title: `Collector job ${item.state || 'recorded'}`, detail: item.collectorId || item.id });
    return items.filter(i => i.when).sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()).slice(0, 12);
  }, [alerts, jobs, scans]);

  const healthRows = [
    ['Application / API', states.health, '/api/health'],
    ['Founder telemetry', states.founder, '/api/founder/metrics'],
    ['Database-backed clients', states.clients, '/api/clients'],
    ['Passport registry', states.passports, '/api/passports'],
    ['SPR self-passport', states.selfPassport, '/api/passports/self-passport'],
    ['Continuous monitoring', states.monitoring, '/api/monitoring-configurations'],
    ['Collector jobs', states.jobs, '/api/collector-jobs'],
    ['Billing records', states.billing, '/api/billing'],
    ['Security alerts', states.alerts, '/api/alerts'],
    ['Integrations', states.integrations, '/api/integrations'],
  ] as const;

  return <div className="mx-auto max-w-[1600px] space-y-6 pb-12">
    <header className="rounded-3xl border border-cyan-500/20 bg-slate-950 p-6 text-white shadow-2xl dark:border-cyan-400/20">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.2em] text-cyan-200"><Radio className="h-3.5 w-3.5" />Owner-only · SPR monitoring SPR</div><h1 className="mt-3 text-3xl font-black tracking-tight">Sovereign Command Center</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">The private operating cockpit for the entire SPR platform: infrastructure, trust engine, customers, money, security, monitoring, deployments, evidence and SPR's own Passport.</p></div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-950 hover:bg-slate-100 disabled:opacity-60"><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />{loading ? 'Checking everything…' : 'Run full health check'}</button>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-slate-400"><span className="inline-flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${systemState === 'Healthy' ? 'bg-emerald-400' : 'bg-amber-400'}`} />SPR status: <b className="text-white">{systemState}</b></span><span>Telemetry sources: {healthySources}/{sourceCount || 0}</span><span>Last refresh: {dateTime(lastRefresh)}</span></div>
    </header>

    {error && <div className="rounded-2xl border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/20 dark:text-amber-200"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0" /><div><b>Telemetry is telling you something.</b><div className="mt-1">{error}</div></div></div></div>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <Metric icon={Users} label="Customers" value={clients.length} detail="Observed tenant records" />
      <Metric icon={FileCheck2} label="Passports" value={passports.length} detail="Observed registry records" />
      <Metric icon={CircleDollarSign} label="Paid recorded" value={money(paid)} detail="From billing records" />
      <Metric icon={CreditCard} label="Billed recorded" value={money(billed)} detail="Current billing records" />
      <Metric icon={AlertTriangle} label="Active alerts" value={activeAlerts.length} detail="Live alert records" />
      <Metric icon={Activity} label="Monitoring jobs" value={runningJobs.length} detail={`${failedJobs.length} failed/timed out/dead-lettered`} />
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-600">SPR verifies SPR</p><h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">Self Passport Registry Record</h2></div><ShieldCheck className="h-7 w-7 text-cyan-500" /></div>
        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <Metric icon={Gauge} label="Trust score" value={selfScore ?? 'UNKNOWN'} detail={selfScore == null ? 'No observed score' : 'Latest observed score'} />
          <Metric icon={Server} label="Health" value={selfPassport.healthStatus || 'UNKNOWN'} detail="Passport observation" />
          <Metric icon={FileCheck2} label="Evidence" value={arrayData(selfPassport.evidence).length} detail="Returned evidence entries" />
          <Metric icon={Clock3} label="Observed" value={dateTime(selfPassport.releaseDate || selfPassport.updatedAt)} detail={selfPassport.id || 'No passport ID returned'} />
        </div>
        <div className="mt-5 rounded-2xl border border-cyan-500/20 bg-cyan-50/60 p-4 text-sm text-slate-700 dark:bg-cyan-950/10 dark:text-slate-300"><b>Self-verification rule:</b> this panel only reports values returned by SPR's own registry/evidence APIs. Missing telemetry stays UNKNOWN rather than becoming a fabricated green status.</div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"><div className="flex items-center gap-2"><Database className="h-5 w-5 text-indigo-500" /><h2 className="text-xl font-bold text-slate-900 dark:text-white">System Health</h2></div><div className="mt-4 space-y-2">{healthRows.map(([label, state, endpoint]) => <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 dark:border-zinc-900"><div className="min-w-0"><div className="text-sm font-semibold text-slate-800 dark:text-zinc-200">{label}</div><div className="truncate text-[10px] font-mono text-slate-400">{endpoint}</div></div><StatusDot state={state || 'unknown'} /></div>)}</div></div>
    </section>

    <section className="grid gap-6 lg:grid-cols-3">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"><div className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-emerald-500" /><h2 className="text-lg font-bold text-slate-900 dark:text-white">Money</h2></div><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-500">Recorded paid</span><b>{money(paid)}</b></div><div className="flex justify-between"><span className="text-slate-500">Recorded billed</span><b>{money(billed)}</b></div><div className="flex justify-between"><span className="text-slate-500">Outstanding</span><b>{money(outstanding)}</b></div><div className="flex justify-between"><span className="text-slate-500">Billing records</span><b>{billing.length}</b></div></div><p className="mt-4 text-[11px] text-slate-400">No revenue number is invented. Historical revenue/ARR appears only when the connected billing source returns it.</p></div>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"><div className="flex items-center gap-2"><Boxes className="h-5 w-5 text-indigo-500" /><h2 className="text-lg font-bold text-slate-900 dark:text-white">Trust Infrastructure</h2></div><div className="mt-4 grid grid-cols-2 gap-3"><Metric icon={Database} label="Vendors" value={vendors.length} /><Metric icon={Zap} label="Integrations" value={integrations.length} /><Metric icon={Activity} label="Monitors" value={monitoring.length} /><Metric icon={GitBranch} label="Scans" value={scans.length} /></div></div>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-rose-500" /><h2 className="text-lg font-bold text-slate-900 dark:text-white">Security / Operations</h2></div><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-500">Active alerts</span><b className={activeAlerts.length ? 'text-rose-600' : 'text-emerald-600'}>{activeAlerts.length}</b></div><div className="flex justify-between"><span className="text-slate-500">Failed jobs</span><b className={failedJobs.length ? 'text-rose-600' : 'text-emerald-600'}>{failedJobs.length}</b></div><div className="flex justify-between"><span className="text-slate-500">Founder score</span><b>{founder.overallScore ?? 'UNKNOWN'}</b></div><div className="flex justify-between"><span className="text-slate-500">Audit events</span><b>{founder.auditEvents ?? 'UNKNOWN'}</b></div><div className="flex justify-between"><span className="text-slate-500">System integrity</span><b>{founder.systemIntegrity ?? 'UNKNOWN'}</b></div></div></div>
    </section>

    <section className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-indigo-500">Live operations</p><h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">What needs attention</h2></div><AlertTriangle className="h-5 w-5 text-amber-500" /></div><div className="mt-4 space-y-2">{activeAlerts.length ? activeAlerts.slice(0, 12).map((a: AnyRecord, i: number) => <div key={a.id || i} className="rounded-xl border border-rose-200/70 bg-rose-50/60 p-3 dark:border-rose-900/30 dark:bg-rose-950/10"><div className="flex items-center justify-between gap-2"><b className="text-sm text-slate-800 dark:text-zinc-100">{a.title || a.message || 'Active alert'}</b><span className="text-[10px] font-mono text-rose-600">{a.severity || 'UNKNOWN'}</span></div><div className="mt-1 text-[11px] text-slate-500">{dateTime(a.createdAt || a.updatedAt)}</div></div>) : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800 dark:border-emerald-900/30 dark:bg-emerald-950/10 dark:text-emerald-200"><CheckCircle2 className="mb-2 h-5 w-5" />No active alert records returned by SPR.</div>}</div></div>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-cyan-500" /><h2 className="text-xl font-bold text-slate-900 dark:text-white">Recent platform activity</h2></div><div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 dark:border-zinc-900"><div className="divide-y divide-slate-100 dark:divide-zinc-900">{activity.length ? activity.map((item, i) => <div key={`${item.when}-${i}`} className="grid grid-cols-[150px_1fr] gap-4 px-4 py-3 text-sm"><span className="font-mono text-[10px] text-slate-400">{dateTime(item.when)}</span><div><b className="text-slate-800 dark:text-zinc-100">{item.title}</b><div className="truncate text-xs text-slate-500">{item.detail}</div></div></div>) : <div className="p-6 text-sm text-slate-500">No timestamped activity records returned.</div>}</div></div></div>
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-600">Owner telemetry matrix</p><h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">Every source SPR is currently able to observe</h2></div><span className="text-xs text-slate-500">Auto-refresh: 60 seconds while this page is open</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Object.entries(states).map(([key, state]) => <div key={key} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-zinc-900 dark:bg-zinc-900/40"><div className="min-w-0"><div className="truncate text-sm font-bold text-slate-800 dark:text-zinc-100">{key}</div><div className="text-[10px] font-mono text-slate-400">owner telemetry</div></div><StatusDot state={state} /></div>)}</div></section>
  </div>;
}
