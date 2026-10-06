import React, { useState, useEffect } from 'react';
import {
  Globe, ShieldCheck, Copy, Check, ExternalLink, RefreshCw,
  Terminal, Download, AlertTriangle, Lock, Server, Cpu, CheckCircle2, XCircle
} from 'lucide-react';

interface TailscaleStatus {
  installed: boolean;
  running: boolean;
  funnelActive: boolean;
  dnsName: string | null;
  funnelUrl: string | null;
  tailscaleIp: string | null;
  nodeName: string | null;
  message?: string;
  funnelDetails?: string;
}

const TailscaleFunnelView: React.FC = () => {
  const [port, setPort] = useState<number>(3000);
  const [mode, setMode] = useState<'funnel' | 'serve'>('funnel');
  const [background, setBackground] = useState<boolean>(true);
  const [status, setStatus] = useState<TailscaleStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'quick' | 'manual' | 'systemd' | 'acl'>('quick');

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tailscale/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Failed to query Tailscale status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2500);
  };

  const handleDownload = (filename: string, content: string) => {
    const element = document.createElement('a');
    const file = new Blob([content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Generate primary CLI command
  const primaryCommand = mode === 'funnel'
    ? `sudo tailscale funnel ${background ? '--bg ' : ''}${port}`
    : `sudo tailscale serve ${background ? '--bg ' : ''}${port}`;

  // Generate automated setup shell script
  const setupScriptContent = `#!/bin/bash
# ==============================================================================
# EIES Power Monitoring Platform — Tailscale Funnel Setup for Open Web Access
# Compatible with Orange Pi (Allwinner H3) and Ubuntu Linux
# ==============================================================================
set -e

PORT=${port}

echo "===================================================================="
echo "🌐 Setting up Tailscale Funnel for Open Web Access on Port \${PORT}"
echo "===================================================================="

# 1. Install Tailscale if not present
if ! command -v tailscale >/dev/null 2>&1; then
    echo "[1/3] Installing Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh
else
    echo "[1/3] ✅ Tailscale is already installed."
fi

# 2. Authenticate
if ! tailscale status >/dev/null 2>&1; then
    echo "[2/3] Authenticating Tailscale node..."
    sudo tailscale up
else
    echo "[2/3] ✅ Tailscale node is online."
fi

# 3. Enable Funnel
echo "[3/3] Activating Funnel on port \${PORT}..."
sudo tailscale funnel --bg "\${PORT}"

echo ""
echo "===================================================================="
echo "🎉 Funnel Active! Your live public URL is:"
tailscale funnel status
echo "===================================================================="
`;

  // Systemd service content for persistent 24/7 Funnel
  const systemdServiceContent = `[Unit]
Description=Tailscale Funnel for EIES Power Monitoring Platform
After=network.target tailscaled.service eies-web.service
Wants=tailscaled.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/tailscale funnel --bg ${port}
ExecStop=/usr/bin/tailscale funnel --terminate
Restart=no

[Install]
WantedBy=multi-user.target
`;

  // ACL config snippet
  const aclConfigJson = `{
  "nodeAttrs": [
    {
      "target": ["autogroup:member"],
      "attr": ["funnel"]
    }
  ]
}`;

  return (
    <div className="space-y-6">

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-cyan-950/40 to-slate-900 p-6 rounded-2xl border border-cyan-500/30 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-gradient-to-l from-cyan-500/10 to-transparent pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-500/40 shadow-lg shadow-cyan-950/50">
              <Globe size={32} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Tailscale Funnel — Open Web Access
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase">
                  Zero Router Ports • Real HTTPS
                </span>
              </div>
              <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
                Expose your local Orange Pi or Ubuntu power monitor to the <strong className="text-white">open public web</strong> without port forwarding, dynamic DNS, or static IPs. Tailscale automatically provisions an official Let's Encrypt SSL/TLS certificate under <code className="text-cyan-300 font-mono">https://&lt;your-node&gt;.&lt;tailnet&gt;.ts.net</code>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl border border-slate-700 font-medium transition-all"
              title="Refresh Host Status"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin text-cyan-400' : ''} />
              <span>{loading ? 'Checking...' : 'Refresh Status'}</span>
            </button>
          </div>
        </div>

        {/* Live Host Status Ribbon */}
        <div className="mt-5 pt-4 border-t border-cyan-500/20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            <span className="text-slate-400 block mb-1 text-[11px]">Tailscale Daemon</span>
            <div className="flex items-center gap-2 font-semibold">
              {status?.running ? (
                <>
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  <span className="text-emerald-300">Installed & Running</span>
                </>
              ) : (
                <>
                  <XCircle size={16} className="text-amber-400" />
                  <span className="text-amber-300">Not Detected on Host</span>
                </>
              )}
            </div>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            <span className="text-slate-400 block mb-1 text-[11px]">Funnel Status</span>
            <div className="flex items-center gap-2 font-semibold">
              {status?.funnelActive ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <span className="text-emerald-300 font-bold">Public Funnel Active</span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600"></span>
                  <span className="text-slate-400">Ready to Activate</span>
                </>
              )}
            </div>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            <span className="text-slate-400 block mb-1 text-[11px]">Host / Node Name</span>
            <div className="font-mono text-cyan-300 truncate font-semibold">
              {status?.nodeName || 'orangepi-meter'}
            </div>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            <span className="text-slate-400 block mb-1 text-[11px]">Tailscale IP (VPN)</span>
            <div className="font-mono text-slate-300 truncate">
              {status?.tailscaleIp || '100.x.x.x'}
            </div>
          </div>
        </div>

        {/* If Active: Show clickable Public Link Banner */}
        {status?.funnelUrl && (
          <div className="mt-4 p-3.5 bg-emerald-950/50 rounded-xl border border-emerald-500/40 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
                <Globe size={18} />
              </div>
              <div>
                <span className="text-[11px] text-emerald-300 font-semibold uppercase tracking-wider block">Your Public Open Web URL</span>
                <a
                  href={status.funnelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm text-white hover:text-emerald-300 underline font-bold flex items-center gap-1.5"
                >
                  {status.funnelUrl}
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>

            <button
              onClick={() => handleCopy(status.funnelUrl || '', 'live-url')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
            >
              {copiedCmd === 'live-url' ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedCmd === 'live-url' ? 'Copied!' : 'Copy Public Link'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Main 2-Column Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Interactive Command & Parameter Configurator */}
        <div className="bg-slate-900/90 rounded-2xl p-5 border border-slate-800 shadow-xl flex flex-col justify-between space-y-5">
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-cyan-400 border-b border-slate-800 pb-3">
              <Terminal size={20} />
              <h3 className="font-bold text-white text-base">Funnel Configurator</h3>
            </div>

            {/* Mode Selector */}
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-2">
                Exposure Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('funnel')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    mode === 'funnel'
                      ? 'bg-cyan-950/60 border-cyan-500/60 text-white shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-cyan-300 mb-1">
                    <Globe size={14} />
                    <span>Open Web (Funnel)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Publicly accessible to anyone with your <code className="text-cyan-200">.ts.net</code> HTTPS link.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('serve')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    mode === 'serve'
                      ? 'bg-slate-800 border-cyan-500/60 text-white shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-200 mb-1">
                    <Lock size={14} />
                    <span>Private Tailnet Only</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Restricted to devices signed into your personal Tailnet VPN.
                  </p>
                </button>
              </div>
            </div>

            {/* Target Port */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold uppercase text-slate-400">Local Web Server Port</label>
                <div className="flex gap-1 text-[10px]">
                  <button
                    onClick={() => setPort(3000)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono"
                  >
                    3000 (Default)
                  </button>
                  <button
                    onClick={() => setPort(8080)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono"
                  >
                    8080
                  </button>
                </div>
              </div>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value) || 3000)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm focus:border-cyan-500 focus:outline-none"
              />
              <p className="text-[11px] text-slate-500 mt-1">EIES Express server runs on port 3000</p>
            </div>

            {/* Options Toggle */}
            <div className="pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={background}
                  onChange={(e) => setBackground(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0"
                />
                <span>Run in background (<code className="text-cyan-400 font-mono">--bg</code> daemon mode)</span>
              </label>
            </div>

            {/* Generated Command Box */}
            <div className="pt-2">
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Terminal Command
              </label>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs text-cyan-300 flex items-center justify-between gap-2">
                <code className="truncate">{primaryCommand}</code>
                <button
                  onClick={() => handleCopy(primaryCommand, 'primary-cmd')}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors flex-shrink-0"
                  title="Copy command"
                >
                  {copiedCmd === 'primary-cmd' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            {/* Turn Off Command */}
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                To Terminate Funnel Anytime
              </label>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 font-mono text-xs text-slate-400 flex items-center justify-between gap-2">
                <code>sudo tailscale funnel --terminate</code>
                <button
                  onClick={() => handleCopy('sudo tailscale funnel --terminate', 'term-cmd')}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors flex-shrink-0"
                  title="Copy command"
                >
                  {copiedCmd === 'term-cmd' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

          </div>

          {/* Quick Script Download */}
          <div className="pt-4 border-t border-slate-800">
            <button
              onClick={() => handleDownload('setup_tailscale_funnel.sh', setupScriptContent)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-cyan-950 transition-colors"
            >
              <Download size={15} />
              <span>Download setup_tailscale_funnel.sh</span>
            </button>
          </div>
        </div>

        {/* Right Column: Documentation, Guided Walkthrough, & ACL Guide */}
        <div className="col-span-1 lg:col-span-2 bg-slate-900/90 rounded-2xl overflow-hidden border border-slate-800 flex flex-col shadow-xl">
          
          {/* Sub Navigation Bar */}
          <div className="bg-slate-950 p-3 flex flex-wrap justify-between items-center border-b border-slate-800 gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                onClick={() => setActiveSubTab('quick')}
                className={`px-3 py-1 rounded font-semibold transition-colors flex items-center gap-1.5 ${
                  activeSubTab === 'quick' ? 'bg-slate-800 text-cyan-400 border border-slate-700' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Terminal size={14} />
                <span>Quick Setup (3 Commands)</span>
              </button>
              <button
                onClick={() => setActiveSubTab('acl')}
                className={`px-3 py-1 rounded font-semibold transition-colors flex items-center gap-1.5 ${
                  activeSubTab === 'acl' ? 'bg-slate-800 text-amber-400 border border-slate-700' : 'text-slate-400 hover:text-white'
                }`}
              >
                <ShieldCheck size={14} />
                <span>Tailscale ACL Rule</span>
              </button>
              <button
                onClick={() => setActiveSubTab('systemd')}
                className={`px-3 py-1 rounded font-semibold transition-colors flex items-center gap-1.5 ${
                  activeSubTab === 'systemd' ? 'bg-slate-800 text-emerald-400 border border-slate-700' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Cpu size={14} />
                <span>24/7 Autostart Service</span>
              </button>
            </div>

            <div className="text-xs text-slate-500 font-mono hidden sm:block">
              Ubuntu & Orange Pi H3
            </div>
          </div>

          {/* SubTab 1: Quick 3-Command Setup */}
          {activeSubTab === 'quick' && (
            <div className="flex-1 p-6 overflow-auto text-xs text-slate-300 space-y-6 bg-slate-950/70 leading-relaxed">
              
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs border border-cyan-500/30">1</span>
                  Install Tailscale on Orange Pi or Ubuntu
                </h4>
                <p className="text-slate-400 mb-2">
                  Run the official one-liner script in your Orange Pi or Ubuntu terminal:
                </p>
                <div className="bg-slate-900 p-3 rounded-xl font-mono text-cyan-300 border border-slate-800 flex justify-between items-center">
                  <code>curl -fsSL https://tailscale.com/install.sh | sh</code>
                  <button
                    onClick={() => handleCopy('curl -fsSL https://tailscale.com/install.sh | sh', 'inst-cmd')}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                    title="Copy"
                  >
                    {copiedCmd === 'inst-cmd' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs border border-cyan-500/30">2</span>
                  Authenticate & Join Your Tailnet
                </h4>
                <p className="text-slate-400 mb-2">
                  Connect your device to your Tailscale account:
                </p>
                <div className="bg-slate-900 p-3 rounded-xl font-mono text-cyan-300 border border-slate-800 flex justify-between items-center">
                  <code>sudo tailscale up</code>
                  <button
                    onClick={() => handleCopy('sudo tailscale up', 'up-cmd')}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                    title="Copy"
                  >
                    {copiedCmd === 'up-cmd' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Click the authentication URL printed in your terminal to approve the node in your browser.
                </p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs border border-cyan-500/30">3</span>
                  Turn On Public Open Web Funnel
                </h4>
                <p className="text-slate-400 mb-2">
                  Route incoming public HTTPS traffic directly to local port 3000:
                </p>
                <div className="bg-slate-900 p-3 rounded-xl font-mono text-emerald-300 border border-slate-800 flex justify-between items-center">
                  <code>sudo tailscale funnel --bg {port}</code>
                  <button
                    onClick={() => handleCopy(`sudo tailscale funnel --bg ${port}`, 'funnel-cmd')}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                    title="Copy"
                  >
                    {copiedCmd === 'funnel-cmd' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs border border-cyan-500/30">4</span>
                  Check Status & Open Your Public Link
                </h4>
                <p className="text-slate-400 mb-2">
                  View your live HTTPS public link anytime:
                </p>
                <div className="bg-slate-900 p-3 rounded-xl font-mono text-slate-300 border border-slate-800 flex justify-between items-center">
                  <code>tailscale funnel status</code>
                  <button
                    onClick={() => handleCopy('tailscale funnel status', 'stat-cmd')}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                    title="Copy"
                  >
                    {copiedCmd === 'stat-cmd' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-400 mt-2">
                  <div className="text-slate-500">Example Output:</div>
                  <div className="text-emerald-400">https://orangepi-meter.tail1234.ts.net (funnel on)</div>
                  <div>|-- / proxy http://127.0.0.1:3000</div>
                </div>
              </div>

            </div>
          )}

          {/* SubTab 2: Tailscale ACL Rule Guide */}
          {activeSubTab === 'acl' && (
            <div className="flex-1 p-6 overflow-auto text-xs text-slate-300 space-y-5 bg-slate-950/70 leading-relaxed">
              <div className="bg-amber-950/40 p-4 rounded-xl border border-amber-500/30 flex items-start gap-3">
                <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-white">One-Time Tailscale ACL Configuration Required</h4>
                  <p className="text-xs text-slate-300 mt-1">
                    By default, Tailscale requires you to explicitly allow your nodes to use Funnel in your Tailscale Admin Console.
                  </p>
                </div>
              </div>

              <div>
                <h5 className="font-bold text-white mb-2 text-xs">How to enable in 60 seconds:</h5>
                <ol className="list-decimal list-inside space-y-2 text-slate-300">
                  <li>Open the Tailscale Admin Console: <a href="https://login.tailscale.com/admin/acls" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline font-mono">login.tailscale.com/admin/acls</a></li>
                  <li>Click on <strong>Access Controls</strong>.</li>
                  <li>Add or verify the following <code className="text-amber-300 font-mono font-bold">nodeAttrs</code> block inside the JSON:</li>
                </ol>
              </div>

              <div className="relative">
                <div className="bg-slate-900 p-4 rounded-xl font-mono text-amber-300 border border-slate-800 overflow-x-auto text-[11px]">
                  <pre>{aclConfigJson}</pre>
                </div>
                <button
                  onClick={() => handleCopy(aclConfigJson, 'acl-json')}
                  className="absolute top-3 right-3 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 flex items-center gap-1 font-sans"
                >
                  {copiedCmd === 'acl-json' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{copiedCmd === 'acl-json' ? 'Copied' : 'Copy ACL'}</span>
                </button>
              </div>

              <p className="text-slate-400 text-xs">
                Click <strong>Save</strong> in the Tailscale console. Your Orange Pi / Ubuntu node can now open Funnel immediately!
              </p>
            </div>
          )}

          {/* SubTab 3: 24/7 Autostart Systemd Service */}
          {activeSubTab === 'systemd' && (
            <div className="flex-1 p-6 overflow-auto text-xs text-slate-300 space-y-5 bg-slate-950/70 leading-relaxed">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                  <Cpu size={16} className="text-emerald-400" />
                  Running Funnel 24/7 as an Orange Pi / Ubuntu Background Service
                </h4>
                <p className="text-slate-400 mb-3">
                  Tailscale Funnel runs as a persistent daemon by default when passed <code className="text-cyan-400 font-mono">--bg</code>. To guarantee it automatically comes back online even after power cuts or board reboots:
                </p>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Create the systemd service file:</span>
                <div className="bg-slate-900 p-2.5 rounded font-mono text-cyan-300 border border-slate-800 text-[11px] mb-3">
                  sudo nano /etc/systemd/system/tailscale-funnel.service
                </div>

                <div className="relative">
                  <div className="bg-slate-900 p-4 rounded-xl font-mono text-slate-300 border border-slate-800 overflow-x-auto text-[11px]">
                    <pre>{systemdServiceContent}</pre>
                  </div>
                  <button
                    onClick={() => handleCopy(systemdServiceContent, 'systemd-service')}
                    className="absolute top-3 right-3 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 flex items-center gap-1 font-sans"
                  >
                    {copiedCmd === 'systemd-service' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    <span>{copiedCmd === 'systemd-service' ? 'Copied' : 'Copy Service'}</span>
                  </button>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Enable and start the service:</span>
                <div className="bg-slate-900 p-3 rounded-xl font-mono text-emerald-400 border border-slate-800 space-y-1 text-[11px]">
                  <div>sudo systemctl daemon-reload</div>
                  <div>sudo systemctl enable --now tailscale-funnel.service</div>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Security & Access Notice */}
      <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-400">
        <div className="flex items-start gap-2.5">
          <ShieldCheck size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="text-white font-semibold block mb-0.5">Automated SSL/TLS</span>
            Tailscale automatically issues and renews real Let's Encrypt certificates. No Certbot or port 80 verification needed.
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <Lock size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="text-white font-semibold block mb-0.5">Engineer Area Protected</span>
            Sensitive tabs like the Python script generator remain protected behind your engineer passcode (<code className="text-amber-300 font-mono">Meter2025</code>).
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <Server size={18} className="text-cyan-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="text-white font-semibold block mb-0.5">Zero Router Configuration</span>
            Works behind CGNAT, cellular 4G/5G dongles, hotel Wi-Fi, or strict corporate firewalls with zero router port forwarding.
          </div>
        </div>
      </div>

    </div>
  );
};

export default TailscaleFunnelView;
