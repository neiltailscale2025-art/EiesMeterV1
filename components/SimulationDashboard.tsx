import React, { useEffect, useState } from 'react';
import { REGISTER_MAP } from '../constants';
import { RegisterDefinition } from '../types';
import {
  Activity, PlayCircle, PauseCircle, ServerOff,
  Database, Clock, Gauge, Radio, Zap
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

const LiveMonitor: React.FC = () => {
  const [isRunning, setIsRunning] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('Waiting...');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string>('');

  // 3-Phase Voltage (V) - Defaults to 0.0 until live meter readings arrive
  const [v1, setV1] = useState(0.0);
  const [v2, setV2] = useState(0.0);
  const [v3, setV3] = useState(0.0);

  // 3-Phase Current (A)
  const [i1, setI1] = useState(0.0);
  const [i2, setI2] = useState(0.0);
  const [i3, setI3] = useState(0.0);

  // 3-Phase Power (W)
  const [p1, setP1] = useState(0.0);
  const [p2, setP2] = useState(0.0);
  const [p3, setP3] = useState(0.0);

  // Total Power & System
  const [totalActiveW, setTotalActiveW] = useState(0.0);
  const [totalApparentVA, setTotalApparentVA] = useState(0.0);
  const [frequency, setFrequency] = useState(0.0);
  const [powerFactor, setPowerFactor] = useState(1.0);
  const [computedKwh, setComputedKwh] = useState(() => {
    const saved = localStorage.getItem('eies_initial_kwh_offset');
    return saved !== null ? parseFloat(saved) : 0.0;
  });

  // Recent history buffer for waveform
  const [historyBuffer, setHistoryBuffer] = useState<Array<{ time: string; p: number; vAvg: number; iTotal: number }>>([]);

  const fetchData = async () => {
    try {
      const response = await fetch('/api/data?limit=25');
      if (!response.ok) throw new Error("API not reachable");
      
      const data = await response.json();
      
      if (Array.isArray(data) && data.length > 0) {
        const latest = data[data.length - 1];
        setConnected(true);
        setError('');
        setLastUpdated(latest['Timestamp'] || new Date().toLocaleTimeString());

        // Exact 3-Phase Voltages from meter_data.csv (NO fake multipliers!)
        const rawV1 = parseFloat(latest['Phase 1 Voltage (V)'] || latest['Voltage (V)'] || '0');
        const rawV2 = parseFloat(latest['Phase 2 Voltage (V)'] || '0');
        const rawV3 = parseFloat(latest['Phase 3 Voltage (V)'] || '0');

        // Exact 3-Phase Currents from meter_data.csv (NO fake multipliers!)
        const rawI1 = parseFloat(latest['Phase 1 Current (A)'] || latest['Current (A)'] || '0');
        const rawI2 = parseFloat(latest['Phase 2 Current (A)'] || '0');
        const rawI3 = parseFloat(latest['Phase 3 Current (A)'] || '0');

        // Exact 3-Phase Powers
        const rawP1 = parseFloat(latest['Phase 1 Power (W)'] || '0');
        const rawP2 = parseFloat(latest['Phase 2 Power (W)'] || '0');
        const rawP3 = parseFloat(latest['Phase 3 Power (W)'] || '0');

        let totApparent = parseFloat(latest['Total Apparent Power (VA)'] || '0');
        if (isNaN(totApparent) || totApparent <= 0) {
          totApparent = (rawV1 * rawI1) + (rawV2 * rawI2) + (rawV3 * rawI3);
        }

        let totActive = parseFloat(latest['Total Active Power (W)'] || latest['Total Power (W)'] || '0');
        if (isNaN(totActive) || totActive <= 0) {
          totActive = rawP1 + rawP2 + rawP3;
          if (totActive <= 0 && rawV1 > 0 && rawI1 > 0) {
            totActive = rawV1 * rawI1 * 0.9;
          }
        }

        // AC Physics Guard: Active Power (W) can never exceed Apparent Power (VA = V * I)
        if (totApparent > 0 && totActive > totApparent * 1.05) {
          totActive = Math.min(totActive, totApparent * 0.95);
        }

        const freq = parseFloat(latest['Frequency (Hz)'] || '50.0');

        let pf = totApparent > 0 ? totActive / totApparent : 1.0;
        pf = Math.max(0.01, Math.min(1.0, pf));

        setV1(isNaN(rawV1) ? 0 : rawV1);
        setV2(isNaN(rawV2) ? 0 : rawV2);
        setV3(isNaN(rawV3) ? 0 : rawV3);

        setI1(isNaN(rawI1) ? 0 : rawI1);
        setI2(isNaN(rawI2) ? 0 : rawI2);
        setI3(isNaN(rawI3) ? 0 : rawI3);

        setP1(isNaN(rawP1) ? 0 : rawP1);
        setP2(isNaN(rawP2) ? 0 : rawP2);
        setP3(isNaN(rawP3) ? 0 : rawP3);

        setTotalActiveW(isNaN(totActive) ? 0 : totActive);
        setTotalApparentVA(isNaN(totApparent) ? 0 : totApparent);
        setFrequency(isNaN(freq) ? 50.0 : freq);
        setPowerFactor(parseFloat(pf.toFixed(3)));

        // Increment integrated energy (approx 1.5s step)
        setComputedKwh(prev => prev + ((totActive * (1.5 / 3600)) / 1000));

        const timeShort = (latest['Timestamp'] || '').slice(11, 19) || new Date().toLocaleTimeString();
        const activeVs = [rawV1, rawV2, rawV3].filter(v => v > 10);
        const vAvg = activeVs.length > 0 ? activeVs.reduce((a, b) => a + b, 0) / activeVs.length : rawV1;
        const iTotal = rawI1 + rawI2 + rawI3;

        setHistoryBuffer(prev => {
          const next = [...prev, { time: timeShort, p: totActive, vAvg, iTotal }];
          return next.slice(-20);
        });
      } else {
        setConnected(false);
        setError('CSV file is currently empty — waiting for meter reader...');
        setLastUpdated('Waiting for new records...');
      }
    } catch {
      setConnected(false);
      setError('Backend server disconnected or meter_data.csv missing.');
    }
  };

  useEffect(() => {
    if (!isRunning) return;
    fetchData();
    const interval = setInterval(fetchData, 1500);
    return () => clearInterval(interval);
  }, [isRunning]);

  const getLiveValueForRegister = (reg: RegisterDefinition) => {
    switch (reg.address) {
      case 0x0000: return v1.toFixed(2);
      case 0x0002: return v2.toFixed(2);
      case 0x0004: return v3.toFixed(2);
      case 0x0006: return i1.toFixed(2);
      case 0x0008: return i2.toFixed(2);
      case 0x000A: return i3.toFixed(2);
      case 0x000C: return p1.toFixed(2);
      case 0x000E: return p2.toFixed(2);
      case 0x0010: return p3.toFixed(2);
      case 0x0030: return frequency.toFixed(2);
      case 0x0032: return totalActiveW.toFixed(2);
      case 0x0036: return totalApparentVA.toFixed(2);
      default: return '--';
    }
  };

  const iTotal = i1 + i2 + i3;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/80 p-4 rounded-xl border border-slate-800 shadow-xl backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-3">
            <span className={`p-2 rounded-lg ${connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              <Radio size={20} className={connected ? 'animate-pulse' : ''} />
            </span>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Live 3-Phase Telemetry Monitor
                {connected && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Online Stream
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-4 mt-1 text-xs text-slate-400 font-mono">
                <span className="flex items-center gap-1">
                  <Database size={12} className="text-slate-500" /> Source: meter_data.csv (read_meter.py)
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} className="text-slate-500" /> Last read: {lastUpdated}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          {!connected && (
            <span className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 ${
              error.includes('empty') 
                ? 'text-amber-400 bg-amber-950/40 border-amber-900/50' 
                : 'text-red-400 bg-red-950/40 border-red-900/50'
            }`}>
              {error.includes('empty') ? <Clock size={14} className="animate-pulse" /> : <ServerOff size={14} />} 
              {error || "Connecting..."}
            </span>
          )}
          <button 
            onClick={() => setIsRunning(!isRunning)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all border ${
              isRunning 
                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750' 
                : 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-950'
            }`}
          >
            {isRunning ? <><PauseCircle size={16} /> Pause Stream</> : <><PlayCircle size={16} /> Resume Stream</>}
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Line Voltages Card (Line 1, Line 2, Line 3) */}
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg relative overflow-hidden group hover:border-blue-500/50 transition-colors">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Line Voltages</span>
            <span className="text-[11px] font-mono text-slate-500 bg-slate-800/80 px-1.5 py-0.5 rounded">L1 / L2 / L3</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 my-1">
            <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800 text-center">
              <span className="text-[10px] text-blue-400 font-bold block uppercase tracking-wider">
                {v3 < 10 && v2 > 10 ? 'Ch A (L1)' : 'Line 1'}
              </span>
              <span className="text-xl font-mono font-bold text-white tracking-tight block">
                {v1.toFixed(1)}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Volts</span>
            </div>
            <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800 text-center">
              <span className="text-[10px] text-cyan-400 font-bold block uppercase tracking-wider">
                {v3 < 10 && v2 > 10 ? 'Ch B (L2)' : 'Line 2'}
              </span>
              <span className="text-xl font-mono font-bold text-white tracking-tight block">
                {v2.toFixed(1)}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Volts</span>
            </div>
            <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800 text-center">
              <span className="text-[10px] text-indigo-400 font-bold block uppercase tracking-wider">
                {v3 < 10 ? 'L3 (N/A)' : 'Line 3'}
              </span>
              <span className="text-xl font-mono font-bold text-white tracking-tight block">
                {v3.toFixed(1)}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Volts</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between font-mono text-[11px]">
            <span>Telemetry Ingest</span>
            <span className={v3 < 10 && v2 > 10 ? 'text-cyan-400 font-semibold' : (v2 < 10 && v3 < 10 ? 'text-emerald-400' : 'text-slate-400')}>
              {v3 < 10 && v2 > 10 ? 'Tuya Dual Meter (Ch A & B)' : (v2 < 10 && v3 < 10 ? 'Single-Phase Mode' : '3-Phase Mode')}
            </span>
          </div>
        </div>

        {/* Current Card */}
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg relative overflow-hidden group hover:border-amber-500/50 transition-colors">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Current</span>
            <span className="text-[11px] font-mono text-slate-500 bg-slate-800/80 px-1.5 py-0.5 rounded">0x0006</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-white tracking-tight">
              {iTotal.toFixed(2)}
            </span>
            <span className="text-amber-400 text-sm font-semibold">A</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between font-mono text-[11px]">
            <span>L1: {i1.toFixed(2)}A</span>
            <span>L2: {i2.toFixed(2)}A</span>
            <span>L3: {i3.toFixed(2)}A</span>
          </div>
        </div>

        {/* Active Power Card */}
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Active Power</span>
            <span className="text-[11px] font-mono text-slate-500 bg-slate-800/80 px-1.5 py-0.5 rounded">0x0032</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-emerald-400 tracking-tight">
              {totalActiveW.toFixed(1)}
            </span>
            <span className="text-emerald-300 text-sm font-semibold">W</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between font-mono text-[11px]">
            <span>Apparent: {totalApparentVA.toFixed(0)} VA</span>
            <span>PF: {powerFactor.toFixed(2)}</span>
          </div>
        </div>

        {/* Computed Energy Card */}
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg relative overflow-hidden group hover:border-cyan-500/50 transition-colors">
          <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500"></div>
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Active Energy (Integrated)</span>
            <span className="text-[11px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">∫ P dt</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-white tracking-tight">
              {computedKwh.toFixed(3)}
            </span>
            <span className="text-cyan-400 text-sm font-semibold">kWh</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
            <span>Frequency: {frequency.toFixed(2)} Hz</span>
            <span className="text-cyan-400/80 font-mono">0x0030</span>
          </div>
        </div>

      </div>

      {/* Waveform & Power Factor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Real-time Power Chart */}
        <div className="lg:col-span-2 bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="text-slate-200 text-sm font-semibold flex items-center gap-2">
                <Activity size={16} className="text-emerald-400" />
                Live Total Real Power Stream (W)
              </h3>
              <p className="text-xs text-slate-500">Updated every 1.5s from meter data</p>
            </div>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Live Modbus FC 04
            </span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={historyBuffer}>
                <defs>
                  <linearGradient id="powerGrad3P" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 10 }} stroke="#475569" />
                <YAxis domain={['auto', 'auto']} tick={{ fill: '#94a3b8', fontSize: 10 }} stroke="#475569" unit="W" />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
                <Area type="monotone" dataKey="p" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#powerGrad3P)" isAnimationActive={false} name="Total Power (W)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Phase Breakdown Card */}
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg flex flex-col justify-between">
          <div>
            <h3 className="text-slate-200 text-sm font-semibold mb-3 flex items-center gap-2">
              <Gauge size={16} className="text-indigo-400" />
              Per-Phase Load Distribution
            </h3>
            
            <div className="space-y-3.5">
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1 font-mono">
                  <span>Phase 1 (L1)</span>
                  <span className="text-blue-400 font-bold">{p1.toFixed(0)} W ({i1.toFixed(2)} A)</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (p1 / (totalActiveW || 1)) * 100)}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1 font-mono">
                  <span>Phase 2 (L2)</span>
                  <span className="text-cyan-400 font-bold">{p2.toFixed(0)} W ({i2.toFixed(2)} A)</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (p2 / (totalActiveW || 1)) * 100)}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1 font-mono">
                  <span>Phase 3 (L3)</span>
                  <span className="text-amber-400 font-bold">{p3.toFixed(0)} W ({i3.toFixed(2)} A)</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (p3 / (totalActiveW || 1)) * 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 text-xs space-y-1.5">
                <div className="flex justify-between text-slate-400">
                  <span>Power Factor (cos φ):</span>
                  <span className="font-mono text-emerald-400 font-bold">{powerFactor.toFixed(3)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Grid Frequency:</span>
                  <span className="font-mono text-slate-200">{frequency.toFixed(2)} Hz</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Converter: /dev/ttyUSB0</span>
            <span className="font-mono text-slate-400">9600 8-N-1</span>
          </div>
        </div>

      </div>

      {/* 3-Phase Register Values Table */}
      <div className="bg-slate-900/90 rounded-xl overflow-hidden border border-slate-800 shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/60">
          <div>
            <h3 className="text-white text-sm font-semibold flex items-center gap-2">
              <Zap size={16} className="text-emerald-400" />
              3-Phase Register Telemetry Values (read_meter.py Mapping)
            </h3>
            <p className="text-xs text-slate-400">
              Function Code 04H (32-bit Float Big Endian IEEE-754)
            </p>
          </div>
          <span className="text-xs text-emerald-400 font-mono bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
            60 Input Registers Read
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-400">
            <thead className="bg-slate-950 text-slate-300 uppercase font-medium text-[11px]">
              <tr>
                <th className="px-6 py-3">Address (Hex)</th>
                <th className="px-6 py-3">Dec Reg</th>
                <th className="px-6 py-3">Parameter Description</th>
                <th className="px-6 py-3 text-right text-emerald-400">Current Value</th>
                <th className="px-6 py-3">Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-mono">
              {REGISTER_MAP.map((reg) => (
                <tr key={reg.address} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-6 py-2.5 text-amber-400 font-semibold">{reg.hexAddress}</td>
                  <td className="px-6 py-2.5 text-slate-500">{reg.address}</td>
                  <td className="px-6 py-2.5 text-slate-200 font-sans font-medium">{reg.name}</td>
                  <td className="px-6 py-2.5 text-right font-bold text-emerald-400 text-sm">
                    {getLiveValueForRegister(reg)}
                  </td>
                  <td className="px-6 py-2.5 text-slate-400 font-sans">{reg.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LiveMonitor;
