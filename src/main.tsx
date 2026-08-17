import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './login-premium.css';
import './styles/spr-flagship-ui.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('SPR bootstrap failed: #root element was not found.');
}

createRoot(root).render(
  <StrictMode>
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            <span className="text-xs font-mono tracking-wider uppercase text-slate-400">Loading SPR</span>
          </div>
        </div>
      }
    >
      <App />
    </Suspense>
  </StrictMode>,
);
