import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { Download, Table, Activity, RefreshCw, Zap, TrendingUp } from 'lucide-react';

interface HistoryPoint {
  timestamp: string;
  fullTimestamp: string;
  v1: number;
  v2: number;
  v3: number;
  i1: number;
  i2: number;
  i3: number;
  totalActive: number;
  totalApparent: number;
  computedKwh: number;
  frequency: number;
}

const HistoricalView: React.FC = () => {
  const [data, setData] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [metricTab, setMetricTab] = useState<'power' | 'voltage' | 'current' | 'energy'>('power');

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/data?limit=100');
      if (!response.ok) throw new Error("API Error");
      const rawData = await response.json();
      
      const savedOffset = localStorage.getItem('eies_initial_kwh_offset');
      let runningKwh = savedOffset !== null ? parseFloat(savedOffset) : 0.0;
      let prevTimeMs = 0;
      let prevActive = 0;

      const formattedData: HistoryPoint[] = rawData.map((row: any, idx: number) => {
        const fullTs = row['Timestamp'] || '';
        const timeOnly = fullTs.split(' ')[1] || fullTs;

        const v1 = parseFloat(row['Phase 1 Voltage (V)'] || row['Voltage (V)'] || '0');
        const v2 = parseFloat(row['Phase 2 Voltage (V)'] || '0');
        const v3 = parseFloat(row['Phase 3 Voltage (V)'] || '0');

        const i1 = parseFloat(row['Phase 1 Current (A)'] || row['Current (A)'] || '0');
        const i2 = parseFloat(row['Phase 2 Current (A)'] || '0');
        const i3 = parseFloat(row['Phase 3 Current (A)'] || '0');

        let totActive = parseFloat(row['Total Active Power (W)'] || row['Total Power (W)'] || '0');
        if (isNaN(totActive) || totActive <= 0) {
          totActive = (v1 * i1 * 0.9);
        }

        let totApparent = parseFloat(row['Total Apparent Power (VA)'] || '0');
        if (isNaN(totApparent) || totApparent <= 0) {
          totApparent = (v1 * i1) + (v2 * i2) + (v3 * i3);
        }

        // Integrate energy
        const curTimeMs = new Date(fullTs).getTime();
        let deltaKwh = 0;
        if (idx > 0 && !isNaN(curTimeMs) && !isNaN(prevTimeMs) && curTimeMs > prevTimeMs) {
          const dtSec = (curTimeMs - prevTimeMs) / 1000;
          if (dtSec > 0 && dtSec <= 300) {
            deltaKwh = (((totActive + prevActive) / 2) * (dtSec / 3600)) / 1000;
          } else {
            deltaKwh = (totActive * (1 / 3600)) / 1000;
          }
        } else if (idx > 0) {
          deltaKwh = (totActive * (1 / 3600)) / 1000;
        }

        runningKwh += deltaKwh;
        prevTimeMs = curTimeMs;
        prevActive = totActive;

        return {
          timestamp: timeOnly,
          fullTimestamp: fullTs,
          v1: isNaN(v1) ? 230 : v1,
          v2: isNaN(v2) ? 230 : v2,
          v3: isNaN(v3) ? 230 : v3,
          i1: isNaN(i1) ? 0 : i1,
          i2: isNaN(i2) ? 0 : i2,
          i3: isNaN(i3) ? 0 : i3,
          totalActive: isNaN(totActive) ? 0 : totActive,
          totalApparent: isNaN(totApparent) ? 0 : totApparent,
          computedKwh: parseFloat(runningKwh.toFixed(3)),
          frequency: parseFloat(row['Frequency (Hz)'] || '50.0'),
        };
      });
      
      setData(formattedData);
    } catch (e) {
      console.error("Failed to load history", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleExportJSON = () => {
    if (data.length === 0) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meter_history_3phase_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/80 p-4 rounded-xl border border-slate-800 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="text-purple-400" /> Recent Historical Telemetry
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Visualizing real-time 3-phase records logged to <span className="font-mono text-slate-300">meter_data.csv</span>.
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={fetchHistory}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-emerald-400 hover:bg-slate-750 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button 
            onClick={handleExportJSON}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200 hover:bg-slate-750 transition-colors"
          >
            <Download size={14} /> JSON Export
          </button>
        </div>
      </div>

      {/* Metric Selector Tabs */}
      <div className="flex flex-wrap gap-2 bg-slate-900/60 p-1.5 rounded-lg border border-slate-800 w-fit text-xs">
        <button
          onClick={() => setMetricTab('power')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
            metricTab === 'power'
              ? 'bg-slate-800 text-emerald-400 border border-slate-700'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Zap size={14} /> Total Power (W & VA)
        </button>
        <button
          onClick={() => setMetricTab('voltage')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
            metricTab === 'voltage'
              ? 'bg-slate-800 text-blue-400 border border-slate-700'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Activity size={14} /> 3-Phase Voltages (L1, L2, L3)
        </button>
        <button
          onClick={() => setMetricTab('current')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
            metricTab === 'current'
              ? 'bg-slate-800 text-amber-400 border border-slate-700'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Activity size={14} /> 3-Phase Currents (L1, L2, L3)
        </button>
        <button
          onClick={() => setMetricTab('energy')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
            metricTab === 'energy'
              ? 'bg-slate-800 text-cyan-400 border border-slate-700'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <TrendingUp size={14} /> Integrated Energy (kWh)
        </button>
      </div>

      {/* Main Focus Chart based on Tab */}
      {metricTab === 'power' && (
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg">
          <h3 className="text-slate-200 text-sm font-semibold mb-4">Total Active Power (W) & Total Apparent Power (VA)</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="timestamp" tick={{fill: '#94a3b8', fontSize: 10}} minTickGap={35} stroke="#475569" />
                <YAxis domain={['auto', 'auto']} tick={{fill: '#94a3b8', fontSize: 10}} stroke="#475569" unit=" W" />
                <Tooltip contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9'}} />
                <Legend wrapperStyle={{fontSize: 11}} />
                <Line type="monotone" dataKey="totalActive" stroke="#10b981" dot={false} name="Total Active (W)" strokeWidth={2} isAnimationActive={false} />
                <Line type="monotone" dataKey="totalApparent" stroke="#8b5cf6" dot={false} strokeDasharray="3 3" name="Total Apparent (VA)" strokeWidth={1.5} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {metricTab === 'voltage' && (
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg">
          <h3 className="text-slate-200 text-sm font-semibold mb-4">3-Phase Voltage Balance (V)</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="timestamp" tick={{fill: '#94a3b8', fontSize: 10}} minTickGap={30} stroke="#475569" />
                <YAxis domain={[215, 245]} tick={{fill: '#94a3b8', fontSize: 10}} stroke="#475569" unit="V" />
                <Tooltip contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9'}} />
                <Legend wrapperStyle={{fontSize: 11}} />
                <Line type="monotone" dataKey="v1" stroke="#3b82f6" dot={false} name="Phase 1 (V)" strokeWidth={1.5} isAnimationActive={false} />
                <Line type="monotone" dataKey="v2" stroke="#60a5fa" dot={false} name="Phase 2 (V)" strokeWidth={1.5} isAnimationActive={false} />
                <Line type="monotone" dataKey="v3" stroke="#93c5fd" dot={false} name="Phase 3 (V)" strokeWidth={1.5} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {metricTab === 'current' && (
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg">
          <h3 className="text-slate-200 text-sm font-semibold mb-4">3-Phase Current Loads (A)</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="timestamp" tick={{fill: '#94a3b8', fontSize: 10}} minTickGap={30} stroke="#475569" />
                <YAxis domain={[0, 'auto']} tick={{fill: '#94a3b8', fontSize: 10}} stroke="#475569" unit="A" />
                <Tooltip contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9'}} />
                <Legend wrapperStyle={{fontSize: 11}} />
                <Line type="monotone" dataKey="i1" stroke="#f59e0b" dot={false} name="Phase 1 (A)" strokeWidth={1.5} isAnimationActive={false} />
                <Line type="monotone" dataKey="i2" stroke="#fbbf24" dot={false} name="Phase 2 (A)" strokeWidth={1.5} isAnimationActive={false} />
                <Line type="monotone" dataKey="i3" stroke="#fde68a" dot={false} name="Phase 3 (A)" strokeWidth={1.5} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {metricTab === 'energy' && (
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg">
          <h3 className="text-slate-200 text-sm font-semibold mb-4">Integrated Active Energy (kWh)</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorKwhHist3P" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="timestamp" tick={{fill: '#94a3b8', fontSize: 10}} minTickGap={35} stroke="#475569" />
                <YAxis domain={['auto', 'auto']} tick={{fill: '#94a3b8', fontSize: 10}} stroke="#475569" unit=" kWh" />
                <Tooltip contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9'}} />
                <Area type="monotone" dataKey="computedKwh" stroke="#06b6d4" fill="url(#colorKwhHist3P)" strokeWidth={2} isAnimationActive={false} name="Total Energy (kWh)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Log Table */}
      <div className="bg-slate-900/90 rounded-xl overflow-hidden border border-slate-800 shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Table size={16} className="text-slate-400" />
            <h3 className="text-white text-xs font-semibold uppercase tracking-wider">Recorded History Stream</h3>
          </div>
          <span className="text-xs text-slate-500 font-mono">Showing {data.length} latest records</span>
        </div>
        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-left text-xs text-slate-300 whitespace-nowrap">
            <thead className="bg-slate-950 text-slate-400 uppercase font-medium sticky top-0 text-[11px]">
              <tr>
                <th className="px-5 py-3">Timestamp</th>
                <th className="px-5 py-3 text-emerald-400">Total Active (W)</th>
                <th className="px-5 py-3 text-purple-400">Total Apparent (VA)</th>
                <th className="px-5 py-3 text-cyan-400">Computed kWh</th>
                <th className="px-5 py-3 text-blue-300">V1 / V2 / V3 (V)</th>
                <th className="px-5 py-3 text-amber-300">I1 / I2 / I3 (A)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {data.slice().reverse().slice(0, 50).map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-2 text-slate-300 font-sans">{row.fullTimestamp}</td>
                  <td className="px-5 py-2 font-bold text-emerald-400">{row.totalActive.toFixed(1)} W</td>
                  <td className="px-5 py-2 text-purple-300">{row.totalApparent.toFixed(1)} VA</td>
                  <td className="px-5 py-2 font-bold text-cyan-400">{row.computedKwh.toFixed(3)}</td>
                  <td className="px-5 py-2 text-blue-300">{row.v1.toFixed(1)} / {row.v2.toFixed(1)} / {row.v3.toFixed(1)}</td>
                  <td className="px-5 py-2 text-amber-300">{row.i1.toFixed(2)} / {row.i2.toFixed(2)} / {row.i3.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default HistoricalView;
