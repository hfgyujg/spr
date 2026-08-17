import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import LoginView from './components/LoginView';
import MSPDigitalTrustConsole from './components/MSPDigitalTrustConsole';
import './utils/auth-storage-hardening';
import './index.css';
import './login-premium.css';
import './styles/spr-flagship-ui.css';

function CoverPage({ onEnter }: { onEnter: () => void }) {
  return (
    <main className="spr-cover min-h-screen overflow-hidden bg-[#030712] text-white">
      <div className="spr-cover-orb spr-cover-orb-a" />
      <div className="spr-cover-orb spr-cover-orb-b" />
      <div className="spr-cover-grid" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-16">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-2xl backdrop-blur-xl">
              <span className="text-lg font-black tracking-tight">SPR</span>
            </div>
            <div>
              <div className="text-sm font-black tracking-[0.18em]">SOFTWARE PASSPORT REGISTRY</div>
              <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500">Trust Infrastructure</div>
            </div>
          </div>
          <div className="hidden rounded-full border border-emerald-400/20 bg-emerald-400/5 px-4 py-2 text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-300 sm:block">
            ● Trust OS Online
          </div>
        </header>

        <section className="flex flex-1 items-center py-20">
          <div className="grid w-full items-center gap-16 lg:grid-cols-[1.2fr_.8fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-4 py-2 text-[11px] font-mono font-bold uppercase tracking-[0.18em] text-indigo-200 backdrop-blur-xl">
                <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-300" />
                Verified Software Intelligence
              </div>
              <h1 className="max-w-5xl text-5xl font-black leading-[.94] tracking-[-.055em] sm:text-7xl lg:text-8xl">
                Know what your software is.
                <span className="block bg-gradient-to-r from-white via-indigo-200 to-cyan-300 bg-clip-text text-transparent">Prove why it can be trusted.</span>
              </h1>
              <p className="mt-8 max-w-2xl text-lg leading-8 text-slate-400 sm:text-xl">
                SPR turns software identity, evidence, security, reliability, compliance and buyer readiness into one continuously verifiable trust layer.
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                {['Software Passports', 'Evidence Graph', 'Security', 'Compliance', 'Monitoring', 'Buyer Readiness'].map((item) => (
                  <span key={item} className="rounded-xl border border-white/10 bg-white/[.045] px-4 py-2.5 text-xs font-semibold text-slate-300 shadow-xl backdrop-blur-xl">{item}</span>
                ))}
              </div>
              <button onClick={onEnter} className="group mt-10 inline-flex items-center gap-3 rounded-2xl border border-indigo-300/30 bg-indigo-500 px-7 py-4 text-sm font-black shadow-[0_0_50px_rgba(99,102,241,.28)] transition hover:-translate-y-1 hover:bg-indigo-400">
                Enter SPR
                <span className="text-lg transition-transform group-hover:translate-x-1">→</span>
              </button>
            </div>

            <div className="relative hidden lg:block">
              <div className="spr-cover-dashboard rounded-[2rem] border border-white/10 bg-white/[.045] p-5 shadow-[0_30px_100px_rgba(0,0,0,.5)] backdrop-blur-2xl">
                <div className="mb-5 flex items-center justify-between">
                  <div><div className="text-xs font-mono uppercase tracking-widest text-slate-500">SPR COMMAND CENTER</div><div className="mt-1 text-xl font-bold">Trust Operations</div></div>
                  <div className="h-3 w-3 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,.8)]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['98.4', 'Trust Score'], ['1,284', 'Evidence Items'], ['24', 'Passports'], ['03', 'Active Alerts']
                  ].map(([value, label]) => <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-5"><div className="text-3xl font-black tracking-tight">{value}</div><div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-slate-500">{label}</div></div>)}
                </div>
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="mb-4 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-slate-500"><span>Trust signal</span><span className="text-emerald-400">LIVE</span></div>
                  <div className="flex h-24 items-end gap-2">{[35,48,42,61,57,72,68,83,76,91,88,96].map((h, i) => <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-indigo-600/30 to-cyan-300" style={{ height: `${h}%`, opacity: .45 + i/30 }} />)}</div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <footer className="flex flex-col gap-2 border-t border-white/10 pt-5 text-[10px] font-mono uppercase tracking-widest text-slate-600 sm:flex-row sm:justify-between">
          <span>SPR · Software Passport Registry</span><span>Evidence-first · Tenant-isolated · Continuously monitored</span>
        </footer>
      </div>
    </main>
  );
}

function EntryGate() {
  const [screen, setScreen] = useState<'cover' | 'signin'>('cover');
  const [authenticated, setAuthenticated] = useState(false);

  if (window.location.pathname === '/msp' || window.location.pathname.startsWith('/msp/')) return <MSPDigitalTrustConsole />;
  if (authenticated) return <App />;
  if (screen === 'cover') return <CoverPage onEnter={() => setScreen('signin')} />;
  return <LoginView onLoginSuccess={() => setAuthenticated(true)} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EntryGate />
  </StrictMode>,
);
