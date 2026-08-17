import React, { useState, useMemo } from 'react';
import sprLegalBadge from '../assets/images/spr_legal_badge_1783630546377.jpg';
import SPRLogo from './SPRLogo';
import {
  LayoutDashboard, Building2, FileCheck, Radar, Factory, ShieldAlert,
  ClipboardCheck, FileBarChart2, Shield, Sparkles, Brain, Bell, Plug,
  CreditCard, Settings, ChevronDown, Globe, CheckCircle2, Handshake,
  Activity, Zap, LockKeyhole, CircleDot, Crown
} from 'lucide-react';
import { Client } from '../types';
import '../styles/flagship-ui.css';

interface SidebarProps {
  clients: Client[];
  selectedClientId: string;
  setSelectedClientId: (id: string) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  alertCount: number;
  installedExtensions: string[];
  userRole: string;
}

export default function Sidebar({
  clients, selectedClientId, setSelectedClientId, activeTab, setActiveTab,
  alertCount, installedExtensions, userRole
}: SidebarProps) {
  const [showClientSelector, setShowClientSelector] = useState(false);
  const selectedClient = clients.find(c => c.id === selectedClientId);

  const menuGroups = useMemo(() => {
    const activeExtensionsList: any[] = [];
    if (installedExtensions.includes('exec-board')) activeExtensionsList.push({ id: 'reports', label: 'Analytical Reports', icon: FileBarChart2 });
    if (installedExtensions.includes('ops-cmdb')) activeExtensionsList.push({ id: 'clients', label: 'Multi-Tenant Director', icon: Building2, badge: clients.length.toString() });
    if (installedExtensions.includes('vendor-risk')) activeExtensionsList.push({ id: 'vendors', label: 'Supply Chain Tracker', icon: Factory });
    if (installedExtensions.includes('sec-vuln')) {
      activeExtensionsList.push({ id: 'security', label: 'Security Center', icon: ShieldAlert, badge: '!' });
      activeExtensionsList.push({ id: 'alerts', label: 'Live Alerts Router', icon: Bell, badge: alertCount > 0 ? alertCount.toString() : undefined, badgeColor: 'bg-rose-500 text-white font-bold' });
    }
    if (installedExtensions.includes('comp-soc2')) {
      activeExtensionsList.push({ id: 'compliance', label: 'Compliance Audit', icon: ClipboardCheck });
      activeExtensionsList.push({ id: 'enterprise-audit', label: 'Enterprise Audit', icon: Shield, badge: 'SOC2' });
    }
    if (installedExtensions.includes('ai-swarm')) activeExtensionsList.push({ id: 'ai-swarm', label: 'AI Security Swarm', icon: Sparkles, badge: 'LIVE', animateBadge: true });
    if (installedExtensions.includes('ai-brain')) activeExtensionsList.push({ id: 'trust-brain', label: 'Trust Brain AI', icon: Brain, badge: 'AI' });
    if (installedExtensions.includes('fin-license')) activeExtensionsList.push({ id: 'billing', label: 'Billing & Tokens', icon: CreditCard });
    if (installedExtensions.includes('disc-m365') || installedExtensions.includes('disc-github')) activeExtensionsList.push({ id: 'integrations', label: 'Webhooks & Sync', icon: Plug });

    const groups: any[] = [
      { title: 'Command', items: [
        { id: 'dashboard', label: 'Command Center', icon: LayoutDashboard },
        { id: 'clients', label: 'Clients', icon: Building2, badge: clients.length.toString() },
        { id: 'alerts', label: 'Attention', icon: Bell, badge: alertCount ? alertCount.toString() : undefined, badgeColor: 'bg-rose-500 text-white font-bold' },
      ]},
      { title: 'Trust Infrastructure', items: [
        { id: 'passports', label: 'Software Passports', icon: FileCheck },
        { id: 'scans', label: 'Continuous Monitoring', icon: Radar },
        { id: 'security', label: 'Security Center', icon: ShieldAlert },
        { id: 'compliance', label: 'Compliance', icon: ClipboardCheck },
        { id: 'trust-os', label: 'Trust OS', icon: Activity, badge: 'LIVE', animateBadge: true },
        { id: 'trust-brain', label: 'Trust Brain', icon: Brain, badge: 'AI' },
      ]},
      { title: 'Business', items: [
        { id: 'reports', label: 'Executive Reports', icon: FileBarChart2 },
        { id: 'vendors', label: 'Vendors & Supply Chain', icon: Factory },
        { id: 'integrations', label: 'Integrations', icon: Plug },
        { id: 'partner-program', label: 'MSP Partner Program', icon: Handshake },
        { id: 'billing', label: 'Billing', icon: CreditCard },
      ]},
      { title: 'System', items: [
        { id: 'settings', label: 'Settings', icon: Settings },
      ]}
    ];
    if (userRole === 'Owner') {
      groups.push({ title: 'Owner Only', items: [
        { id: 'founder', label: 'Sovereign Command Center', icon: Crown, badge: 'OWNER', badgeColor: 'bg-cyan-500/20 text-cyan-200' }
      ]});
    }
    return groups;
  }, [clients.length, alertCount, installedExtensions, userRole]);

  return (
    <aside id="spr-sovereign-sidebar-shell" className="spr-flagship-sidebar w-[276px] flex flex-col h-full select-none z-40 shrink-0 relative font-sans overflow-hidden">
      <div className="spr-sidebar-orb spr-orb-a" /><div className="spr-sidebar-orb spr-orb-b" /><div className="spr-sidebar-grid" />
      <div className="h-[78px] px-5 border-b border-white/10 flex items-center shrink-0 relative z-10">
        <div className="flex items-center gap-3 min-w-0"><div className="spr-logo-halo"><SPRLogo size="md" subtext="GLOBAL TRUST PLATFORM" /></div><div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-full border border-emerald-400/20 bg-emerald-400/10"><CircleDot className="w-2.5 h-2.5 text-emerald-300 spr-live-dot" /><span className="text-[8px] font-bold tracking-widest text-emerald-200">LIVE</span></div></div>
      </div>
      <div className="px-4 py-4 border-b border-white/10 relative z-10">
        <div className="flex items-center justify-between mb-2"><span className="text-[8px] font-mono font-bold text-slate-400 uppercase tracking-[.2em]">Workspace</span><LockKeyhole className="w-3 h-3 text-indigo-300/70" /></div>
        <button onClick={() => setShowClientSelector(!showClientSelector)} className="spr-glass-control w-full flex items-center justify-between gap-2 p-3 rounded-2xl text-slate-100 border border-white/10 transition-all cursor-pointer text-left text-xs">
          <div className="flex items-center gap-2.5 overflow-hidden">{selectedClientId === 'global' ? <Globe className="w-4 h-4 text-cyan-300 shrink-0" /> : <span className={`w-7 h-7 text-[10px] rounded-xl flex items-center justify-center font-bold shrink-0 ${selectedClient?.avatarColor || 'bg-indigo-600'}`}>{selectedClient?.name.charAt(0) || 'C'}</span>}<div className="min-w-0"><span className="font-bold truncate block">{selectedClientId === 'global' ? 'Global Multi-Tenant Hub' : selectedClient?.name}</span><span className="text-[8px] text-slate-500 font-mono">TRUST WORKSPACE</span></div></div><ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        </button>
        {showClientSelector && <div className="spr-glass-menu absolute left-4 right-4 mt-2 rounded-2xl z-50 py-1 max-h-56 overflow-y-auto"><button onClick={() => { setSelectedClientId('global'); setShowClientSelector(false); }} className="w-full flex items-center gap-2 px-3 py-3 text-xs text-left hover:bg-white/5"><Globe className="w-4 h-4 text-cyan-300" />Global Multi-Tenant Hub</button>{clients.map(client => <button key={client.id} onClick={() => { setSelectedClientId(client.id); setShowClientSelector(false); }} className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-left hover:bg-white/5"><span className="flex items-center gap-2 truncate"><span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold ${client.avatarColor}`}>{client.name.charAt(0)}</span><span className="truncate">{client.name}</span></span>{client.criticalRisksCount > 0 && <span className="text-[8px] text-rose-300">{client.criticalRisksCount}</span>}</button>)}</div>}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5 sidebar-scrollbar relative z-10">
        {menuGroups.map(group => <div key={group.title} className="space-y-1"><div className="px-3 mb-2 flex items-center gap-2"><span className="text-[8px] font-mono font-bold text-slate-500 uppercase tracking-[.18em]">{group.title}</span><span className="h-px flex-1 bg-white/5" /></div>{group.items.map((item: any) => { const Icon = item.icon; const isActive = activeTab === item.id; return <button key={item.id} onClick={() => setActiveTab(item.id)} className={`spr-nav-item w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-xs cursor-pointer ${isActive ? 'spr-nav-active' : ''}`}><div className="flex items-center gap-3 min-w-0"><Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-cyan-200' : 'text-slate-500'}`} /><span className="truncate font-semibold">{item.label}</span></div>{item.badge && <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold shrink-0 ${isActive ? 'bg-white/15 text-white' : item.badgeColor || 'bg-white/5 text-slate-500'}`}>{item.badge}</span>}</button>; })}</div>)}
      </div>
      <div className="p-4 border-t border-white/10 relative z-10"><div className="spr-trust-footer flex items-center gap-3 p-3 rounded-2xl"><div className="relative shrink-0"><img src={sprLegalBadge} alt="SPR Seal" className="w-10 h-10 object-contain rounded-xl" referrerPolicy="no-referrer" /><div className="absolute -right-1 -bottom-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#07101f]" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-300" /><span className="text-[8px] font-mono font-bold text-amber-300 uppercase tracking-wider truncate">Protocol Certified</span></div><span className="text-[10px] font-bold text-white mt-0.5 block truncate">Evidence workspace</span><span className="text-[8px] text-slate-500 font-mono block mt-0.5">Live trust infrastructure</span></div><Zap className="w-3.5 h-3.5 text-cyan-300 spr-zap" /></div></div>
    </aside>
  );
}
