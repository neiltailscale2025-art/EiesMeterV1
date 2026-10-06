import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  Calendar, Search, Download, Filter, AlertCircle,
  Zap, Leaf, TrendingUp, Clock,
  ArrowUpRight, RefreshCw, BarChart3,
  Layers, Activity, Flame, Trash2, X, Check, AlertTriangle, Terminal,
  Lock, KeyRound, Eye, EyeOff, ShieldCheck, Loader2
} from 'lucide-react';
import { verifyProtectedPassword } from '../utils/crypto';

interface DataPoint {
  fullTimestamp: string;
  displayTime: string;
  // 3-Phase Voltages
  v1: number;
  v2: number;
  v3: number;
  vAvg: number;
  // 3-Phase Currents
  i1: number;
  i2: number;
  i3: number;
  iTotal: number;
  // 3-Phase Power
  p1: number;
  p2: number;
  p3: number;
  totalActiveW: number;
  totalApparentVA: number;
  totalReactiveVar: number;
  powerFactor: number;
  frequency: number;
  // Integrated Energy
  deltaKwh: number;
  cumulativeKwh: number;
}

interface IntervalBucket {
  periodLabel: string;
  startKwh: number;
  endKwh: number;
  deltaKwh: number;
  avgPowerW: number;
  peakPowerW: number;
  cost: number;
  timestamp: string;
}

const TimelineView: React.FC = () => {
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Energy Tariff & Carbon settings (Philippine Peso ₱) - Persisted to localStorage
  const [costPerKwh, setCostPerKwh] = useState<number>(() => {
    const saved = localStorage.getItem('eies_cost_per_kwh');
    return saved !== null ? parseFloat(saved) : 11.50;
  });
  const carbonFactor = 0.42; // 0.42 kg CO2 / kWh
  const [activeSubTab, setActiveSubTab] = useState<'charts' | 'intervals' | 'table'>('charts');

  const updateCostPerKwh = (val: number) => {
    setCostPerKwh(val);
    localStorage.setItem('eies_cost_per_kwh', val.toString());
  };

  // Starting kWh Offset (defaults to 0.00 so users start from zero or customize)
  const [initialKwhOffset, setInitialKwhOffset] = useState<number>(() => {
    const saved = localStorage.getItem('eies_initial_kwh_offset');
    return saved !== null ? parseFloat(saved) : 0.0;
  });

  // Modal State for Deleting / Managing Records (Protected via hashed password)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteAuthorized, setDeleteAuthorized] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('eies_auth_unlocked') === 'true';
    } catch {
      return false;
    }
  });
  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');
  const [showDeletePasswordText, setShowDeletePasswordText] = useState(false);
  const [isVerifyingDelete, setIsVerifyingDelete] = useState(false);

  const [deleteStatus, setDeleteStatus] = useState<{ loading: boolean; message: string; isError?: boolean }>({
    loading: false,
    message: ''
  });

  const handleVerifyDeletePassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!deletePasswordInput.trim()) {
      setDeletePasswordError('Please enter the password.');
      return;
    }

    setIsVerifyingDelete(true);
    setDeletePasswordError('');

    try {
      const isValid = await verifyProtectedPassword(deletePasswordInput.trim());
      if (isValid) {
        setDeleteAuthorized(true);
        try {
          sessionStorage.setItem('eies_auth_unlocked', 'true');
        } catch {}
        setDeletePasswordInput('');
        setDeletePasswordError('');
      } else {
        setDeletePasswordError('Incorrect password. Authorization denied.');
      }
    } catch {
      setDeletePasswordError('Verification error. Please retry.');
    } finally {
      setIsVerifyingDelete(false);
    }
  };

  // Format Date for datetime-local
  const formatForInput = (d: Date) => {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };

  const now = new Date();
  const [startTime, setStartTime] = useState(formatForInput(new Date(now.getTime() - 24 * 60 * 60 * 1000))); // Default 24 hours
  const [endTime, setEndTime] = useState(formatForInput(now));

  const setPresetRange = (hours: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    setStartTime(formatForInput(start));
    setEndTime(formatForInput(end));
    fetchDataRange(formatForInput(start), formatForInput(end));
  };

  const setAllDataRange = () => {
    setStartTime('');
    setEndTime('');
    fetchDataRange('', '');
  };

  const fetchDataRange = async (customStart?: string, customEnd?: string) => {
    setLoading(true);
    setError('');

    const startVal = customStart !== undefined ? customStart : startTime;
    const endVal = customEnd !== undefined ? customEnd : endTime;

    try {
      const queryParams = new URLSearchParams({ limit: '0' });
      if (startVal) queryParams.set('start', startVal);
      if (endVal) queryParams.set('end', endVal);

      const response = await fetch(`/api/data?${queryParams.toString()}`);
      if (!response.ok) throw new Error("Could not fetch data from /api/data");

      const raw = await response.json();
      if (!Array.isArray(raw) || raw.length === 0) {
        setData([]);
        return;
      }

      // Mathematical integration of active power to compute energy (kWh)
      let runningKwh = initialKwhOffset;
      let prevTimeMs = 0;
      let prevPowerW = 0;

      const processed: DataPoint[] = [];

      for (let idx = 0; idx < raw.length; idx++) {
        const row = raw[idx];
        const ts = row['Timestamp'] || `Row ${idx}`;

        // 3-Phase Voltages (L1, L2, L3)
        const v1 = parseFloat(row['Phase 1 Voltage (V)'] || row['Voltage (V)'] || '0');
        const v2 = parseFloat(row['Phase 2 Voltage (V)'] || '0');
        const v3 = parseFloat(row['Phase 3 Voltage (V)'] || '0');

        // Calculate average only over active phases (> 10V) to properly support single phase
        const activeVoltages = [v1, v2, v3].filter(v => v > 10);
        const vAvg = activeVoltages.length > 0
          ? parseFloat((activeVoltages.reduce((a, b) => a + b, 0) / activeVoltages.length).toFixed(2))
          : v1;

        // 3-Phase Currents (L1, L2, L3)
        const i1 = parseFloat(row['Phase 1 Current (A)'] || row['Current (A)'] || '0');
        const i2 = parseFloat(row['Phase 2 Current (A)'] || '0');
        const i3 = parseFloat(row['Phase 3 Current (A)'] || '0');
        const iTotal = parseFloat((i1 + i2 + i3).toFixed(2));

        // 3-Phase Active Powers
        const p1 = parseFloat(row['Phase 1 Power (W)'] || '0');
        const p2 = parseFloat(row['Phase 2 Power (W)'] || '0');
        const p3 = parseFloat(row['Phase 3 Power (W)'] || '0');

        // Total Active & Apparent Powers
        let totalApparentVA = parseFloat(row['Total Apparent Power (VA)'] || '0');
        if (isNaN(totalApparentVA) || totalApparentVA <= 0) {
          totalApparentVA = (v1 * i1) + (v2 * i2) + (v3 * i3);
        }

        let totalActiveW = parseFloat(row['Total Active Power (W)'] || row['Total Power (W)'] || '0');
        if (isNaN(totalActiveW) || totalActiveW <= 0) {
          totalActiveW = p1 + p2 + p3;
          if (totalActiveW <= 0 && v1 > 0 && i1 > 0) {
            totalActiveW = v1 * i1 * 0.95;
          }
        }

        // AC Physics Guard: Active Power (W) can never exceed Apparent Power (VA = V * I)
        if (totalApparentVA > 0 && totalActiveW > totalApparentVA * 1.05) {
          totalActiveW = Math.min(totalActiveW, totalApparentVA * 0.95);
        }

        // Power Factor: PF = P / S
        let pf = totalApparentVA > 0 ? totalActiveW / totalApparentVA : 0.95;
        pf = Math.max(0.01, Math.min(1.0, pf));

        // Reactive Power: Q = sqrt(S^2 - P^2)
        const reactiveVar = Math.sqrt(Math.max(0, (totalApparentVA * totalApparentVA) - (totalActiveW * totalActiveW)));
        const freq = parseFloat(row['Frequency (Hz)'] || '50.0');

        // Energy Integration: delta kWh = (P_avg * dt_hours) / 1000
        const curTimeMs = new Date(ts).getTime();
        let deltaKwh = 0;

        if (idx > 0 && !isNaN(curTimeMs) && !isNaN(prevTimeMs) && curTimeMs > prevTimeMs) {
          const dtSeconds = (curTimeMs - prevTimeMs) / 1000;
          if (dtSeconds > 0 && dtSeconds <= 300) {
            const avgP = (totalActiveW + prevPowerW) / 2;
            deltaKwh = (avgP * (dtSeconds / 3600)) / 1000;
          } else {
            deltaKwh = (totalActiveW * (1 / 3600)) / 1000;
          }
        } else if (idx > 0) {
          deltaKwh = (totalActiveW * (1 / 3600)) / 1000;
        }

        runningKwh += deltaKwh;
        prevTimeMs = curTimeMs;
        prevPowerW = totalActiveW;

        processed.push({
          fullTimestamp: ts,
          displayTime: ts.length > 11 ? ts.slice(11, 19) : ts,
          v1: isNaN(v1) ? 0 : v1,
          v2: isNaN(v2) ? 0 : v2,
          v3: isNaN(v3) ? 0 : v3,
          vAvg: isNaN(vAvg) ? 0 : vAvg,
          i1: isNaN(i1) ? 0 : i1,
          i2: isNaN(i2) ? 0 : i2,
          i3: isNaN(i3) ? 0 : i3,
          iTotal: isNaN(iTotal) ? 0 : iTotal,
          p1: isNaN(p1) ? 0 : p1,
          p2: isNaN(p2) ? 0 : p2,
          p3: isNaN(p3) ? 0 : p3,
          totalActiveW: isNaN(totalActiveW) ? 0 : totalActiveW,
          totalApparentVA: isNaN(totalApparentVA) ? 0 : totalApparentVA,
          totalReactiveVar: isNaN(reactiveVar) ? 0 : parseFloat(reactiveVar.toFixed(1)),
          powerFactor: parseFloat(pf.toFixed(3)),
          frequency: isNaN(freq) ? 50.0 : freq,
          deltaKwh: parseFloat(deltaKwh.toFixed(4)),
          cumulativeKwh: parseFloat(runningKwh.toFixed(3)),
        });
      }

      // Suppress isolated 1-sample zero dropouts (WiFi packet drop / partial Tuya DPS glitch)
      for (let i = 1; i < processed.length - 1; i++) {
        const prev = processed[i - 1];
        const curr = processed[i];
        const next = processed[i + 1];

        if (
          (curr.totalActiveW === 0 || Math.abs(curr.v1 - 230.0) < 0.05) &&
          curr.v1 > 180 &&
          prev.totalActiveW > 20 &&
          next.totalActiveW > 20 &&
          prev.v1 > 180 &&
          next.v1 > 180
        ) {
          curr.totalActiveW = parseFloat(((prev.totalActiveW + next.totalActiveW) / 2).toFixed(2));
          curr.totalApparentVA = parseFloat(((prev.totalApparentVA + next.totalApparentVA) / 2).toFixed(2));
          curr.i1 = parseFloat(((prev.i1 + next.i1) / 2).toFixed(3));
          curr.iTotal = parseFloat(((prev.iTotal + next.iTotal) / 2).toFixed(3));
          curr.p1 = parseFloat(((prev.p1 + next.p1) / 2).toFixed(2));
          curr.v1 = parseFloat(((prev.v1 + next.v1) / 2).toFixed(2));
          curr.vAvg = parseFloat(((prev.vAvg + next.vAvg) / 2).toFixed(2));
        }
      }

      setData(processed);
    } catch (err) {
      console.error(err);
      setError("Failed to load meter dataset. Please verify connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDataRange();
  }, [initialKwhOffset]);

  // Handle Deleting Records via API (Strictly protected)
  const handleDeleteRecords = async (mode: 'all' | 'older_24h' | 'older_7d' | 'keep_50') => {
    const isAuth = deleteAuthorized || sessionStorage.getItem('eies_auth_unlocked') === 'true';
    if (!isAuth) {
      setDeleteAuthorized(false);
      setDeleteStatus({ loading: false, message: 'Password authentication required to perform deletion.', isError: true });
      return;
    }

    setDeleteStatus({ loading: true, message: 'Processing request...' });
    try {
      let query = '';
      if (mode === 'all') {
        query = 'all=true';
      } else if (mode === 'older_24h') {
        const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
        query = `before=${encodeURIComponent(d.toISOString().slice(0, 19).replace('T', ' '))}`;
      } else if (mode === 'older_7d') {
        const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        query = `before=${encodeURIComponent(d.toISOString().slice(0, 19).replace('T', ' '))}`;
      } else if (mode === 'keep_50') {
        query = 'keep=50';
      }

      const res = await fetch(`/api/data?${query}`, { method: 'DELETE' });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error || 'Failed to delete records');

      setDeleteStatus({
        loading: false,
        message: result.message || 'Records successfully cleaned!'
      });

      // Refresh data immediately
      setTimeout(() => {
        fetchDataRange();
      }, 500);
    } catch (err: any) {
      setDeleteStatus({
        loading: false,
        message: err.message || 'Error deleting records',
        isError: true
      });
    }
  };

  const handleSaveInitialOffset = (val: number) => {
    setInitialKwhOffset(val);
    localStorage.setItem('eies_initial_kwh_offset', val.toString());
  };

  // Summary KPI Calculations
  const summary = useMemo(() => {
    if (data.length === 0) {
      return {
        startKwh: 0,
        endKwh: 0,
        consumedKwh: 0,
        avgPowerW: 0,
        peakPowerW: 0,
        peakTime: '--',
        minVoltage: 0,
        maxVoltage: 0,
        avgVoltage: 0,
        avgCurrent: 0,
        avgPf: 0,
        totalCost: 0,
        carbonKg: 0,
      };
    }

    const first = data[0];
    const last = data[data.length - 1];

    const startKwh = first.cumulativeKwh;
    const endKwh = last.cumulativeKwh;
    const consumedKwh = Math.max(0, endKwh - startKwh);

    let maxPower = -Infinity;
    let peakTimestamp = '';
    let sumPower = 0;
    let sumVolt = 0;
    let sumCurr = 0;
    let sumPf = 0;
    let minV = Infinity;
    let maxV = -Infinity;

    data.forEach((d) => {
      if (d.totalActiveW > maxPower) {
        maxPower = d.totalActiveW;
        peakTimestamp = d.fullTimestamp;
      }
      sumPower += d.totalActiveW;
      sumVolt += d.vAvg;
      sumCurr += d.iTotal;
      sumPf += d.powerFactor;
      if (d.vAvg < minV) minV = d.vAvg;
      if (d.vAvg > maxV) maxV = d.vAvg;
    });

    const count = data.length;
    const avgPower = sumPower / count;
    const avgV = sumVolt / count;
    const avgI = sumCurr / count;
    const avgPf = sumPf / count;
    const totalCost = consumedKwh * costPerKwh;
    const carbonKg = consumedKwh * carbonFactor;

    return {
      startKwh,
      endKwh,
      consumedKwh,
      avgPowerW: avgPower,
      peakPowerW: maxPower > 0 ? maxPower : 0,
      peakTime: peakTimestamp,
      minVoltage: minV === Infinity ? 0 : minV,
      maxVoltage: maxV === -Infinity ? 0 : maxV,
      avgVoltage: avgV,
      avgCurrent: avgI,
      avgPf,
      totalCost,
      carbonKg,
    };
  }, [data, costPerKwh, carbonFactor]);

  // Aggregate into periodic consumption bins (kWh per window)
  const intervalBuckets = useMemo<IntervalBucket[]>(() => {
    if (data.length < 2) return [];

    const numBuckets = Math.min(24, Math.max(6, Math.floor(data.length / 15)));
    const bucketSize = Math.ceil(data.length / numBuckets);
    const buckets: IntervalBucket[] = [];

    for (let i = 0; i < data.length; i += bucketSize) {
      const slice = data.slice(i, i + bucketSize);
      if (slice.length === 0) continue;

      const firstPt = slice[0];
      const lastPt = slice[slice.length - 1];

      const deltaKwh = slice.reduce((acc, curr) => acc + curr.deltaKwh, 0);

      let maxW = 0;
      let sumW = 0;
      slice.forEach((s) => {
        if (s.totalActiveW > maxW) maxW = s.totalActiveW;
        sumW += s.totalActiveW;
      });

      const avgW = sumW / slice.length;
      const label = firstPt.displayTime;

      buckets.push({
        periodLabel: label,
        startKwh: firstPt.cumulativeKwh,
        endKwh: lastPt.cumulativeKwh,
        deltaKwh: parseFloat(deltaKwh.toFixed(3)),
        avgPowerW: parseFloat(avgW.toFixed(1)),
        peakPowerW: parseFloat(maxW.toFixed(1)),
        cost: parseFloat((deltaKwh * costPerKwh).toFixed(2)),
        timestamp: firstPt.fullTimestamp,
      });
    }

    return buckets;
  }, [data, costPerKwh]);

  // Export to CSV
  const handleExportCSV = () => {
    if (data.length === 0) return;
    const headers = [
      'Timestamp',
      'Phase 1 Voltage (V)', 'Phase 2 Voltage (V)', 'Phase 3 Voltage (V)',
      'Phase 1 Current (A)', 'Phase 2 Current (A)', 'Phase 3 Current (A)',
      'Phase 1 Power (W)', 'Phase 2 Power (W)', 'Phase 3 Power (W)',
      'Total Active Power (W)', 'Total Apparent Power (VA)',
      'Power Factor', 'Frequency (Hz)', 'Computed Active Energy (kWh)'
    ];
    const rows = data.map((d) => [
      d.fullTimestamp,
      d.v1.toFixed(2), d.v2.toFixed(2), d.v3.toFixed(2),
      d.i1.toFixed(2), d.i2.toFixed(2), d.i3.toFixed(2),
      d.p1.toFixed(2), d.p2.toFixed(2), d.p3.toFixed(2),
      d.totalActiveW.toFixed(2), d.totalApparentVA.toFixed(2),
      d.powerFactor.toFixed(3), d.frequency.toFixed(2), d.cumulativeKwh.toFixed(3)
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = `eies_3phase_kwh_timeline_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Time Range Controls */}
      <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                <Calendar size={20} />
              </span>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  Timeline & kWh Energy Consumption Dashboard
                </h2>
                <p className="text-xs text-slate-400">
                  Calculates integrated active energy (kWh) from 3-phase real power measurements with Philippine Peso (₱) tariff.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/60 p-1.5 rounded-lg border border-slate-800 text-xs">
            <span className="text-slate-500 px-2 font-medium">Presets:</span>
            <button
              onClick={() => setPresetRange(1)}
              className="px-2.5 py-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            >
              1h
            </button>
            <button
              onClick={() => setPresetRange(6)}
              className="px-2.5 py-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            >
              6h
            </button>
            <button
              onClick={() => setPresetRange(24)}
              className="px-2.5 py-1 rounded bg-slate-800 text-emerald-400 font-semibold border border-slate-700 transition-colors"
            >
              24h
            </button>
            <button
              onClick={() => setPresetRange(168)}
              className="px-2.5 py-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            >
              7d
            </button>
            <button
              onClick={setAllDataRange}
              className="px-2.5 py-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            >
              All
            </button>
          </div>
        </div>

        {/* Custom Date Filter Row */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-col md:flex-row items-end md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 uppercase font-semibold">From:</span>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-emerald-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 uppercase font-semibold">To:</span>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-emerald-500 outline-none"
              />
            </div>
            <button
              onClick={() => fetchDataRange()}
              disabled={loading}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3.5 py-1.5 rounded text-xs font-medium transition-colors"
            >
              <Search size={14} /> {loading ? 'Querying...' : 'Apply Filter'}
            </button>
            <button
              onClick={() => fetchDataRange()}
              title="Refresh dataset"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Rate, Clear & Export Controls */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
              <span className="text-amber-400 font-bold font-mono text-sm leading-none">₱</span>
              <span className="text-slate-400">Tariff:</span>
              <input
                type="number"
                step="0.10"
                min="0.01"
                value={costPerKwh}
                onChange={(e) => updateCostPerKwh(parseFloat(e.target.value) || 0)}
                className="w-16 bg-transparent text-amber-300 text-right font-mono font-medium outline-none"
              />
              <span className="text-slate-500">₱/kWh</span>
            </div>

            <button
              onClick={handleExportCSV}
              disabled={data.length === 0}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-750 disabled:opacity-40 text-slate-200 px-3 py-1.5 rounded border border-slate-700 font-medium transition-colors"
            >
              <Download size={13} /> Export CSV
            </button>

            {/* Manage & Delete Records Button (Protected) */}
            <button
              onClick={() => {
                const isAuth = sessionStorage.getItem('eies_auth_unlocked') === 'true';
                setDeleteAuthorized(isAuth);
                setDeletePasswordInput('');
                setDeletePasswordError('');
                setShowDeleteModal(true);
                setDeleteStatus({ loading: false, message: '' });
              }}
              className="flex items-center gap-1.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/80 px-3 py-1.5 rounded font-medium transition-colors"
              title="Delete or clear telemetry rows from meter_data.csv (Protected)"
            >
              <Trash2 size={13} />
              <span>Delete / Clear Records</span>
              {!deleteAuthorized && <Lock size={12} className="text-amber-400 ml-0.5" />}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-900/50 text-red-400 p-4 rounded-lg flex items-center gap-2">
          <AlertCircle size={20} /> {error}
        </div>
      )}

      {/* Primary KPI Metrics: kWh Energy Consumption & Financial Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Net Consumption in Selected Window */}
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Period Consumption</span>
            <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded">
              <Zap size={16} />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-white tracking-tight">
              {summary.consumedKwh.toFixed(3)}
            </span>
            <span className="text-emerald-400 text-sm font-semibold">kWh</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
            <span>Integrated Active Power</span>
            <span className="text-emerald-400 font-mono flex items-center gap-0.5">
              <ArrowUpRight size={12} /> {(summary.consumedKwh * 1000).toFixed(0)} Wh
            </span>
          </div>
        </div>

        {/* Card 2: Cumulative Energy Total */}
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg relative overflow-hidden group hover:border-cyan-500/50 transition-colors">
          <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500"></div>
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Cumulative Active Energy</span>
            <span className="p-1.5 bg-cyan-500/10 text-cyan-400 rounded">
              <TrendingUp size={16} />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-white tracking-tight">
              {summary.endKwh.toFixed(2)}
            </span>
            <span className="text-cyan-400 text-sm font-semibold">kWh</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
            <span>Calculated Sum (∫ P dt)</span>
            <span className="text-slate-300 font-mono">Start: {summary.startKwh.toFixed(2)}</span>
          </div>
        </div>

        {/* Card 3: Peak Demand & Avg Power */}
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg relative overflow-hidden group hover:border-amber-500/50 transition-colors">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Peak Power Demand</span>
            <span className="p-1.5 bg-amber-500/10 text-amber-400 rounded">
              <Flame size={16} />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-white tracking-tight">
              {(summary.peakPowerW / 1000).toFixed(2)}
            </span>
            <span className="text-amber-400 text-sm font-semibold">kW</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
            <span>Avg: {(summary.avgPowerW / 1000).toFixed(2)} kW</span>
            <span className="text-amber-400/80 font-mono text-[11px] truncate max-w-[110px]" title={summary.peakTime}>
              {summary.peakTime ? summary.peakTime.slice(11, 16) : '--:--'}
            </span>
          </div>
        </div>

        {/* Card 4: Estimated Cost in Philippine Pesos (₱) */}
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg relative overflow-hidden group hover:border-indigo-500/50 transition-colors">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Est. Energy Cost</span>
            <span className="p-1 px-2 bg-indigo-500/10 text-indigo-400 rounded font-bold font-mono text-xs">
              PHP (₱)
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold text-emerald-400 tracking-tight">
              ₱{summary.totalCost.toFixed(2)}
            </span>
            <span className="text-slate-400 text-xs font-normal">at ₱{costPerKwh.toFixed(2)}/kWh</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1 text-slate-400">
              <Leaf size={12} className="text-emerald-400" /> CO₂ footprint:
            </span>
            <span className="text-slate-300 font-mono">{summary.carbonKg.toFixed(1)} kg</span>
          </div>
        </div>

      </div>

      {/* 3-Phase Balance & System Health Banner */}
      {data.length > 0 && (
        <div className="bg-slate-900/60 px-5 py-3 rounded-xl border border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 uppercase font-semibold">Records Analyzed:</span>
            <span className="text-white font-mono font-bold">{data.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 uppercase font-semibold">3-Phase Voltage:</span>
            <span className="text-blue-400 font-mono font-bold">
              L1: {data[data.length - 1].v1.toFixed(1)}V | L2: {data[data.length - 1].v2.toFixed(1)}V | L3: {data[data.length - 1].v3.toFixed(1)}V
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 uppercase font-semibold">Total Current:</span>
            <span className="text-amber-400 font-mono font-bold">{data[data.length - 1].iTotal.toFixed(2)} A</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 uppercase font-semibold">Power Factor:</span>
            <span className="text-emerald-400 font-mono font-bold">{summary.avgPf.toFixed(3)}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {summary.avgPf >= 0.9 ? 'Optimal' : 'Low PF'}
            </span>
          </div>
        </div>
      )}

      {/* Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveSubTab('charts')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeSubTab === 'charts'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                : 'text-slate-400 hover:text-white hover:bg-slate-850'
            }`}
          >
            <BarChart3 size={15} /> Energy & 3-Phase Power Charts
          </button>
          <button
            onClick={() => setActiveSubTab('intervals')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeSubTab === 'intervals'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                : 'text-slate-400 hover:text-white hover:bg-slate-850'
            }`}
          >
            <Layers size={15} /> Periodic kWh Consumption Breakdown
          </button>
          <button
            onClick={() => setActiveSubTab('table')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeSubTab === 'table'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                : 'text-slate-400 hover:text-white hover:bg-slate-850'
            }`}
          >
            <Calendar size={15} /> 3-Phase Log Table
          </button>
        </div>

        <span className="text-xs text-slate-500 hidden sm:inline font-mono">
          read_meter.py stream &bull; Function 04H
        </span>
      </div>

      {/* Content Area */}
      {data.length > 0 ? (
        <div>
          {/* TAB 1: Main Charts */}
          {activeSubTab === 'charts' && (
            <div className="space-y-6">
              
              {/* Chart 1: Cumulative Active Energy Growth (kWh) */}
              <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-slate-200 text-sm font-semibold flex items-center gap-2">
                      <Zap size={16} className="text-emerald-400" />
                      Cumulative Active Energy Growth (kWh)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Calculated continuous energy progression integrated from Total Active Power (W)
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400">Total in view:</span>
                    <span className="ml-1 text-sm font-mono font-bold text-emerald-400">
                      +{summary.consumedKwh.toFixed(3)} kWh
                    </span>
                  </div>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                      <defs>
                        <linearGradient id="colorKwh" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        dataKey="displayTime"
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        minTickGap={45}
                        stroke="#475569"
                      />
                      <YAxis
                        domain={['auto', 'auto']}
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        stroke="#475569"
                        unit=" kWh"
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }}
                        formatter={(val: any) => [`${parseFloat(val).toFixed(3)} kWh`, 'Active Energy']}
                      />
                      <Area
                        type="monotone"
                        dataKey="cumulativeKwh"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#colorKwh)"
                        isAnimationActive={false}
                        name="Active Energy (kWh)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Periodic kWh Interval Bars */}
              <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-slate-200 text-sm font-semibold flex items-center gap-2">
                      <BarChart3 size={16} className="text-cyan-400" />
                      Periodic Energy Consumption Histogram (Δ kWh per window)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Pinpoint high-usage time intervals to optimize load and tariff efficiency
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {intervalBuckets.length} Time Bins
                  </span>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={intervalBuckets}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        dataKey="periodLabel"
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        stroke="#475569"
                      />
                      <YAxis
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        stroke="#475569"
                        unit=" kWh"
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }}
                        formatter={(val: any, name: string) => {
                          if (name === 'cost') return [`₱${parseFloat(val).toFixed(2)}`, 'Cost (PHP)'];
                          return [`${parseFloat(val).toFixed(3)} kWh`, 'Consumption'];
                        }}
                      />
                      <Bar dataKey="deltaKwh" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Consumption (kWh)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 3 & 4: Power Demand & 3-Phase Voltages */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Active Power & Apparent Power */}
                <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg">
                  <h3 className="text-slate-200 text-sm font-semibold mb-1 flex items-center gap-2">
                    <Activity size={16} className="text-emerald-400" />
                    Total Real Power (W) vs Apparent Power (VA)
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Total Active Power and Total Apparent Power trends
                  </p>
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey="displayTime"
                          tick={{ fill: '#94a3b8', fontSize: 10 }}
                          minTickGap={30}
                          stroke="#475569"
                        />
                        <YAxis
                          domain={['auto', 'auto']}
                          tick={{ fill: '#94a3b8', fontSize: 10 }}
                          stroke="#475569"
                        />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line
                          type="monotone"
                          dataKey="totalActiveW"
                          stroke="#10b981"
                          dot={false}
                          strokeWidth={2}
                          isAnimationActive={false}
                          name="Total Active (W)"
                        />
                        <Line
                          type="monotone"
                          dataKey="totalApparentVA"
                          stroke="#8b5cf6"
                          dot={false}
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          isAnimationActive={false}
                          name="Total Apparent (VA)"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 3-Phase Voltages (L1, L2, L3) */}
                <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 shadow-lg">
                  <h3 className="text-slate-200 text-sm font-semibold mb-1 flex items-center gap-2">
                    <Zap size={16} className="text-blue-400" />
                    3-Phase Line Voltages (L1, L2, L3)
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Phase-to-neutral voltages across all 3 phases
                  </p>
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis
                          dataKey="displayTime"
                          tick={{ fill: '#94a3b8', fontSize: 10 }}
                          minTickGap={30}
                          stroke="#475569"
                        />
                        <YAxis
                          domain={['auto', 'auto']}
                          tick={{ fill: '#94a3b8', fontSize: 10 }}
                          stroke="#475569"
                          unit="V"
                        />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="v1" stroke="#3b82f6" dot={false} strokeWidth={1.5} isAnimationActive={false} name="Phase 1 (V)" />
                        <Line type="monotone" dataKey="v2" stroke="#60a5fa" dot={false} strokeWidth={1.5} isAnimationActive={false} name="Phase 2 (V)" />
                        <Line type="monotone" dataKey="v3" stroke="#93c5fd" dot={false} strokeWidth={1.5} isAnimationActive={false} name="Phase 3 (V)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 2: Interval Breakdown Table */}
          {activeSubTab === 'intervals' && (
            <div className="bg-slate-900/90 rounded-xl overflow-hidden border border-slate-800 shadow-xl">
              <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/60">
                <div>
                  <h3 className="text-white text-sm font-semibold">Periodic Consumption Breakdown</h3>
                  <p className="text-xs text-slate-400">Integrated power energy slices with demand and cost in Philippine Pesos</p>
                </div>
                <span className="text-xs text-emerald-400 font-mono bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                  Total Window: {summary.consumedKwh.toFixed(3)} kWh
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-medium text-[11px]">
                    <tr>
                      <th className="px-6 py-3">Time Window</th>
                      <th className="px-6 py-3">Start kWh</th>
                      <th className="px-6 py-3">End kWh</th>
                      <th className="px-6 py-3 text-right text-emerald-400">Consumed (Δ kWh)</th>
                      <th className="px-6 py-3 text-right">Avg Power (W)</th>
                      <th className="px-6 py-3 text-right text-amber-400">Peak Demand (W)</th>
                      <th className="px-6 py-3 text-right">Est. Cost (₱)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {intervalBuckets.map((bucket, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-6 py-3 text-slate-300 font-sans flex items-center gap-1.5">
                          <Clock size={12} className="text-slate-500" />
                          {bucket.timestamp}
                        </td>
                        <td className="px-6 py-3 text-slate-400">{bucket.startKwh.toFixed(3)}</td>
                        <td className="px-6 py-3 text-slate-400">{bucket.endKwh.toFixed(3)}</td>
                        <td className="px-6 py-3 text-right text-emerald-400 font-bold">
                          +{bucket.deltaKwh.toFixed(3)}
                        </td>
                        <td className="px-6 py-3 text-right">{bucket.avgPowerW.toFixed(1)}</td>
                        <td className="px-6 py-3 text-right text-amber-400">{bucket.peakPowerW.toFixed(1)}</td>
                        <td className="px-6 py-3 text-right text-slate-200">₱{bucket.cost.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: Raw 3-Phase Log Table */}
          {activeSubTab === 'table' && (
            <div className="bg-slate-900/90 rounded-xl overflow-hidden border border-slate-800 shadow-xl">
              <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/60">
                <h3 className="text-white text-sm font-semibold">3-Phase Telemetry Stream (Last 100 entries)</h3>
                <span className="text-xs text-slate-400 font-mono">{data.length} total points</span>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left text-xs text-slate-400">
                  <thead className="bg-slate-950 text-slate-300 uppercase font-medium text-[11px] sticky top-0">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3 text-emerald-400">Total Active (W)</th>
                      <th className="px-4 py-3 text-cyan-400">Computed kWh</th>
                      <th className="px-4 py-3 text-blue-300">V1 / V2 / V3 (V)</th>
                      <th className="px-4 py-3 text-amber-300">I1 / I2 / I3 (A)</th>
                      <th className="px-4 py-3">P1 / P2 / P3 (W)</th>
                      <th className="px-4 py-3">PF</th>
                      <th className="px-4 py-3">Freq</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {data.slice().reverse().slice(0, 100).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-2.5 text-slate-300 font-sans">{row.fullTimestamp}</td>
                        <td className="px-4 py-2.5 text-emerald-400 font-bold">{row.totalActiveW.toFixed(1)}</td>
                        <td className="px-4 py-2.5 text-cyan-400 font-bold">{row.cumulativeKwh.toFixed(3)}</td>
                        <td className="px-4 py-2.5 text-blue-300">{row.v1.toFixed(1)} / {row.v2.toFixed(1)} / {row.v3.toFixed(1)}</td>
                        <td className="px-4 py-2.5 text-amber-300">{row.i1.toFixed(2)} / {row.i2.toFixed(2)} / {row.i3.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-slate-200">{row.p1.toFixed(0)} / {row.p2.toFixed(0)} / {row.p3.toFixed(0)}</td>
                        <td className="px-4 py-2.5">{row.powerFactor.toFixed(3)}</td>
                        <td className="px-4 py-2.5">{row.frequency.toFixed(2)} Hz</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 bg-slate-900/50 rounded-xl border border-slate-800 border-dashed">
          <Filter className="text-slate-600 mb-2" size={40} />
          <p className="text-slate-300 font-medium">No Modbus data found in the selected time range.</p>
          <p className="text-xs text-slate-500 mt-1">
            Try adjusting the From/To dates, click "24h" or "All", or start read_meter.py.
          </p>
        </div>
      )}

      {/* Delete / Clear Records Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-rose-400 font-bold text-base">
                <Trash2 size={20} />
                <span>Manage & Delete Meter Records</span>
              </div>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body: Password Challenge or Authorized Cleanup Actions */}
            {!deleteAuthorized ? (
              <form onSubmit={handleVerifyDeletePassword} className="space-y-4 py-2">
                <div className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                    <ShieldCheck size={18} />
                    <span>Authentication Required to Clear / Delete Records</span>
                  </div>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    Clearing or trimming records in <code className="bg-slate-950 text-emerald-400 px-1.5 py-0.5 rounded font-mono">meter_data.csv</code> permanently modifies the telemetry database. Please enter the engineer password to continue.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>Engineer Password</span>
                    <span className="text-[10px] text-slate-500 font-mono">Hashed SHA-256</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showDeletePasswordText ? "text" : "password"}
                      value={deletePasswordInput}
                      onChange={(e) => {
                        setDeletePasswordInput(e.target.value);
                        if (deletePasswordError) setDeletePasswordError('');
                      }}
                      placeholder="Enter password..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 pr-10 text-white font-mono text-xs focus:border-rose-500 focus:outline-none transition-colors"
                      autoFocus
                      disabled={isVerifyingDelete}
                    />
                    <button
                      type="button"
                      onClick={() => setShowDeletePasswordText(!showDeletePasswordText)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                      tabIndex={-1}
                    >
                      {showDeletePasswordText ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {deletePasswordError && (
                    <div className="flex items-center gap-1.5 text-xs text-rose-400 mt-1.5 bg-rose-950/40 p-2 rounded-lg border border-rose-900/50">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{deletePasswordError}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isVerifyingDelete}
                    className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-rose-950 transition-all flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {isVerifyingDelete ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound size={13} />
                        <span>Verify & Unlock Deletion</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-xs text-slate-300">
                <div className="flex items-center justify-between bg-emerald-950/30 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs text-emerald-400">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Check size={14} />
                    <span>Engineer Session Authorized</span>
                  </span>
                  <button
                    onClick={() => {
                      setDeleteAuthorized(false);
                      try { sessionStorage.removeItem('eies_auth_unlocked'); } catch {}
                    }}
                    className="text-[11px] text-slate-400 hover:text-rose-300 flex items-center gap-1 font-mono hover:underline"
                    title="Lock deletion controls"
                  >
                    <Lock size={11} />
                    <span>Lock Session</span>
                  </button>
                </div>

                <p className="text-slate-400">
                  You can delete old history rows from <code className="text-white font-mono bg-slate-950 px-1 py-0.5 rounded">meter_data.csv</code>, or reset the starting cumulative kWh offset.
                </p>

                {/* Status Message */}
                {deleteStatus.message && (
                  <div className={`p-3 rounded-lg flex items-center gap-2 text-xs ${
                    deleteStatus.isError ? 'bg-rose-950/40 text-rose-300 border border-rose-900' : 'bg-emerald-950/40 text-emerald-300 border border-emerald-900'
                  }`}>
                    {deleteStatus.isError ? <AlertTriangle size={15} /> : <Check size={15} />}
                    <span>{deleteStatus.message}</span>
                  </div>
                )}

                {/* Quick Actions */}
                <div className="space-y-2 pt-1">
                  <div className="font-semibold text-slate-200 uppercase text-[11px] tracking-wider">
                    Data Cleanup Options:
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      onClick={() => handleDeleteRecords('older_24h')}
                      disabled={deleteStatus.loading}
                      className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition-colors flex flex-col justify-between"
                    >
                      <span className="font-medium text-slate-200">Delete &gt; 24h Old</span>
                      <span className="text-[11px] text-slate-500 mt-1">Keep only last 24 hours of data</span>
                    </button>

                    <button
                      onClick={() => handleDeleteRecords('older_7d')}
                      disabled={deleteStatus.loading}
                      className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition-colors flex flex-col justify-between"
                    >
                      <span className="font-medium text-slate-200">Delete &gt; 7 Days Old</span>
                      <span className="text-[11px] text-slate-500 mt-1">Keep only the last 7 days</span>
                    </button>

                    <button
                      onClick={() => handleDeleteRecords('keep_50')}
                      disabled={deleteStatus.loading}
                      className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition-colors flex flex-col justify-between"
                    >
                      <span className="font-medium text-slate-200">Keep Latest 50 Records</span>
                      <span className="text-[11px] text-slate-500 mt-1">Trim file to only 50 rows</span>
                    </button>

                    <button
                      onClick={() => {
                        if (window.confirm('Are you sure you want to clear ALL historical records from meter_data.csv?')) {
                          handleDeleteRecords('all');
                        }
                      }}
                      disabled={deleteStatus.loading}
                      className="p-3 bg-rose-950/30 hover:bg-rose-900/50 border border-rose-900/60 rounded-xl text-left transition-colors flex flex-col justify-between"
                    >
                      <span className="font-bold text-rose-300">Clear All Records (0 Rows)</span>
                      <span className="text-[11px] text-rose-400/80 mt-1">Reset file & start completely fresh</span>
                    </button>
                  </div>
                </div>

                {/* Set Starting Cumulative kWh */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-200 text-xs">Initial Cumulative kWh Offset:</span>
                    <span className="text-[11px] text-slate-500 font-mono">Current: {initialKwhOffset.toFixed(2)} kWh</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={initialKwhOffset}
                      id="offsetInput"
                      placeholder="e.g. 0.00"
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-xs focus:border-emerald-500 outline-none"
                    />
                    <button
                      onClick={() => {
                        const input = document.getElementById('offsetInput') as HTMLInputElement;
                        const val = parseFloat(input?.value || '0');
                        handleSaveInitialOffset(isNaN(val) ? 0 : val);
                        setDeleteStatus({ loading: false, message: `Initial offset set to ${val.toFixed(2)} kWh` });
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold text-xs transition-colors"
                    >
                      Apply Offset
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Set to 0.00 to start cumulative kWh from zero, or set to match your meter's LCD display.
                  </p>
                </div>

                {/* Ubuntu Bash Command Reference */}
                <div className="pt-3 border-t border-slate-800 space-y-1.5">
                  <span className="font-semibold text-slate-300 text-[11px] flex items-center gap-1.5">
                    <Terminal size={13} className="text-emerald-400" />
                    Or via Ubuntu Terminal:
                  </span>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-300 select-all overflow-x-auto">
                    sed -i '2,$d' meter_data.csv
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Clears all data lines while preserving the CSV headers.
                  </p>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-800">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
};

export default TimelineView;
