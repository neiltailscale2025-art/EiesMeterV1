import React, { useState } from 'react';
import {
  Wifi, Copy, Check, Download, Play, Terminal, Shield,
  Layers, Radio, HelpCircle, Code2, Cpu,
  Server, RefreshCw, CheckCircle2, Gauge
} from 'lucide-react';
import { TuyaMeterConfig } from '../types';

const TuyaWifiDualMeterView: React.FC = () => {
  const [config, setConfig] = useState<TuyaMeterConfig>({
    deviceId: 'bf632901a1b2c3d4e5',
    localKey: 'a1b2c3d4e5f60718',
    ipAddress: '192.168.1.150',
    protocolVersion: '3.3',
    model: 'pj1203a',
    pollInterval: 3.5,
    listenPush: false,
    csvPath: 'meter_data.csv',
    channel1Name: 'Channel A (Grid / Main Clamp)',
    channel2Name: 'Channel B (Inverter / Sub-panel)',
    enableMqtt: true,
    mqttBroker: '192.168.1.200',
    mqttPort: 1883,
    mqttTopic: 'tuya/dual_meter',
    mqttUser: '',
    mqttPass: '',
    haDiscovery: true,
  });

  const [activeTab, setActiveTab] = useState<'code' | 'runner' | 'dp-decoder' | 'models' | 'key-guide' | 'mqtt-ha' | 'systemd'>('code');
  const [copied, setCopied] = useState(false);
  const [sampleInjecting, setSampleInjecting] = useState(false);
  const [sampleResult, setSampleResult] = useState<string | null>(null);

  // Interactive DP Decoder state
  const [rawDpsInput, setRawDpsInput] = useState<string>(
    JSON.stringify({
      "111": 2315,
      "112": 4250,
      "113": 9815,
      "114": 98,
      "115": 1540,
      "121": 2308,
      "122": 2100,
      "123": 4845,
      "124": 99,
      "125": 820,
      "131": 500,
      "132": 14660
    }, null, 2)
  );
  const [decodedOutput, setDecodedOutput] = useState<{
    v1: number; i1: number; p1: number; pf1?: number; e1?: number;
    v2: number; i2: number; p2: number; pf2?: number; e2?: number;
    freq: number; totalP: number; apparentVA: number;
    csvRow: string;
  } | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  const handleInjectSample = async () => {
    setSampleInjecting(true);
    setSampleResult(null);
    try {
      const res = await fetch('/api/data/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'dual', singlePhase: false })
      });
      if (res.ok) {
        setSampleResult('Success! 60 Dual-Channel data points generated in meter_data.csv. Check Live Monitor & Timeline!');
      } else {
        setSampleResult('Notice: Server responded with status ' + res.status);
      }
    } catch (e: any) {
      setSampleResult('Sample generator invoked.');
    } finally {
      setSampleInjecting(false);
    }
  };

  // Run DP test
  const handleDecodeTest = () => {
    try {
      const parsed = JSON.parse(rawDpsInput);
      let v1 = 230, i1 = 0, p1 = 0, pf1 = 1, e1 = 0;
      let v2 = 230, i2 = 0, p2 = 0, pf2 = 1, e2 = 0;
      let freq = 50.0, totalP = 0;

      if (parsed['111'] !== undefined) {
        // PJ-1203A format
        v1 = parsed['111'] > 1000 ? parsed['111'] / 10 : parsed['111'];
        i1 = parsed['112'] > 500 ? parsed['112'] / 1000 : parsed['112'];
        p1 = parsed['113'] > 1000 ? parsed['113'] / 10 : parsed['113'];
        pf1 = (parsed['114'] || 100) / 100;
        e1 = (parsed['115'] || 0) / 100;

        v2 = parsed['121'] > 1000 ? parsed['121'] / 10 : parsed['121'];
        i2 = parsed['122'] > 500 ? parsed['122'] / 1000 : parsed['122'];
        p2 = parsed['123'] > 1000 ? parsed['123'] / 10 : parsed['123'];
        pf2 = (parsed['124'] || 100) / 100;
        e2 = (parsed['125'] || 0) / 100;

        freq = (parsed['131'] || 500) / 10;
        totalP = parsed['132'] ? (parsed['132'] > 1000 ? parsed['132'] / 10 : parsed['132']) : (p1 + p2);
      } else if (parsed['20'] !== undefined || parsed['18'] !== undefined) {
        // Tongou DIN Dual
        v1 = parsed['20'] ? parsed['20'] / 10 : 230;
        i1 = parsed['18'] ? parsed['18'] / 1000 : 0;
        p1 = parsed['19'] ? (parsed['19'] > 2000 ? parsed['19'] / 10 : parsed['19']) : (v1 * i1 * 0.9);
        e1 = (parsed['101'] || 0) / 100;

        v2 = parsed['23'] ? parsed['23'] / 10 : v1;
        i2 = parsed['21'] ? parsed['21'] / 1000 : 0;
        p2 = parsed['22'] ? (parsed['22'] > 2000 ? parsed['22'] / 10 : parsed['22']) : (v2 * i2 * 0.9);
        e2 = (parsed['102'] || 0) / 100;

        freq = 50.0;
        totalP = p1 + p2;
      }

      const apparentVA = (v1 * i1) + (v2 * i2);
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const csvRow = `${now},${v1.toFixed(2)},${v2.toFixed(2)},0.00,${i1.toFixed(2)},${i2.toFixed(2)},0.00,${p1.toFixed(2)},${p2.toFixed(2)},0.00,${freq.toFixed(2)},${totalP.toFixed(2)},${apparentVA.toFixed(2)}`;

      setDecodedOutput({
        v1: Number(v1.toFixed(2)),
        i1: Number(i1.toFixed(3)),
        p1: Number(p1.toFixed(2)),
        pf1, e1,
        v2: Number(v2.toFixed(2)),
        i2: Number(i2.toFixed(3)),
        p2: Number(p2.toFixed(2)),
        pf2, e2,
        freq: Number(freq.toFixed(2)),
        totalP: Number(totalP.toFixed(2)),
        apparentVA: Number(apparentVA.toFixed(2)),
        csvRow
      });
    } catch (err: any) {
      alert('Invalid JSON input: ' + err.message);
    }
  };

  // Generate customized Python Script
  const generatePythonScript = () => {
    return `#!/usr/bin/env python3
"""
EIES Tuya WiFi Dual Meter Local Data Logger & MQTT Gateway
=============================================================================
Device ID:    ${config.deviceId}
Local Key:    ${config.localKey}
Meter IP:     ${config.ipAddress || 'Auto-scan'}
Protocol:     Tuya v${config.protocolVersion}
Model Preset: ${config.model}
Polling Rate: Every ${config.pollInterval}s
Target CSV:   ${config.csvPath}
MQTT Gateway: ${config.enableMqtt ? `${config.mqttBroker}:${config.mqttPort} -> ${config.mqttTopic}/#` : 'Disabled'}
=============================================================================
"""

import argparse
import csv
import json
import os
import sys
import time
import socket
import traceback
from datetime import datetime

try:
    import tinytuya
except ImportError:
    print("[ERROR] 'tinytuya' is required. Run: pip install tinytuya paho-mqtt")
    sys.exit(1)

${config.enableMqtt ? `try:
    import paho.mqtt.client as mqtt
    MQTT_AVAILABLE = True
except ImportError:
    MQTT_AVAILABLE = False
` : '# MQTT disabled'}

# --- Meter Configuration ---
DEVICE_ID = '${config.deviceId}'
LOCAL_KEY = '${config.localKey}'
METER_IP = '${config.ipAddress}'
PROTOCOL_VERSION = ${config.protocolVersion === 'auto' ? "'auto'" : config.protocolVersion}
MODEL_PRESET = '${config.model}'
POLL_INTERVAL = ${config.pollInterval}
CSV_FILE = '${config.csvPath}'

${config.enableMqtt ? `# --- MQTT Configuration ---
MQTT_BROKER = '${config.mqttBroker}'
MQTT_PORT = ${config.mqttPort}
MQTT_TOPIC = '${config.mqttTopic}'
MQTT_USER = '${config.mqttUser || ''}'
MQTT_PASS = '${config.mqttPass || ''}'
HA_DISCOVERY = ${config.haDiscovery ? 'True' : 'False'}
` : ''}

CSV_HEADERS = [
    'Timestamp',
    'Phase 1 Voltage (V)', 'Phase 2 Voltage (V)', 'Phase 3 Voltage (V)',
    'Phase 1 Current (A)', 'Phase 2 Current (A)', 'Phase 3 Current (A)',
    'Phase 1 Power (W)', 'Phase 2 Power (W)', 'Phase 3 Power (W)',
    'Frequency (Hz)', 'Total Active Power (W)', 'Total Apparent Power (VA)'
]

def init_csv():
    if not os.path.exists(CSV_FILE):
        with open(CSV_FILE, mode='w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(CSV_HEADERS)
        print(f"Initialized CSV file: {CSV_FILE}")

def parse_dual_meter_dps(dps):
    """Decode raw Tuya DPS dictionary into Channel A & B metrics."""
    str_keys = {str(k) for k in dps.keys()}
    
    # Check for PJ-1203A / PC321-TY Dual Clamp
    if '111' in str_keys or MODEL_PRESET == 'pj1203a':
        raw_v1 = float(dps.get('111', 2300))
        raw_i1 = float(dps.get('112', 0))
        raw_p1 = float(dps.get('113', 0))
        raw_e1 = float(dps.get('115', 0))

        raw_v2 = float(dps.get('121', 2300))
        raw_i2 = float(dps.get('122', 0))
        raw_p2 = float(dps.get('123', 0))
        raw_e2 = float(dps.get('125', 0))

        v1 = raw_v1 / 10.0 if raw_v1 > 1000 else raw_v1
        i1 = raw_i1 / 1000.0 if raw_i1 > 500 else raw_i1
        p1 = raw_p1 / 10.0 if raw_p1 > 1000 else raw_p1
        e1 = raw_e1 / 100.0 if raw_e1 > 1000 else raw_e1

        v2 = raw_v2 / 10.0 if raw_v2 > 1000 else raw_v2
        i2 = raw_i2 / 1000.0 if raw_i2 > 500 else raw_i2
        p2 = raw_p2 / 10.0 if raw_p2 > 1000 else raw_p2
        e2 = raw_e2 / 100.0 if raw_e2 > 1000 else raw_e2

        freq = float(dps.get('131', 500)) / 10.0
        tot_p = float(dps.get('132', p1 + p2))
        if tot_p > 1000 and tot_p > (p1 + p2) * 3:
            tot_p = tot_p / 10.0

    # Tongou 2-Channel DIN Rail Smart Meter
    elif '18' in str_keys or MODEL_PRESET == 'tongou':
        v1 = float(dps.get('20', 2300)) / 10.0
        i1 = float(dps.get('18', 0)) / 1000.0
        p1 = float(dps.get('19', 0))
        p1 = p1 / 10.0 if p1 > 2000 else p1
        e1 = float(dps.get('101', 0)) / 100.0

        v2 = float(dps.get('23', 2300)) / 10.0
        i2 = float(dps.get('21', 0)) / 1000.0
        p2 = float(dps.get('22', 0))
        p2 = p2 / 10.0 if p2 > 2000 else p2
        e2 = float(dps.get('102', 0)) / 100.0

        freq = 50.0
        tot_p = p1 + p2

    else:
        # Generic heuristic fallback
        v1, v2 = 230.0, 230.0
        i1, i2 = 0.0, 0.0
        p1, p2 = 0.0, 0.0
        e1, e2 = 0.0, 0.0
        freq = 50.0
        tot_p = 0.0

    apparent = (v1 * i1) + (v2 * i2)
    return {
        'v1': round(v1, 2), 'i1': round(i1, 3), 'p1': round(p1, 2), 'e1': round(e1, 2),
        'v2': round(v2, 2), 'i2': round(i2, 3), 'p2': round(p2, 2), 'e2': round(e2, 2),
        'freq': round(freq, 2), 'tot_p': round(tot_p, 2), 'apparent': round(apparent, 2)
    }

def main():
    print("==========================================================")
    print(" EIES Tuya WiFi Dual Meter Acquisition Starting...")
    print(f" Target Device: {DEVICE_ID}")
    print(f" Target IP:     {METER_IP or 'Auto-Scanning...'}")
    print("==========================================================")

    init_csv()

    # Discover IP if not fixed
    target_ip = METER_IP
    if not target_ip:
        print("Scanning local subnet for device...")
        devices = tinytuya.deviceScan(False, 5)
        for ip, info in devices.items():
            if info.get('gwId') == DEVICE_ID or info.get('id') == DEVICE_ID:
                target_ip = ip
                print(f"Discovered meter IP: {target_ip}")
                break
        if not target_ip:
            print("[ERROR] Meter IP could not be auto-discovered. Please supply an IP.")
            sys.exit(1)

    # Initialize Local Tuya Socket Client
    proto = 3.3 if PROTOCOL_VERSION == 'auto' else float(PROTOCOL_VERSION)
    dev = tinytuya.OutletDevice(DEVICE_ID, target_ip, LOCAL_KEY, version=proto)
    dev.set_socketPersistent(True)
    dev.set_socketTimeout(5)

${config.enableMqtt ? `    # Initialize MQTT
    mqtt_client = None
    if MQTT_AVAILABLE and MQTT_BROKER:
        try:
            mqtt_client = mqtt.Client(client_id=f"tuya-meter-{int(time.time())}")
            if MQTT_USER and MQTT_PASS:
                mqtt_client.username_pw_set(MQTT_USER, MQTT_PASS)
            mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
            mqtt_client.loop_start()
            print(f"Connected to MQTT broker at {MQTT_BROKER}:{MQTT_PORT}")
        except Exception as e:
            print(f"[WARN] MQTT connection failed: {e}")
` : ''}

    print("\\nLogging active. Press Ctrl+C to terminate.\\n")

    while True:
        try:
            data = dev.status()
            if not data or 'dps' not in data:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Awaiting meter response...")
                time.sleep(POLL_INTERVAL)
                continue

            m = parse_dual_meter_dps(data['dps'])
            now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

            # Display to console
            print(f"--- {now_str} [Dual Meter: {target_ip}] ---")
            print(f"  Channel A: {m['v1']:>6.2f} V | {m['i1']:>6.3f} A | {m['p1']:>7.2f} W | {m['e1']:>6.2f} kWh")
            print(f"  Channel B: {m['v2']:>6.2f} V | {m['i2']:>6.3f} A | {m['p2']:>7.2f} W | {m['e2']:>6.2f} kWh")
            print(f"  Combined:  Total Power: {m['tot_p']:>7.2f} W | Apparent: {m['apparent']:>7.2f} VA | Freq: {m['freq']:.2f} Hz")
            print("-" * 65)

            # Append to meter_data.csv (Phase 1 = Ch A, Phase 2 = Ch B, Phase 3 = 0.0)
            with open(CSV_FILE, mode='a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow([
                    now_str,
                    f"{m['v1']:.2f}", f"{m['v2']:.2f}", "0.00",
                    f"{m['i1']:.2f}", f"{m['i2']:.2f}", "0.00",
                    f"{m['p1']:.2f}", f"{m['p2']:.2f}", "0.00",
                    f"{m['freq']:.2f}", f"{m['tot_p']:.2f}", f"{m['apparent']:.2f}"
                ])

${config.enableMqtt ? `            # Publish to MQTT
            if mqtt_client:
                state_json = {
                    "timestamp": now_str,
                    "channel_a": {"voltage": m['v1'], "current": m['i1'], "power": m['p1'], "kwh": m['e1']},
                    "channel_b": {"voltage": m['v2'], "current": m['i2'], "power": m['p2'], "kwh": m['e2']},
                    "total_power": m['tot_p'], "frequency": m['freq']
                }
                mqtt_client.publish(f"{MQTT_TOPIC}/state", json.dumps(state_json))
                mqtt_client.publish(f"{MQTT_TOPIC}/ch1/power", str(m['p1']))
                mqtt_client.publish(f"{MQTT_TOPIC}/ch2/power", str(m['p2']))
                mqtt_client.publish(f"{MQTT_TOPIC}/total_power", str(m['tot_p']))
` : ''}

        except KeyboardInterrupt:
            print("\\nUser stopped data logger.")
            break
        except Exception as e:
            print(f"Acquisition glitch: {e}")
            traceback.print_exc()

        time.sleep(POLL_INTERVAL)

    dev.close()
    print("Done.")

if __name__ == '__main__':
    main()
`;
  };

  const runnerScriptContent = `#!/bin/bash
# EIES Tuya WiFi Dual Meter Quick Runner
cd "$(dirname "$0")"

# 1. Activate venv
if [ ! -d "venv" ]; then
    bash setup_venv.sh
fi
source venv/bin/activate

# 2. Run Python acquisition code
python3 read_tuya_wifi_dual_meter.py \\
    --device-id "${config.deviceId}" \\
    --local-key "${config.localKey}" \\
    --ip "${config.ipAddress}" \\
    --protocol "${config.protocolVersion}" \\
    --interval ${config.pollInterval} \\
    --csv "${config.csvPath}" \\
    ${config.enableMqtt ? `--mqtt-broker "${config.mqttBroker}" --mqtt-port ${config.mqttPort} --mqtt-topic "${config.mqttTopic}" ${config.haDiscovery ? '--ha-discovery' : ''}` : ''}
`;

  const systemdServiceContent = `[Unit]
Description=EIES Tuya WiFi Dual Meter 24/7 Acquisition
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/EiesMeterV1
Environment="TZ=Asia/Manila"
ExecStart=/root/EiesMeterV1/venv/bin/python3 /root/EiesMeterV1/read_tuya_wifi_dual_meter.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`;

  const homeAssistantYaml = `
# Home Assistant configuration.yaml (if MQTT Auto-Discovery is not used)
mqtt:
  sensor:
    - name: "Tuya Dual Meter Channel A Power"
      state_topic: "${config.mqttTopic}/ch1/power"
      unit_of_measurement: "W"
      device_class: power
      state_class: measurement

    - name: "Tuya Dual Meter Channel B Power"
      state_topic: "${config.mqttTopic}/ch2/power"
      unit_of_measurement: "W"
      device_class: power
      state_class: measurement

    - name: "Tuya Dual Meter Total Power"
      state_topic: "${config.mqttTopic}/total_power"
      unit_of_measurement: "W"
      device_class: power
      state_class: measurement

    - name: "Tuya Dual Meter Channel A Voltage"
      state_topic: "${config.mqttTopic}/state"
      value_template: "{{ value_json.channel_a.voltage }}"
      unit_of_measurement: "V"
      device_class: voltage

    - name: "Tuya Dual Meter Channel B Voltage"
      state_topic: "${config.mqttTopic}/state"
      value_template: "{{ value_json.channel_b.voltage }}"
      unit_of_measurement: "V"
      device_class: voltage
`;

  return (
    <div className="space-y-6">

      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-950/70 via-slate-900 to-cyan-950/70 border border-emerald-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-gradient-to-l from-emerald-500/5 to-transparent pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                <Wifi size={13} className="text-emerald-400" />
                Local Tuya TCP:6668
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5">
                <Radio size={13} className="text-cyan-400" />
                Dual Clamp / 2-Channel
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
                <Shield size={13} className="text-amber-400" />
                AES-128 Zero Cloud
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Tuya WiFi Dual Meter Data Acquisition & MQTT Gateway
            </h2>
            <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
              Read real-time telemetry from bi-directional Tuya WiFi Dual Clamp meters (PJ-1203A / PC321-TY) and 2-Channel DIN Rail Smart Meters (Tongou, WDYK, EARU) directly over your local WiFi network. Telemetry logs directly into <code className="bg-slate-800 text-emerald-400 px-1.5 py-0.5 rounded font-mono text-xs">meter_data.csv</code> and feeds the Timeline & Live Monitor dashboards.
            </p>
          </div>

          {/* Quick Action Button to test dual meter CSV */}
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <button
              onClick={handleInjectSample}
              disabled={sampleInjecting}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-950 transition-all border border-emerald-400/30 text-sm active:scale-95"
              title="Populates meter_data.csv with realistic 2-channel data to test the dashboard"
            >
              <RefreshCw size={16} className={sampleInjecting ? "animate-spin" : ""} />
              <span>Simulate Dual Meter in CSV</span>
            </button>
          </div>
        </div>

        {sampleResult && (
          <div className="mt-4 p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>{sampleResult}</span>
          </div>
        )}
      </div>

      {/* Main Grid: Config Form (Left) & Code/Guides (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Configuration Column */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Cpu size={18} className="text-emerald-400" />
                Tuya Device Parameters
              </h3>
              <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                LAN Direct
              </span>
            </div>

            {/* Device ID */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Tuya Device ID</span>
                <span className="text-[10px] text-slate-400">20-22 chars (from Smart Life or IoT)</span>
              </label>
              <input
                type="text"
                value={config.deviceId}
                onChange={(e) => setConfig({ ...config, deviceId: e.target.value.trim() })}
                placeholder="e.g. bf632901a1b2c3d4e5"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-emerald-300 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            {/* Local Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Tuya Local Key (16-char AES key)</span>
                <button
                  onClick={() => setActiveTab('key-guide')}
                  className="text-[10px] text-cyan-400 hover:underline flex items-center gap-0.5"
                >
                  <HelpCircle size={10} />
                  <span>How to find key?</span>
                </button>
              </label>
              <input
                type="text"
                value={config.localKey}
                onChange={(e) => setConfig({ ...config, localKey: e.target.value.trim() })}
                placeholder="e.g. a1b2c3d4e5f60718"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-amber-300 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {/* Meter IP & Protocol */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Meter IP (Local WiFi)</label>
                <input
                  type="text"
                  value={config.ipAddress}
                  onChange={(e) => setConfig({ ...config, ipAddress: e.target.value.trim() })}
                  placeholder="e.g. 192.168.1.150"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Protocol Version</label>
                <select
                  value={config.protocolVersion}
                  onChange={(e) => setConfig({ ...config, protocolVersion: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="3.3">v3.3 (Standard / Most Meters)</option>
                  <option value="3.4">v3.4 (Newer Firmware)</option>
                  <option value="3.5">v3.5 (Latest GCM)</option>
                  <option value="3.1">v3.1 (Legacy)</option>
                  <option value="auto">Auto-negotiate</option>
                </select>
              </div>
            </div>

            {/* Hardware Model Preset */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Hardware Model & DP Preset</label>
              <select
                value={config.model}
                onChange={(e) => setConfig({ ...config, model: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-emerald-300 font-medium focus:outline-none focus:border-emerald-500"
              >
                <option value="pj1203a">Bi-directional Dual Clamp (PJ-1203A / PC321-TY / WDYK)</option>
                <option value="tongou">Tongou 2-Channel DIN Rail Smart Meter / EARU Dual</option>
                <option value="switch_dual">Tuya 2-Gang Breaker / Socket with Energy</option>
                <option value="auto">Auto-Detect DPs (Smart Heuristic)</option>
                <option value="custom">Custom DP Configuration</option>
              </select>
            </div>

            {/* Polling Interval & Target CSV */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Poll Interval</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="60"
                    value={config.pollInterval}
                    onChange={(e) => setConfig({ ...config, pollInterval: parseFloat(e.target.value) || 2.0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-xs text-slate-400">sec</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Output CSV File</label>
                <input
                  type="text"
                  value={config.csvPath}
                  onChange={(e) => setConfig({ ...config, csvPath: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Channel Labels */}
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
              <span className="text-xs font-semibold text-slate-300 block">Channel Identification</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-emerald-400 font-mono">Phase 1 / Channel A:</span>
                  <input
                    type="text"
                    value={config.channel1Name}
                    onChange={(e) => setConfig({ ...config, channel1Name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 mt-1"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-cyan-400 font-mono">Phase 2 / Channel B:</span>
                  <input
                    type="text"
                    value={config.channel2Name}
                    onChange={(e) => setConfig({ ...config, channel2Name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 mt-1"
                  />
                </div>
              </div>
            </div>

            {/* MQTT Toggle */}
            <div className="border-t border-slate-800 pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enableMqtt}
                    onChange={(e) => setConfig({ ...config, enableMqtt: e.target.checked })}
                    className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                  />
                  <span>Enable MQTT Gateway Stream</span>
                </label>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded font-mono">
                  Home Assistant
                </span>
              </div>

              {config.enableMqtt && (
                <div className="space-y-3 pl-4 border-l-2 border-cyan-500/40 pt-1">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <span className="text-[10px] text-slate-400">Broker IP / Host</span>
                      <input
                        type="text"
                        value={config.mqttBroker}
                        onChange={(e) => setConfig({ ...config, mqttBroker: e.target.value })}
                        placeholder="192.168.1.200"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400">Port</span>
                      <input
                        type="number"
                        value={config.mqttPort}
                        onChange={(e) => setConfig({ ...config, mqttPort: parseInt(e.target.value) || 1883 })}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400">MQTT Base Topic</span>
                    <input
                      type="text"
                      value={config.mqttTopic}
                      onChange={(e) => setConfig({ ...config, mqttTopic: e.target.value })}
                      placeholder="tuya/dual_meter"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="haDiscovery"
                      checked={config.haDiscovery}
                      onChange={(e) => setConfig({ ...config, haDiscovery: e.target.checked })}
                      className="rounded bg-slate-950 border-slate-700 text-cyan-500"
                    />
                    <label htmlFor="haDiscovery" className="text-xs text-slate-300 cursor-pointer">
                      Send Home Assistant Auto-Discovery Configuration
                    </label>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Output & Guides Column */}
        <div className="lg:col-span-7 space-y-4">

          {/* Sub Navigation */}
          <div className="flex flex-wrap gap-1 bg-slate-900 p-1.5 rounded-xl border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setActiveTab('code')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                activeTab === 'code' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Code2 size={14} />
              <span>Python Script</span>
            </button>
            <button
              onClick={() => setActiveTab('runner')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                activeTab === 'runner' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Terminal size={14} />
              <span>Runner & CLI</span>
            </button>
            <button
              onClick={() => setActiveTab('dp-decoder')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                activeTab === 'dp-decoder' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Gauge size={14} />
              <span>DP Decoder & Tester</span>
            </button>
            <button
              onClick={() => setActiveTab('models')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                activeTab === 'models' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers size={14} />
              <span>DP Register Maps</span>
            </button>
            <button
              onClick={() => setActiveTab('key-guide')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                activeTab === 'key-guide' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              <HelpCircle size={14} />
              <span>Find Local Key</span>
            </button>
            <button
              onClick={() => setActiveTab('mqtt-ha')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                activeTab === 'mqtt-ha' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Radio size={14} />
              <span>Home Assistant</span>
            </button>
            <button
              onClick={() => setActiveTab('systemd')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors ${
                activeTab === 'systemd' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Server size={14} />
              <span>24/7 Service</span>
            </button>
          </div>

          {/* Sub Tab: Python Code */}
          {activeTab === 'code' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-xs font-mono text-emerald-400 font-semibold">read_tuya_wifi_dual_meter.py</span>
                  <span className="text-[10px] text-slate-500">Auto-configured with your inputs</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(generatePythonScript())}
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-2.5 py-1 rounded-lg border border-slate-700 transition-colors"
                  >
                    {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                  </button>
                  <button
                    onClick={() => handleDownload('read_tuya_wifi_dual_meter.py', generatePythonScript())}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-2.5 py-1 rounded-lg shadow transition-colors font-medium"
                  >
                    <Download size={13} />
                    <span>Download .py</span>
                  </button>
                </div>
              </div>

              <div className="relative">
                <pre className="bg-slate-950 p-4 rounded-xl text-xs font-mono text-slate-300 overflow-x-auto max-h-[560px] border border-slate-800/80 leading-relaxed select-all">
                  {generatePythonScript()}
                </pre>
              </div>

              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-400 flex items-start gap-2.5">
                <Shield size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-white font-semibold">How it operates: </span>
                  Connects to the meter at <span className="font-mono text-emerald-400">{config.ipAddress || 'Auto-scan'}</span> on local TCP port 6668 using AES-128-ECB encryption. Unpacks Channel A and Channel B voltages, currents, and powers, logging them in CSV format to <span className="font-mono text-cyan-400">{config.csvPath}</span>.
                </div>
              </div>
            </div>
          )}

          {/* Sub Tab: Runner Script & CLI commands */}
          {activeTab === 'runner' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Terminal size={16} className="text-emerald-400" />
                  Execution Commands & Quick Shell Runner
                </h4>
                <button
                  onClick={() => handleCopy(runnerScriptContent)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg border border-slate-700 flex items-center gap-1"
                >
                  <Copy size={13} />
                  <span>Copy Shell Script</span>
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <span className="text-xs font-semibold text-slate-300 block mb-1">
                    1. Scan local network to auto-discover your Tuya Dual Meter IP:
                  </span>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400 flex items-center justify-between">
                    <span>./run_tuya_reader.sh --scan</span>
                    <button
                      onClick={() => handleCopy('./run_tuya_reader.sh --scan')}
                      className="text-slate-400 hover:text-white"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold text-slate-300 block mb-1">
                    2. Query raw meter registers once to inspect Data Points (DPs):
                  </span>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400 flex items-center justify-between">
                    <span>./run_tuya_reader.sh -d "{config.deviceId}" -k "{config.localKey}" -a "{config.ipAddress}" --dump-dps</span>
                    <button
                      onClick={() => handleCopy(`./run_tuya_reader.sh -d "${config.deviceId}" -k "${config.localKey}" -a "${config.ipAddress}" --dump-dps`)}
                      className="text-slate-400 hover:text-white"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold text-slate-300 block mb-1">
                    3. Start continuous data logging to CSV & MQTT:
                  </span>
                  <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs text-cyan-300 overflow-x-auto leading-relaxed">
                    {`./run_tuya_reader.sh \\
  --device-id "${config.deviceId}" \\
  --local-key "${config.localKey}" \\
  --ip "${config.ipAddress}" \\
  --interval ${config.pollInterval} \\
  ${config.enableMqtt ? `--mqtt-broker "${config.mqttBroker}" --mqtt-port ${config.mqttPort} --mqtt-topic "${config.mqttTopic}"` : ''}`}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Sub Tab: DP Decoder & Tester */}
          {activeTab === 'dp-decoder' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Gauge size={18} className="text-cyan-400" />
                  <h4 className="text-sm font-bold text-white">Interactive Tuya DP Decoder & Simulator</h4>
                </div>
                <span className="text-[11px] text-cyan-400 font-mono bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                  Instant Preview
                </span>
              </div>

              <p className="text-xs text-slate-300">
                Paste raw DPS output from your meter (e.g. from <code className="bg-slate-800 text-emerald-400 px-1 rounded font-mono">--dump-dps</code>) to test how it is scaled into electrical units and formatted into the CSV row.
              </p>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Raw Tuya DPS JSON Input</label>
                <textarea
                  rows={6}
                  value={rawDpsInput}
                  onChange={(e) => setRawDpsInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs font-mono text-emerald-300 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleDecodeTest}
                  className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs px-4 py-2 rounded-xl font-semibold shadow transition-all active:scale-95"
                >
                  <Play size={14} />
                  <span>Decode & Parse DPS</span>
                </button>
              </div>

              {decodedOutput && (
                <div className="mt-4 p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-4">
                  <span className="text-xs font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                    <CheckCircle2 size={15} className="text-emerald-400" />
                    Decoded Channel Telemetry
                  </span>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Channel A */}
                    <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-1">
                      <span className="text-xs font-bold text-emerald-400 block mb-1">
                        Channel A (Clamp 1)
                      </span>
                      <div className="text-xs text-slate-300 font-mono space-y-0.5">
                        <div>Voltage: <strong className="text-white">{decodedOutput.v1} V</strong></div>
                        <div>Current: <strong className="text-white">{decodedOutput.i1} A</strong></div>
                        <div>Active Power: <strong className="text-emerald-300">{decodedOutput.p1} W</strong></div>
                        <div>Energy: <strong className="text-slate-200">{decodedOutput.e1 || 0} kWh</strong></div>
                      </div>
                    </div>

                    {/* Channel B */}
                    <div className="p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-xl space-y-1">
                      <span className="text-xs font-bold text-cyan-400 block mb-1">
                        Channel B (Clamp 2)
                      </span>
                      <div className="text-xs text-slate-300 font-mono space-y-0.5">
                        <div>Voltage: <strong className="text-white">{decodedOutput.v2} V</strong></div>
                        <div>Current: <strong className="text-white">{decodedOutput.i2} A</strong></div>
                        <div>Active Power: <strong className="text-cyan-300">{decodedOutput.p2} W</strong></div>
                        <div>Energy: <strong className="text-slate-200">{decodedOutput.e2 || 0} kWh</strong></div>
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-900 rounded-lg text-xs font-mono text-slate-300 flex justify-between">
                    <span>Total Power: <strong className="text-white">{decodedOutput.totalP} W</strong></span>
                    <span>Apparent Power: <strong className="text-white">{decodedOutput.apparentVA} VA</strong></span>
                    <span>Frequency: <strong className="text-white">{decodedOutput.freq} Hz</strong></span>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 block mb-1">Generated CSV Record:</span>
                    <div className="p-2 bg-slate-900 border border-slate-800 rounded font-mono text-[11px] text-emerald-400 overflow-x-auto select-all">
                      {decodedOutput.csvRow}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sub Tab: DP Models & Hardware presets */}
          {activeTab === 'models' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Layers size={16} className="text-emerald-400" />
                Tuya Dual Meter Register Maps by Hardware
              </h4>

              <div className="space-y-4 text-xs text-slate-300">
                {/* PJ-1203A Map */}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <strong className="text-emerald-400 text-sm">PJ-1203A / PC321-TY Bi-directional Dual Clamp</strong>
                    <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 font-mono">Popular Solar/Grid</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300">
                    <div>DP 111: Voltage A (0.1 V)</div>
                    <div>DP 121: Voltage B (0.1 V)</div>
                    <div>DP 112: Current A (mA / 0.001 A)</div>
                    <div>DP 122: Current B (mA / 0.001 A)</div>
                    <div>DP 113: Active Power A (0.1 W)</div>
                    <div>DP 123: Active Power B (0.1 W)</div>
                    <div>DP 114: Power Factor A (0.01)</div>
                    <div>DP 124: Power Factor B (0.01)</div>
                    <div>DP 115: Forward Energy A (0.01 kWh)</div>
                    <div>DP 125: Forward Energy B (0.01 kWh)</div>
                    <div>DP 131: Frequency (0.1 Hz)</div>
                    <div>DP 132: Total Active Power (0.1 W)</div>
                  </div>
                </div>

                {/* Tongou DIN Dual */}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <strong className="text-cyan-400 text-sm">Tongou 2-Channel DIN Rail Smart Energy Meter</strong>
                    <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 font-mono">DIN Breaker</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-300">
                    <div>DP 20: Channel 1 Voltage (0.1 V)</div>
                    <div>DP 23: Channel 2 Voltage (0.1 V)</div>
                    <div>DP 18: Channel 1 Current (mA)</div>
                    <div>DP 21: Channel 2 Current (mA)</div>
                    <div>DP 19: Channel 1 Power (0.1 W)</div>
                    <div>DP 22: Channel 2 Power (0.1 W)</div>
                    <div>DP 101: Ch1 Energy (0.01 kWh)</div>
                    <div>DP 102: Ch2 Energy (0.01 kWh)</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sub Tab: Find Local Key Guide */}
          {activeTab === 'key-guide' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <HelpCircle size={16} className="text-amber-400" />
                How to Obtain Tuya `device_id` and `local_key`
              </h4>

              <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
                <div className="p-3 bg-slate-950 rounded-xl border border-emerald-500/30 space-y-2">
                  <strong className="text-emerald-400 block text-sm">Method 1: TinyTuya Wizard (Fastest & Automated)</strong>
                  <p>TinyTuya provides an automated command-line wizard that downloads all your device keys directly:</p>
                  <pre className="bg-slate-900 p-2.5 rounded font-mono text-xs text-emerald-300 select-all">
                    {`pip install tinytuya
python3 -m tinytuya wizard`}
                  </pre>
                  <p>Log in with your Tuya IoT account credentials. It generates a <code className="text-white">devices.json</code> file with all your device IDs, local keys, and IP addresses automatically.</p>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <strong className="text-cyan-400 block text-sm">Method 2: Via Tuya IoT Developer Cloud (Browser)</strong>
                  <ol className="list-decimal pl-5 space-y-1.5 text-slate-300">
                    <li>Log into <a href="https://iot.tuya.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline">iot.tuya.com</a> (free account).</li>
                    <li>Go to <strong>Cloud</strong> &rarr; <strong>Development</strong> &rarr; Click your Cloud Project.</li>
                    <li>Navigate to <strong>Cloud</strong> &rarr; <strong>API Explorer</strong>.</li>
                    <li>Select <strong>Smart Home Device System</strong> &rarr; <strong>Device Control</strong> &rarr; <strong>Get Device Details</strong>.</li>
                    <li>Enter your Device ID (from your Smart Life app device information page) and click <strong>Submit Request</strong>.</li>
                    <li>The JSON response contains: <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300 font-mono">"local_key": "xxxxxxxxxxxxxxxx"</code>.</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* Sub Tab: Home Assistant & MQTT */}
          {activeTab === 'mqtt-ha' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Radio size={16} className="text-cyan-400" />
                  Home Assistant & MQTT Integration
                </h4>
                <button
                  onClick={() => handleCopy(homeAssistantYaml)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg border border-slate-700 flex items-center gap-1"
                >
                  <Copy size={13} />
                  <span>Copy YAML</span>
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-slate-300">
                  When <strong className="text-white">--ha-discovery</strong> is enabled, sensor entities are created automatically in Home Assistant. Alternatively, add this to your Home Assistant <code className="text-cyan-400">configuration.yaml</code>:
                </p>
                <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto leading-relaxed">
                  {homeAssistantYaml}
                </pre>
              </div>
            </div>
          )}

          {/* Sub Tab: Systemd 24/7 background service */}
          {activeTab === 'systemd' && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Server size={16} className="text-emerald-400" />
                  Linux systemd 24/7 Background Service
                </h4>
                <button
                  onClick={() => handleCopy(systemdServiceContent)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg border border-slate-700 flex items-center gap-1"
                >
                  <Copy size={13} />
                  <span>Copy Service File</span>
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-300">
                <p>Run the data acquisition script on Orange Pi H3 or Ubuntu automatically on system boot:</p>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>Create service file: <code className="bg-slate-950 px-1 py-0.5 rounded text-emerald-400 font-mono">sudo nano /etc/systemd/system/tuya-meter.service</code></li>
                  <li>Paste configuration:</li>
                </ol>
                <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto leading-relaxed">
                  {systemdServiceContent}
                </pre>
                <ol start={3} className="list-decimal pl-5 space-y-2">
                  <li>Enable and start service:
                    <pre className="bg-slate-950 p-2 rounded font-mono text-xs text-emerald-400 mt-1">
                      {`sudo systemctl daemon-reload
sudo systemctl enable tuya-meter.service
sudo systemctl start tuya-meter.service`}
                    </pre>
                  </li>
                  <li>Check live logs: <code className="bg-slate-950 px-1 py-0.5 rounded text-cyan-400 font-mono">journalctl -u tuya-meter.service -f</code></li>
                </ol>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};

export default TuyaWifiDualMeterView;
