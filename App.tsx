import React, { useState } from 'react';
import ScriptGenerator from './components/ScriptGenerator';
import HexDecoder from './components/HexDecoder';
import LiveMonitor from './components/SimulationDashboard'; 
import HistoricalView from './components/HistoricalView';
import TimelineView from './components/TimelineView';
import TailscaleFunnelView from './components/TailscaleFunnelView';
import TuyaWifiDualMeterView from './components/TuyaWifiDualMeterView';
import { verifyProtectedPassword } from './utils/crypto';
import {
  FileCode, Gauge, Calculator, Cpu, History,
  Lock, Unlock, Calendar, KeyRound, X, Globe, Wifi,
  Eye, EyeOff, ShieldCheck, AlertCircle, Loader2
} from 'lucide-react';

enum Tab {
  TIMELINE = 'TIMELINE',
  LIVE = 'LIVE',
  TUYA = 'TUYA',
  HISTORY = 'HISTORY',
  REMOTE = 'REMOTE',
  DECODER = 'DECODER',
  SCRIPT = 'SCRIPT'
}

// 4 Tabs requiring password protection as requested:
// 1. Tuya Wifi Dual Meter Tab
// 2. Open Web and Funnel Tab
// 3. Hex Decoder tab
// 4. Python script gen Tab
const PROTECTED_TABS: Tab[] = [Tab.TUYA, Tab.REMOTE, Tab.DECODER, Tab.SCRIPT];

const TAB_NAMES: Record<Tab, string> = {
  [Tab.TIMELINE]: 'Timeline & kWh Dashboard',
  [Tab.LIVE]: 'Live Monitor',
  [Tab.TUYA]: 'Tuya WiFi Dual Meter',
  [Tab.HISTORY]: 'Recent History',
  [Tab.REMOTE]: 'Open Web & Funnel',
  [Tab.DECODER]: 'Hex Decoder & CRC',
  [Tab.SCRIPT]: 'Python Script Gen'
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.TIMELINE);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('eies_auth_unlocked') === 'true';
    } catch {
      return false;
    }
  });

  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [targetTabToUnlock, setTargetTabToUnlock] = useState<Tab | null>(null);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const isTabProtected = (tab: Tab) => PROTECTED_TABS.includes(tab);

  const handleTabClick = (tab: Tab) => {
    if (isTabProtected(tab) && !isUnlocked) {
      setTargetTabToUnlock(tab);
      setPasscodeError('');
      setPasscodeInput('');
      setShowPasswordText(false);
      setShowPasscodeModal(true);
    } else {
      setActiveTab(tab);
    }
  };

  const handleUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!passcodeInput.trim()) {
      setPasscodeError('Please enter the password.');
      return;
    }

    setIsVerifying(true);
    setPasscodeError('');

    try {
      const isValid = await verifyProtectedPassword(passcodeInput.trim());
      if (isValid) {
        setIsUnlocked(true);
        try {
          sessionStorage.setItem('eies_auth_unlocked', 'true');
        } catch {}
        setShowPasscodeModal(false);
        const destination = targetTabToUnlock || Tab.TUYA;
        setActiveTab(destination);
        setPasscodeInput('');
      } else {
        setPasscodeError('Incorrect password. Access denied.');
      }
    } catch {
      setPasscodeError('Error validating password. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLockSession = () => {
    setIsUnlocked(false);
    try {
      sessionStorage.removeItem('eies_auth_unlocked');
    } catch {}
    if (isTabProtected(activeTab)) {
      setActiveTab(Tab.TIMELINE);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30">
      
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 backdrop-blur-md bg-opacity-80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-600 p-2 rounded-lg shadow-md shadow-emerald-950">
                <Cpu size={24} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  EIES Power Monitoring Platform
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    EIES Wifi Meter V1
                  </span>
                </h1>
                <p className="text-xs text-emerald-400/90 font-medium">Eneftech Innovative Engineering Services</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700">
               <span className="text-emerald-400 font-medium">Ubuntu / Orange Pi 1 (1G H3)</span>
               <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
               <span>RS485 (/dev/ttyUSB0 or /dev/ttyS1)</span>
               <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
               <button
                 onClick={() => handleTabClick(Tab.REMOTE)}
                 className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-mono transition-colors"
                 title="View Tailscale Funnel Open Web Status"
               >
                 <Globe size={13} />
                 <span>Funnel {!isUnlocked && '🔒'}</span>
               </button>
               <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
               {isUnlocked ? (
                 <button
                   onClick={handleLockSession}
                   className="flex items-center gap-1 text-amber-400 hover:text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded font-mono border border-amber-500/30 transition-colors"
                   title="Lock protected tabs"
                 >
                   <Unlock size={11} />
                   <span>Lock</span>
                 </button>
               ) : (
                 <button
                   onClick={() => handleTabClick(Tab.TUYA)}
                   className="flex items-center gap-1 text-slate-400 hover:text-slate-300 bg-slate-900 px-2 py-0.5 rounded font-mono border border-slate-700 transition-colors"
                   title="Unlock protected tabs"
                 >
                   <Lock size={11} />
                   <span>Protected</span>
                 </button>
               )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 mb-8 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800 w-fit">
          {/* Public Tab 1: Timeline */}
          <button
            onClick={() => handleTabClick(Tab.TIMELINE)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 relative ${
              activeTab === Tab.TIMELINE 
                ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Calendar size={17} />
            <span>Timeline & kWh Dashboard</span>
            <span className="ml-1 text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-500/30">
              kWh
            </span>
          </button>

          {/* Public Tab 2: Live Monitor */}
          <button
            onClick={() => handleTabClick(Tab.LIVE)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === Tab.LIVE 
                ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Gauge size={17} />
            Live Monitor
          </button>

          {/* Public Tab 3: History */}
          <button
            onClick={() => handleTabClick(Tab.HISTORY)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === Tab.HISTORY 
                ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <History size={17} />
            Recent History
          </button>

          {/* Protected Tab 1: Tuya WiFi Dual Meter */}
          <button
            onClick={() => handleTabClick(Tab.TUYA)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 relative ${
              activeTab === Tab.TUYA 
                ? 'bg-gradient-to-r from-emerald-950/90 to-cyan-950/90 text-cyan-300 shadow-sm border border-cyan-500/50' 
                : 'text-slate-400 hover:text-cyan-200 hover:bg-slate-800/50'
            }`}
          >
            {isUnlocked ? <Wifi size={17} className="text-cyan-400" /> : <Lock size={15} className="text-amber-400" />}
            <span>Tuya WiFi Dual Meter</span>
            <span className={`ml-1 text-[10px] px-1.5 py-0.2 rounded border ${
              isUnlocked 
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' 
                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
            }`}>
              {isUnlocked ? 'Local + MQTT' : 'Protected'}
            </span>
          </button>

          {/* Protected Tab 2: Open Web & Funnel */}
          <button
            onClick={() => handleTabClick(Tab.REMOTE)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 relative ${
              activeTab === Tab.REMOTE 
                ? 'bg-cyan-950/80 text-cyan-300 shadow-sm border border-cyan-500/50' 
                : 'text-slate-400 hover:text-cyan-200 hover:bg-slate-800/50'
            }`}
          >
            {isUnlocked ? <Globe size={17} className="text-cyan-400" /> : <Lock size={15} className="text-amber-400" />}
            <span>Open Web & Funnel</span>
            <span className={`ml-1 text-[10px] px-1.5 py-0.2 rounded border ${
              isUnlocked 
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' 
                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
            }`}>
              {isUnlocked ? 'Tailscale' : 'Protected'}
            </span>
          </button>

          {/* Protected Tab 3: Hex Decoder & CRC */}
          <button
            onClick={() => handleTabClick(Tab.DECODER)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === Tab.DECODER 
                ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            {isUnlocked ? <Calculator size={17} /> : <Lock size={15} className="text-amber-400" />}
            <span>Hex Decoder & CRC</span>
            {!isUnlocked && (
              <span className="ml-0.5 text-[9px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded border border-amber-500/30">
                Lock
              </span>
            )}
          </button>

          {/* Protected Tab 4: Python Script Gen */}
          <button
            onClick={() => handleTabClick(Tab.SCRIPT)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === Tab.SCRIPT 
                ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            {isUnlocked ? <FileCode size={17} /> : <Lock size={15} className="text-amber-400" />}
            <span>Python Script Gen</span>
            {!isUnlocked && (
              <span className="ml-0.5 text-[9px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded border border-amber-500/30">
                Lock
              </span>
            )}
          </button>
        </div>

        {/* Tab Content with Protection Barrier */}
        <div className="transition-all duration-300">
          {isTabProtected(activeTab) && !isUnlocked ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center max-w-lg mx-auto my-12 shadow-2xl space-y-4">
              <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto text-amber-400 shadow-lg">
                <Lock size={30} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">
                  {TAB_NAMES[activeTab]} is Protected
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Access to this engineering toolkit requires authorized EIES credentials.
                </p>
              </div>
              <div className="pt-2">
                <button
                  onClick={() => handleTabClick(activeTab)}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-emerald-950 transition-all inline-flex items-center gap-2 active:scale-95"
                >
                  <KeyRound size={15} />
                  <span>Enter Password to Unlock</span>
                </button>
              </div>
              <div className="pt-2 text-[11px] text-slate-500 font-mono">
                SHA-256 Hashed Protection Protocol
              </div>
            </div>
          ) : (
            <>
              {activeTab === Tab.TIMELINE && <TimelineView />}
              {activeTab === Tab.LIVE && <LiveMonitor />}
              {activeTab === Tab.HISTORY && <HistoricalView />}
              {activeTab === Tab.TUYA && <TuyaWifiDualMeterView />}
              {activeTab === Tab.REMOTE && <TailscaleFunnelView />}
              {activeTab === Tab.DECODER && <HexDecoder />}
              {activeTab === Tab.SCRIPT && <ScriptGenerator />}
            </>
          )}
        </div>

      </main>

      {/* Cryptographically Hashed Passcode Modal */}
      {showPasscodeModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => {
                setShowPasscodeModal(false);
                setPasscodeError('');
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20 shadow-inner">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Security Verification</h3>
                <p className="text-xs text-slate-400">
                  Unlock access to {targetTabToUnlock ? <strong className="text-slate-200">{TAB_NAMES[targetTabToUnlock]}</strong> : 'Engineering Tabs'}
                </p>
              </div>
            </div>

            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Engineer Password</span>
                  <span className="text-[10px] text-slate-500 font-mono">Hashed SHA-256</span>
                </label>
                <div className="relative">
                  <input
                    type={showPasswordText ? "text" : "password"}
                    value={passcodeInput}
                    onChange={(e) => {
                      setPasscodeInput(e.target.value);
                      if (passcodeError) setPasscodeError('');
                    }}
                    placeholder="Enter password..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 pr-10 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none transition-colors"
                    autoFocus
                    disabled={isVerifying}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                    tabIndex={-1}
                  >
                    {showPasswordText ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {passcodeError && (
                  <div className="flex items-center gap-1.5 text-xs text-red-400 mt-1.5 bg-red-950/40 p-2 rounded-lg border border-red-900/50">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{passcodeError}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasscodeModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-950 transition-all flex items-center gap-1.5 disabled:opacity-60"
                >
                  {isVerifying ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound size={14} />
                      <span>Verify & Unlock</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 mt-16 py-8 text-center text-xs text-slate-500 space-y-1">
        <p className="text-slate-400 font-medium">
          Eneftech Innovative Engineering Services &bull; Tagbilaran City, Bohol
        </p>
        <p className="text-slate-600">
          Contact No: 09556218658        Email: info@eneftechsystems.com
        </p>
      </footer>
    </div>
  );
};

export default App;
