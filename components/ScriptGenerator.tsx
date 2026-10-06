import React, { useState } from 'react';
import { SerialConfig } from '../types';
import { PYTHON_ASYNC_TEMPLATE, PYTHON_PYSERIAL_TEMPLATE } from '../constants';
import {
  Copy, Terminal, Download, Check, ShieldCheck,
  Cpu, Usb, FileText, Table, Globe
} from 'lucide-react';

const ScriptGenerator: React.FC = () => {
  const [config, setConfig] = useState<SerialConfig>({
    port: '/dev/ttyUSB0',
    baudRate: 9600,
    parity: 'N',
    stopBits: 1,
    byteSize: 8,
    slaveId: 1,
    readInterval: 2,
    includeDemand: true,
    scriptType: 'async'
  });

  const [activeTab, setActiveTab] = useState<'code' | 'venv' | 'reqs' | 'csv-format' | 'ubuntu-guide' | 'orange-pi-guide' | 'tailscale-guide' | 'wiring'>('code');
  const [copied, setCopied] = useState(false);

  const generateScript = () => {
    const demandCode = config.includeDemand ? `
            # Read Demand Block (Function Code 04H, starting 0x008C, 10 registers)
            try:
                resp_demand = safe_read_input_registers(client, address=0x008C, count=10, slave_id=SLAVE_ID)
                if not resp_demand.isError():
                    regs_d = resp_demand.registers
                    active_demand = decode_float32(regs_d[0], regs_d[1])      # 0x008C: Active power demand
                    current_demand = decode_float32(regs_d[6], regs_d[7])     # 0x0092: Current demand
            except Exception:
                pass` : `# Demand registers reading omitted`;

    const baseTemplate = config.scriptType === 'pyserial' ? PYTHON_PYSERIAL_TEMPLATE : PYTHON_ASYNC_TEMPLATE;

    return baseTemplate
      .replace('{PORT}', config.port)
      .replace('{BAUD}', config.baudRate.toString())
      .replace('{PARITY}', config.parity)
      .replace('{STOP}', config.stopBits.toString())
      .replace('{BYTESIZE}', config.byteSize.toString())
      .replace('{SLAVE_ID}', config.slaveId.toString())
      .replace('{POLL_INTERVAL}', config.readInterval.toString())
      .replace('{DEMAND_BLOCK_CODE}', demandCode);
  };

  const venvScriptContent = `#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "\\\${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================================="
echo " Setting up Python Virtual Environment for Modbus Reader"
echo " EIES Power Monitoring Platform - Eneftech"
echo " Tagbilaran City, Bohol"
echo "=========================================================="

# 1. Create Python virtual environment
if [ ! -d "venv" ]; then
    echo "[1/3] Creating virtual environment in ./venv..."
    python3 -m venv venv || {
        echo "[INFO] Standard ensurepip venv failed. Creating --without-pip..."
        python3 -m venv --without-pip venv
        curl -sS https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py || wget -qO /tmp/get-pip.py https://bootstrap.pypa.io/get-pip.py
        ./venv/bin/python3 /tmp/get-pip.py
        rm -f /tmp/get-pip.py
    }
else
    echo "[1/3] Virtual environment ./venv already exists."
fi

# 2. Activate virtual environment
echo "[2/3] Activating virtual environment..."
source venv/bin/activate

# 3. Install packages
echo "[3/3] Installing dependencies (pymodbus, pyserial)..."
pip install --upgrade pip 2>/dev/null || true
pip install -r requirements.txt

chmod +x read_meter.py setup_venv.sh run_reader.sh 2>/dev/null || true

echo ""
echo "=========================================================="
echo " [SUCCESS] Virtual environment configured!"
echo " To run the data logger:"
echo "   source venv/bin/activate"
echo "   python3 read_meter.py --port ${config.port}"
echo " Or simply:"
echo "   ./run_reader.sh"
echo "=========================================================="
`;

  const requirementsContent = `pymodbus>=3.6.0
pyserial>=3.5
`;

  const orangePiSetupScriptContent = `#!/bin/bash
# ==============================================================================
# EIES Power Monitoring Platform — Automated Setup for Orange Pi 1 (1GB H3)
# Eneftech Innovative Engineering Services • Tagbilaran City, Bohol
# ==============================================================================
set -e

PROJECT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
CURRENT_USER="\${SUDO_USER:-$USER}"

echo "===================================================================="
echo "⚡ Orange Pi 1 / PC (Allwinner H3 1GB RAM) Automated Setup Script"
echo "   EIES Modbus RTU Power Monitoring Platform"
echo "===================================================================="

# 1. System packages
sudo apt-get update -y
sudo apt-get install -y python3 python3-pip python3-venv git curl build-essential

# 2. Check and configure swap (1GB recommended for compiling npm packages on ARMv7)
SWAP_TOTAL=$(free -m | awk '/Swap:/ {print $2}')
if [ "$SWAP_TOTAL" -lt 500 ]; then
    echo "Creating 1GB swapfile to prevent OOM errors during builds..."
    sudo fallocate -l 1G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=1024
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    fi
fi

# 3. Node.js LTS v20 for ARMv7
if ! command -v node >/dev/null 2>&1; then
    echo "Installing Node.js v20 LTS via NodeSource for ARMv7..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 4. Set up Python virtual environment
bash setup_venv.sh

# 5. Grant dialout serial permissions to user
sudo usermod -aG dialout "$CURRENT_USER" || true
sudo usermod -aG tty "$CURRENT_USER" || true

# 6. Install Node dependencies and build static web bundle
npm install
npm run build

HOST_IP=$(hostname -I | awk '{print $1}' || echo "localhost")
echo "===================================================================="
echo "🎉 Setup Complete! Run: ./run_reader.sh --port ${config.port} and npm start"
echo "👉 Access Web Dashboard at: http://\${HOST_IP}:3000"
echo "===================================================================="
`;

  const tailscaleSetupScriptContent = `#!/bin/bash
# ==============================================================================
# Tailscale Funnel Setup for Open Web Access (Port 3000)
# Compatible with Orange Pi & Ubuntu Linux
# ==============================================================================
set -e

# 1. Install Tailscale if not present
if ! command -v tailscale >/dev/null 2>&1; then
    curl -fsSL https://tailscale.com/install.sh | sh
fi

# 2. Authenticate
sudo tailscale up

# 3. Enable Funnel on port 3000
sudo tailscale funnel --bg 3000

# 4. View public URL
tailscale funnel status
`;

  const csvFormatHeader = `Timestamp,Phase 1 Voltage (V),Phase 2 Voltage (V),Phase 3 Voltage (V),Phase 1 Current (A),Phase 2 Current (A),Phase 3 Current (A),Phase 1 Power (W),Phase 2 Power (W),Phase 3 Power (W),Frequency (Hz),Total Active Power (W),Total Apparent Power (VA)`;

  const currentTabContent = () => {
    switch (activeTab) {
      case 'code':
        return generateScript();
      case 'venv':
        return venvScriptContent;
      case 'reqs':
        return requirementsContent;
      case 'orange-pi-guide':
        return orangePiSetupScriptContent;
      case 'tailscale-guide':
        return tailscaleSetupScriptContent;
      default:
        return '';
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(currentTabContent());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = (filename: string, content: string) => {
    const element = document.createElement("a");
    const file = new Blob([content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element); 
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      
      {/* Left Configuration Panel */}
      <div className="bg-slate-900/90 rounded-xl p-5 border border-slate-800 shadow-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-4 text-emerald-400">
            <Terminal size={22} />
            <h2 className="text-lg font-bold text-white">Ubuntu RS485 Modbus Poller</h2>
          </div>
          
          <div className="space-y-4">
            
            {/* Port Selection */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold uppercase text-slate-400">Serial Port (Linux)</label>
                <div className="flex gap-1 text-[10px]">
                  <button 
                    onClick={() => setConfig({ ...config, port: '/dev/ttyUSB0' })} 
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono"
                  >
                    ttyUSB0
                  </button>
                  <button 
                    onClick={() => setConfig({ ...config, port: '/dev/ttyUSB1' })} 
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono"
                  >
                    ttyUSB1
                  </button>
                  <button 
                    onClick={() => setConfig({ ...config, port: '/dev/ttyS1' })} 
                    className="px-1.5 py-0.5 rounded bg-amber-950/70 hover:bg-amber-900/80 text-amber-300 font-mono border border-amber-600/30"
                    title="Orange Pi 40-pin GPIO UART1 (Pins 8 & 10)"
                  >
                    ttyS1 (OPi)
                  </button>
                  <button 
                    onClick={() => setConfig({ ...config, port: '/dev/ttyACM0' })} 
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono"
                  >
                    ttyACM0
                  </button>
                </div>
              </div>
              <input 
                type="text" 
                value={config.port} 
                onChange={(e) => setConfig({ ...config, port: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none"
                placeholder="/dev/ttyUSB0"
              />
              <p className="text-[11px] text-slate-500 mt-1">Default USB-to-RS485 adapter on Ubuntu</p>
            </div>

            {/* Baud Rate & Slave ID */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                  Baud Rate <span className="text-[10px] text-slate-500">(0x5006)</span>
                </label>
                <select 
                  value={config.baudRate} 
                  onChange={(e) => setConfig({ ...config, baudRate: parseInt(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white text-xs font-mono"
                >
                  <option value={1200}>1200 baud</option>
                  <option value={2400}>2400 baud</option>
                  <option value={4800}>4800 baud</option>
                  <option value={9600}>9600 baud (Default)</option>
                  <option value={19200}>19200 baud</option>
                  <option value={38400}>38400 baud</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                  Slave ID <span className="text-[10px] text-slate-500">(0x5005)</span>
                </label>
                <input 
                  type="number" 
                  min="1"
                  max="247"
                  value={config.slaveId} 
                  onChange={(e) => setConfig({ ...config, slaveId: parseInt(e.target.value) || 1 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white text-xs font-mono"
                />
              </div>
            </div>

            {/* Parity & Stop Bits */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                  Parity <span className="text-[10px] text-slate-500">(0x5007)</span>
                </label>
                <select 
                  value={config.parity} 
                  onChange={(e) => setConfig({ ...config, parity: e.target.value as 'N' | 'E' | 'O' })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white text-xs font-mono"
                >
                  <option value="N">None (Default)</option>
                  <option value="E">Even</option>
                  <option value="O">Odd</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                  Stop Bits
                </label>
                <select 
                  value={config.stopBits} 
                  onChange={(e) => setConfig({ ...config, stopBits: parseInt(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white text-xs font-mono"
                >
                  <option value={1}>1 Stop Bit (Default)</option>
                  <option value={2}>2 Stop Bits</option>
                </select>
              </div>
            </div>

            {/* Poll Interval & Script Flavor */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                  Poll Interval
                </label>
                <select 
                  value={config.readInterval} 
                  onChange={(e) => setConfig({ ...config, readInterval: parseInt(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white text-xs font-mono"
                >
                  <option value={1}>1 second</option>
                  <option value={2}>2 seconds (Standard)</option>
                  <option value={5}>5 seconds</option>
                  <option value={10}>10 seconds</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                  Script Flavor
                </label>
                <select 
                  value={config.scriptType} 
                  onChange={(e) => setConfig({ ...config, scriptType: e.target.value as 'async' | 'pyserial' })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white text-xs font-mono"
                >
                  <option value="async">Pymodbus 3.x (Async)</option>
                  <option value="pyserial">Pure PySerial (Raw)</option>
                </select>
              </div>
            </div>

            {/* Include Demand Checkbox */}
            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input 
                  type="checkbox"
                  checked={config.includeDemand}
                  onChange={(e) => setConfig({ ...config, includeDemand: e.target.checked })}
                  className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0"
                />
                <span>Include Power Demand Registers (0x008C)</span>
              </label>
            </div>

          </div>
        </div>

        {/* Virtual Environment Quick Commands */}
        <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-400 space-y-2">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
            <ShieldCheck size={15} className="text-emerald-400" />
            <span>Virtual Environment Quick Start:</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px] text-emerald-400 space-y-1">
            <div>bash setup_venv.sh</div>
            <div className="text-slate-500"># or manually:</div>
            <div className="text-slate-400">python3 -m venv venv</div>
            <div className="text-slate-400">source venv/bin/activate</div>
            <div className="text-slate-400">pip install -r requirements.txt</div>
            <div className="text-emerald-300">python read_meter.py</div>
          </div>
        </div>

      </div>

      {/* Right Code & Documentation Area */}
      <div className="col-span-1 lg:col-span-2 bg-slate-900/90 rounded-xl overflow-hidden border border-slate-800 flex flex-col shadow-xl">
        
        {/* Navigation Bar */}
        <div className="bg-slate-950 p-3 flex flex-wrap justify-between items-center border-b border-slate-800 gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              onClick={() => setActiveTab('code')}
              className={`px-3 py-1 rounded font-semibold transition-colors ${
                activeTab === 'code' ? 'bg-slate-800 text-emerald-400 border border-slate-700' : 'text-slate-400 hover:text-white'
              }`}
            >
              read_meter.py
            </button>
            <button
              onClick={() => setActiveTab('venv')}
              className={`px-3 py-1 rounded font-semibold transition-colors ${
                activeTab === 'venv' ? 'bg-slate-800 text-cyan-400 border border-slate-700' : 'text-slate-400 hover:text-white'
              }`}
            >
              setup_venv.sh
            </button>
            <button
              onClick={() => setActiveTab('reqs')}
              className={`px-3 py-1 rounded font-semibold transition-colors ${
                activeTab === 'reqs' ? 'bg-slate-800 text-amber-400 border border-slate-700' : 'text-slate-400 hover:text-white'
              }`}
            >
              requirements.txt
            </button>
            <button
              onClick={() => setActiveTab('csv-format')}
              className={`px-3 py-1 rounded font-semibold transition-colors ${
                activeTab === 'csv-format' ? 'bg-slate-800 text-emerald-300 border border-slate-700' : 'text-slate-400 hover:text-white'
              }`}
            >
              CSV Data Stream
            </button>
            <button
              onClick={() => setActiveTab('ubuntu-guide')}
              className={`px-3 py-1 rounded font-semibold transition-colors ${
                activeTab === 'ubuntu-guide' ? 'bg-slate-800 text-emerald-400 border border-slate-700' : 'text-slate-400 hover:text-white'
              }`}
            >
              Ubuntu Guide
            </button>
            <button
              onClick={() => setActiveTab('orange-pi-guide')}
              className={`px-3 py-1 rounded font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'orange-pi-guide' ? 'bg-amber-950/80 text-amber-300 border border-amber-500/50 shadow-sm' : 'text-slate-400 hover:text-amber-200'
              }`}
            >
              <Cpu size={14} className="text-amber-400" />
              <span>Orange Pi 1 (1G H3)</span>
              <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded border border-amber-500/30">
                100% OK
              </span>
            </button>
            <button
              onClick={() => setActiveTab('tailscale-guide')}
              className={`px-3 py-1 rounded font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'tailscale-guide' ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/50 shadow-sm' : 'text-slate-400 hover:text-cyan-200'
              }`}
            >
              <Globe size={14} className="text-cyan-400" />
              <span>Tailscale Funnel</span>
              <span className="text-[9px] bg-cyan-500/20 text-cyan-300 px-1 py-0.2 rounded border border-cyan-500/30">
                Public HTTPS
              </span>
            </button>
            <button
              onClick={() => setActiveTab('wiring')}
              className={`px-3 py-1 rounded font-semibold transition-colors ${
                activeTab === 'wiring' ? 'bg-slate-800 text-emerald-400 border border-slate-700' : 'text-slate-400 hover:text-white'
              }`}
            >
              RS485 Pinout
            </button>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs rounded-lg border border-slate-700 transition-colors"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
            
            {activeTab === 'code' && (
              <button 
                onClick={() => handleDownload('read_meter.py', generateScript())}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg font-semibold transition-colors shadow-lg shadow-emerald-950"
              >
                <Download size={14} /> Download read_meter.py
              </button>
            )}

            {activeTab === 'venv' && (
              <button 
                onClick={() => handleDownload('setup_venv.sh', venvScriptContent)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded-lg font-semibold transition-colors shadow-lg shadow-cyan-950"
              >
                <Download size={14} /> Download setup_venv.sh
              </button>
            )}

            {activeTab === 'reqs' && (
              <button 
                onClick={() => handleDownload('requirements.txt', requirementsContent)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded-lg font-semibold transition-colors shadow-lg shadow-amber-950"
              >
                <Download size={14} /> Download requirements.txt
              </button>
            )}

            {activeTab === 'orange-pi-guide' && (
              <button 
                onClick={() => handleDownload('setup_orange_pi.sh', orangePiSetupScriptContent)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded-lg font-semibold transition-colors shadow-lg shadow-amber-950"
              >
                <Download size={14} /> Download setup_orange_pi.sh
              </button>
            )}

            {activeTab === 'tailscale-guide' && (
              <button 
                onClick={() => handleDownload('setup_tailscale_funnel.sh', tailscaleSetupScriptContent)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded-lg font-semibold transition-colors shadow-lg shadow-cyan-950"
              >
                <Download size={14} /> Download setup_tailscale_funnel.sh
              </button>
            )}
          </div>
        </div>

        {/* Tab 1: Python Code Preview */}
        {activeTab === 'code' && (
          <div className="flex-1 p-4 overflow-auto text-xs font-mono text-emerald-300 leading-relaxed bg-slate-950/70 select-text max-h-[640px]">
            <pre>{generateScript()}</pre>
          </div>
        )}

        {/* Tab 2: Virtual Environment Setup Script */}
        {activeTab === 'venv' && (
          <div className="flex-1 p-4 overflow-auto text-xs font-mono text-cyan-300 leading-relaxed bg-slate-950/70 select-text max-h-[640px]">
            <pre>{venvScriptContent}</pre>
          </div>
        )}

        {/* Tab 3: Requirements.txt */}
        {activeTab === 'reqs' && (
          <div className="flex-1 p-6 overflow-auto text-xs text-slate-300 space-y-4 bg-slate-950/70 leading-relaxed">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileText size={16} className="text-amber-400" />
              requirements.txt
            </h3>
            <div className="bg-slate-900 p-4 rounded-xl font-mono text-amber-300 border border-slate-800">
              <pre>{requirementsContent}</pre>
            </div>
            <p className="text-xs text-slate-400">
              Install inside virtual environment via: <code className="text-emerald-400 font-mono">pip install -r requirements.txt</code>
            </p>
          </div>
        )}

        {/* Tab 4: CSV Data Format Specification */}
        {activeTab === 'csv-format' && (
          <div className="flex-1 p-6 overflow-auto text-xs text-slate-300 space-y-5 bg-slate-950/70 leading-relaxed">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <Table size={16} className="text-emerald-400" />
                CSV Output Format Specification (<span className="font-mono text-emerald-300">meter_data.csv</span>)
              </h3>
              <p className="text-slate-400">
                The Python poller writes each reading to <code className="text-white font-mono">meter_data.csv</code> and flushes immediately to disk. The EIES web application reads this exact schema:
              </p>
            </div>

            <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-emerald-300 overflow-x-auto">
              {csvFormatHeader}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-800">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="p-2 border-b border-slate-800">CSV Column</th>
                    <th className="p-2 border-b border-slate-800">Modbus Address</th>
                    <th className="p-2 border-b border-slate-800">Format</th>
                    <th className="p-2 border-b border-slate-800">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 font-mono text-[11px]">
                  <tr>
                    <td className="p-2 text-white">Timestamp</td>
                    <td className="p-2 text-slate-500">System Time</td>
                    <td className="p-2 text-slate-400">YYYY-MM-DD HH:MM:SS</td>
                    <td className="p-2 text-slate-300">Capture timestamp</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-white">Phase 1 Voltage (V)</td>
                    <td className="p-2 text-amber-400">0x0000 (Reg 0)</td>
                    <td className="p-2 text-slate-400">Float32 (FC 04H)</td>
                    <td className="p-2 text-slate-300">Phase 1 line-to-neutral voltage</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-white">Phase 2 Voltage (V)</td>
                    <td className="p-2 text-amber-400">0x0002 (Reg 2)</td>
                    <td className="p-2 text-slate-400">Float32 (FC 04H)</td>
                    <td className="p-2 text-slate-300">Phase 2 line-to-neutral voltage</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-white">Phase 3 Voltage (V)</td>
                    <td className="p-2 text-amber-400">0x0004 (Reg 4)</td>
                    <td className="p-2 text-slate-400">Float32 (FC 04H)</td>
                    <td className="p-2 text-slate-300">Phase 3 line-to-neutral voltage</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-white">Phase 1 Current (A)</td>
                    <td className="p-2 text-amber-400">0x0006 (Reg 6)</td>
                    <td className="p-2 text-slate-400">Float32 (FC 04H)</td>
                    <td className="p-2 text-slate-300">Phase 1 current</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-white">Phase 2 Current (A)</td>
                    <td className="p-2 text-amber-400">0x0008 (Reg 8)</td>
                    <td className="p-2 text-slate-400">Float32 (FC 04H)</td>
                    <td className="p-2 text-slate-300">Phase 2 current</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-white">Phase 3 Current (A)</td>
                    <td className="p-2 text-amber-400">0x000A (Reg 10)</td>
                    <td className="p-2 text-slate-400">Float32 (FC 04H)</td>
                    <td className="p-2 text-slate-300">Phase 3 current</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-white">Phase 1 Power (W)</td>
                    <td className="p-2 text-amber-400">0x000C (Reg 12)</td>
                    <td className="p-2 text-slate-400">Float32 (FC 04H)</td>
                    <td className="p-2 text-slate-300">Phase 1 active power</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-white">Phase 2 Power (W)</td>
                    <td className="p-2 text-amber-400">0x000E (Reg 14)</td>
                    <td className="p-2 text-slate-400">Float32 (FC 04H)</td>
                    <td className="p-2 text-slate-300">Phase 2 active power</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-white">Phase 3 Power (W)</td>
                    <td className="p-2 text-amber-400">0x0010 (Reg 16)</td>
                    <td className="p-2 text-slate-400">Float32 (FC 04H)</td>
                    <td className="p-2 text-slate-300">Phase 3 active power</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-white">Frequency (Hz)</td>
                    <td className="p-2 text-amber-400">0x0030 (Reg 48)</td>
                    <td className="p-2 text-slate-400">Float32 (FC 04H)</td>
                    <td className="p-2 text-slate-300">Supply voltage frequency</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-emerald-400 font-bold">Total Active Power (W)</td>
                    <td className="p-2 text-cyan-400 font-bold">0x0032 (Reg 50)</td>
                    <td className="p-2 text-slate-400">Float32 (FC 04H)</td>
                    <td className="p-2 text-emerald-300 font-bold">Total real power (used for energy integration)</td>
                  </tr>
                  <tr>
                    <td className="p-2 text-white">Total Apparent Power (VA)</td>
                    <td className="p-2 text-cyan-400">0x0036 (Reg 54)</td>
                    <td className="p-2 text-slate-400">Float32 (FC 04H)</td>
                    <td className="p-2 text-slate-300">Total system apparent power</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 5: Ubuntu Guide */}
        {activeTab === 'ubuntu-guide' && (
          <div className="flex-1 p-6 overflow-auto text-xs text-slate-300 space-y-6 bg-slate-950/70 leading-relaxed">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <Terminal size={16} className="text-emerald-400" />
                1. Identifying your USB-to-RS485 Converter on Ubuntu
              </h3>
              <p className="text-slate-400 mb-2">
                Plug your USB converter into the Ubuntu machine and check the kernel device log:
              </p>
              <div className="bg-slate-900 p-3 rounded-lg font-mono text-emerald-300 border border-slate-800 space-y-1">
                <div>dmesg | grep -E "ttyUSB|ttyACM"</div>
                <div className="text-slate-500"># or list by persistent hardware ID:</div>
                <div>ls -l /dev/serial/by-id/</div>
              </div>
              <p className="text-slate-500 mt-2">
                Typical outputs: <code className="text-slate-300 font-mono">/dev/ttyUSB0</code> (FTDI, CH340, CP2102) or <code className="text-slate-300 font-mono">/dev/ttyACM0</code>.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <ShieldCheck size={16} className="text-amber-400" />
                2. Fixing Ubuntu Serial Port Permission Denied
              </h3>
              <p className="text-slate-400 mb-2">
                By default, Ubuntu restricts serial port access to the <code className="text-slate-300 font-mono">dialout</code> group:
              </p>
              <div className="bg-slate-900 p-3 rounded-lg font-mono text-amber-300 border border-slate-800 space-y-1">
                <div>sudo usermod -aG dialout $USER</div>
                <div className="text-slate-500"># Activate without logging out:</div>
                <div>newgrp dialout</div>
                <div className="text-slate-500"># Or temporary permission check:</div>
                <div>sudo chmod 666 /dev/ttyUSB0</div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <Cpu size={16} className="text-cyan-400" />
                3. Running 24/7 as an Ubuntu systemd Background Service
              </h3>
              <p className="text-slate-400 mb-2">
                To keep logging energy data continuously even after reboots, create a systemd service:
              </p>
              <div className="bg-slate-900 p-3 rounded-lg font-mono text-slate-300 border border-slate-800 space-y-1">
                <div className="text-slate-500"># /etc/systemd/system/eies-modbus.service</div>
                <div>[Unit]</div>
                <div>Description=EIES Modbus RTU Energy Data Logger</div>
                <div>After=network.target</div>
                <div className="mt-2">[Service]</div>
                <div>Type=simple</div>
                <div>User=your_username</div>
                <div>WorkingDirectory=/path/to/project</div>
                <div>ExecStart=/path/to/project/venv/bin/python3 /path/to/project/read_meter.py --port /dev/ttyUSB0</div>
                <div>Restart=always</div>
                <div>RestartSec=5</div>
                <div className="mt-2">[Install]</div>
                <div>WantedBy=multi-user.target</div>
              </div>
              <div className="bg-slate-900 p-2.5 rounded font-mono text-slate-400 border border-slate-800 text-[11px] mt-2">
                sudo systemctl enable --now eies-modbus.service
              </div>
            </div>
          </div>
        )}

        {/* Tab: Orange Pi 1 (1G H3) Dedicated Guide */}
        {activeTab === 'orange-pi-guide' && (
          <div className="flex-1 p-6 overflow-auto text-xs text-slate-300 space-y-6 bg-slate-950/70 leading-relaxed">
            
            {/* Compatibility Banner */}
            <div className="bg-gradient-to-r from-amber-950/60 to-orange-950/40 p-4 rounded-xl border border-amber-500/40 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400 border border-amber-500/30">
                    <Cpu size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Orange Pi 1 / PC / One (Allwinner H3 1GB RAM)
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-semibold px-2 py-0.5 rounded border border-emerald-500/30">
                        100% Fully Compatible
                      </span>
                    </h3>
                    <p className="text-[11px] text-amber-200/80">Ideal low-power industrial edge gateway for 24/7 power monitoring</p>
                  </div>
                </div>
              </div>

              {/* Resource Gauge Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400">Total System RAM</div>
                  <div className="text-sm font-bold text-white font-mono">1024 MB</div>
                  <div className="text-[9px] text-slate-500">DDR3 1.2GHz</div>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400">Python Poller</div>
                  <div className="text-sm font-bold text-emerald-400 font-mono">~25 MB</div>
                  <div className="text-[9px] text-emerald-500/80">&lt; 2% CPU usage</div>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400">Node.js Server</div>
                  <div className="text-sm font-bold text-cyan-400 font-mono">~35 MB</div>
                  <div className="text-[9px] text-cyan-500/80">&lt; 1% CPU idle</div>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400">Available Headroom</div>
                  <div className="text-sm font-bold text-amber-400 font-mono">&gt; 780 MB</div>
                  <div className="text-[9px] text-amber-500/80">Plenty of safety headroom</div>
                </div>
              </div>
            </div>

            {/* Section 1: Automated 1-Click Setup Script */}
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <Terminal size={16} className="text-amber-400" />
                1. Automated 1-Click Setup on Orange Pi
              </h3>
              <p className="text-slate-400 mb-2">
                Run this single script on your Orange Pi (Armbian Jammy or Bookworm). It configures the 1GB swapfile, installs Python 3 venv, Node.js v20 LTS, builds the web dashboard, and sets up serial permissions:
              </p>
              <div className="bg-slate-900 p-3 rounded-lg font-mono text-amber-300 border border-slate-800 space-y-1">
                <div className="text-slate-500"># Run automated installer:</div>
                <div>bash setup_orange_pi.sh</div>
              </div>
            </div>

            {/* Section 2: RS-485 Hardware Options on Orange Pi H3 */}
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <Usb size={16} className="text-emerald-400" />
                2. Serial Ports on Orange Pi H3
              </h3>
              <p className="text-slate-400 mb-3">
                You can connect your meter using either standard USB or the built-in 40-pin GPIO hardware UART:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-[11px]">
                <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="text-white font-bold font-sans flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    Option A: USB-to-RS485 Dongle (Easiest)
                  </div>
                  <div className="text-slate-400 font-sans text-xs">
                    Plug any CH340, CP2102, or FTDI USB converter into any of the USB 2.0 host ports.
                  </div>
                  <div className="text-emerald-300">Device Path: <span className="font-bold">/dev/ttyUSB0</span></div>
                  <div className="text-slate-500 font-sans text-[10px]">Command: ./run_reader.sh --port /dev/ttyUSB0</div>
                </div>

                <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="text-white font-bold font-sans flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    Option B: 40-Pin GPIO Hardware UART1
                  </div>
                  <div className="text-slate-400 font-sans text-xs">
                    Connect a 3.3V MAX485 TTL module directly to the GPIO pins (no USB dongle needed).
                  </div>
                  <div className="text-amber-300">UART1: <span className="font-bold">Pin 8 (TX: PA13) | Pin 10 (RX: PA14)</span></div>
                  <div className="text-slate-300">Device Path: <span className="font-bold">/dev/ttyS1</span></div>
                  <div className="text-slate-500 font-sans text-[10px]">Enable in Armbian: <code className="text-slate-400">sudo armbian-config &rarr; System &rarr; Hardware &rarr; uart1</code></div>
                </div>
              </div>
            </div>

            {/* Section 3: 24/7 Autostart on Orange Pi Boot (Dual systemd) */}
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <ShieldCheck size={16} className="text-cyan-400" />
                3. Running 24/7 on Orange Pi (Auto-start on Boot)
              </h3>
              <p className="text-slate-400 mb-2">
                Create two lightweight systemd services so both the Modbus logger and Web Dashboard start automatically on power-on:
              </p>

              <div className="space-y-3">
                <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 space-y-1">
                  <div className="text-xs font-semibold text-emerald-400 font-mono"># /etc/systemd/system/eies-meter.service (Poller)</div>
                  <div className="font-mono text-[11px] text-slate-300 space-y-0.5">
                    <div>[Unit]</div>
                    <div>Description=EIES Modbus RTU Energy Meter Poller</div>
                    <div>After=network.target</div>
                    <div className="pt-1">[Service]</div>
                    <div>Type=simple</div>
                    <div>User=pi</div>
                    <div>WorkingDirectory=/home/pi/eies-meter</div>
                    <div>ExecStart=/home/pi/eies-meter/venv/bin/python3 /home/pi/eies-meter/read_meter.py --port {config.port} --interval {config.readInterval}</div>
                    <div>Restart=always</div>
                    <div>RestartSec=5</div>
                    <div className="pt-1">[Install]</div>
                    <div>WantedBy=multi-user.target</div>
                  </div>
                </div>

                <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 space-y-1">
                  <div className="text-xs font-semibold text-cyan-400 font-mono"># /etc/systemd/system/eies-web.service (Web Dashboard)</div>
                  <div className="font-mono text-[11px] text-slate-300 space-y-0.5">
                    <div>[Unit]</div>
                    <div>Description=EIES Power Monitoring Web Dashboard</div>
                    <div>After=network.target eies-meter.service</div>
                    <div className="pt-1">[Service]</div>
                    <div>Type=simple</div>
                    <div>User=pi</div>
                    <div>WorkingDirectory=/home/pi/eies-meter</div>
                    <div>ExecStart=/usr/bin/node /home/pi/eies-meter/server.js</div>
                    <div>Restart=always</div>
                    <div>RestartSec=5</div>
                    <div>Environment=PORT=3000</div>
                    <div className="pt-1">[Install]</div>
                    <div>WantedBy=multi-user.target</div>
                  </div>
                </div>

                <div className="bg-slate-900 p-2.5 rounded-lg font-mono text-emerald-400 border border-slate-800 text-[11px] space-y-1">
                  <div className="text-slate-500"># Enable and start both services:</div>
                  <div>sudo systemctl daemon-reload</div>
                  <div>sudo systemctl enable --now eies-meter.service eies-web.service</div>
                </div>
              </div>
            </div>

            {/* Section 4: LAN Access */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Terminal size={16} className="text-emerald-400" />
                4. Viewing the Web Dashboard over Local Network
              </h3>
              <p className="text-slate-400 text-xs">
                Once running, find your Orange Pi's IP address by running <code className="text-white font-mono">hostname -I</code>.
                Then open any web browser (on phone, tablet, or PC on the same Wi-Fi):
              </p>
              <div className="bg-slate-950 p-2.5 rounded font-mono text-sm text-cyan-400 border border-slate-800">
                http://&lt;ORANGE_PI_IP_ADDRESS&gt;:3000
              </div>
            </div>

            {/* Section 5: MicroSD Card Protection Tips */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
              <h4 className="font-bold text-white flex items-center gap-2">
                <ShieldCheck size={16} className="text-amber-400" />
                MicroSD Card Longevity Recommendations
              </h4>
              <ul className="list-disc list-inside space-y-1 text-slate-400">
                <li><strong className="text-slate-200">Armbian RAMLOG</strong> is enabled by default, caching OS system logs in memory to minimize SD card write cycles.</li>
                <li>Set the polling interval to <strong className="text-slate-200">2 to 5 seconds</strong> (default: 2s) to balance real-time responsiveness with minimal flash wear.</li>
                <li>Use the built-in <strong className="text-slate-200">Delete / Clear Records</strong> modal in the Timeline tab to prune old historical data periodically.</li>
              </ul>
            </div>

          </div>
        )}

        {/* Tab: Tailscale Funnel Guide */}
        {activeTab === 'tailscale-guide' && (
          <div className="flex-1 p-6 overflow-auto text-xs text-slate-300 space-y-6 bg-slate-950/70 leading-relaxed">
            <div className="bg-gradient-to-r from-cyan-950/60 to-slate-900 p-4 rounded-xl border border-cyan-500/40 space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-cyan-500/20 rounded-lg text-cyan-400 border border-cyan-500/30">
                  <Globe size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Tailscale Funnel — Open Web Access (Port 3000)
                    <span className="text-[10px] bg-cyan-500/20 text-cyan-300 font-semibold px-2 py-0.5 rounded border border-cyan-500/30">
                      HTTPS Let's Encrypt
                    </span>
                  </h3>
                  <p className="text-[11px] text-cyan-200/80">Expose your Orange Pi or Ubuntu meter dashboard securely to the open internet</p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <Terminal size={16} className="text-cyan-400" />
                1. Automated 1-Click Setup Script
              </h4>
              <p className="text-slate-400 mb-2">
                Run the included automated setup script to install Tailscale, authenticate, and activate Funnel on port 3000:
              </p>
              <div className="bg-slate-900 p-3 rounded-lg font-mono text-cyan-300 border border-slate-800 space-y-1">
                <div className="text-slate-500"># Run in terminal on Orange Pi / Ubuntu:</div>
                <div>bash setup_tailscale_funnel.sh</div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <Globe size={16} className="text-emerald-400" />
                2. Manual Commands Walkthrough
              </h4>
              <div className="bg-slate-900 p-3.5 rounded-xl font-mono text-slate-300 border border-slate-800 space-y-2">
                <div>
                  <span className="text-slate-500 block text-[10px]"># 1. Install Tailscale</span>
                  <code className="text-cyan-300">curl -fsSL https://tailscale.com/install.sh | sh</code>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]"># 2. Authenticate node</span>
                  <code className="text-cyan-300">sudo tailscale up</code>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]"># 3. Enable Funnel on port 3000 in background</span>
                  <code className="text-emerald-300">sudo tailscale funnel --bg 3000</code>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]"># 4. View your public HTTPS URL</span>
                  <code className="text-white">tailscale funnel status</code>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]"># To terminate Funnel anytime</span>
                  <code className="text-amber-300">sudo tailscale funnel --terminate</code>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <ShieldCheck size={16} className="text-amber-400" />
                3. Tailscale Admin ACL Requirement (One-Time)
              </h4>
              <p className="text-slate-400 mb-2">
                Ensure Funnel attribute is added in your Tailscale Admin Console (<code className="text-cyan-300 font-mono">login.tailscale.com/admin/acls</code>):
              </p>
              <div className="bg-slate-900 p-3 rounded-lg font-mono text-amber-300 border border-slate-800 text-[11px]">
                {`"nodeAttrs": [{"target": ["autogroup:member"], "attr": ["funnel"]}]`}
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Hardware Wiring Guide */}
        {activeTab === 'wiring' && (
          <div className="flex-1 p-6 overflow-auto text-xs text-slate-300 space-y-6 bg-slate-950/70 leading-relaxed">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
                <Usb size={16} className="text-emerald-400" />
                RS-485 Differential Bus Pinout
              </h3>
              <p className="text-slate-400 mb-4">
                Connect the USB converter to the electrical meter RS485 communication terminal block:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                  <span className="font-semibold text-white block mb-2">Standard Pinout:</span>
                  <ul className="space-y-2 font-mono text-xs">
                    <li className="flex justify-between border-b border-slate-800 pb-1">
                      <span className="text-emerald-400">USB RS-485 A (D+)</span>
                      <span className="text-slate-400">&rarr; Meter Terminal A (+)</span>
                    </li>
                    <li className="flex justify-between border-b border-slate-800 pb-1">
                      <span className="text-amber-400">USB RS-485 B (D-)</span>
                      <span className="text-slate-400">&rarr; Meter Terminal B (-)</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-slate-400">GND (Optional)</span>
                      <span className="text-slate-500">&rarr; Shield / Common Ground</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                  <span className="font-semibold text-white block mb-2">Troubleshooting RS-485:</span>
                  <ul className="list-disc list-inside space-y-1.5 text-slate-400 text-xs">
                    <li>If you receive timeout or CRC errors, try swapping <strong className="text-white">A</strong> and <strong className="text-white">B</strong> lines (some manufacturers label A as negative).</li>
                    <li>Ensure 120Ω termination resistor is enabled if cable run exceeds 50 meters.</li>
                    <li>Verify meter address is set to 1 (check register <code className="text-emerald-400 font-mono">0x5005</code>).</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ScriptGenerator;
