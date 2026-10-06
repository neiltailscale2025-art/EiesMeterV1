#!/usr/bin/env python3
"""
Tuya WiFi Dual Meter Data Acquisition & MQTT Gateway (Local Tuya API)
--------------------------------------------------------------------------
EIES Power Monitoring Platform — Eneftech Innovative Engineering Services
Tagbilaran City, Bohol

Features:
- Local Tuya API integration (LAN TCP port 6668/6667) — Zero cloud required!
- Auto-decodes Dual Channel / Dual Clamp Energy Meters (PJ-1203A, PC321-TY,
  Tongou 2-Channel DIN Rail Smart Meters, WDYK, EARU, Tuya Dual Energy Switches)
- Auto-discovers meter IP on local WiFi subnet via Tuya UDP broadcast (--scan)
- Formats telemetry directly into 'meter_data.csv' (Channel A -> Phase 1,
  Channel B -> Phase 2, Phase 3 -> 0) compatible with the EIES Web Dashboard
- Optional MQTT publishing to Home Assistant / Mosquitto / Cloud brokers
- Raw DP Inspector (--dump-dps) for discovering custom manufacturer DP maps
- Persistent auto-reconnect with exponential backoff on WiFi glitches
--------------------------------------------------------------------------
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

# Force unbuffered output so journalctl and terminals display logs in real-time
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None

def get_now_timestamp(tz_name="Asia/Manila"):
    """Returns formatted local timestamp honoring configured timezone (defaults to Philippine Time UTC+8)."""
    if ZoneInfo:
        try:
            return datetime.now(ZoneInfo(tz_name)).strftime('%Y-%m-%d %H:%M:%S')
        except Exception:
            pass
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')

# Check for tinytuya
try:
    import tinytuya
    TINYTUNA_AVAILABLE = True
except ImportError:
    tinytuya = None
    TINYTUNA_AVAILABLE = False

def check_tinytuya():
    if not TINYTUNA_AVAILABLE or tinytuya is None:
        print("\n[ERROR] 'tinytuya' library is not installed in this Python environment.")
        print("Please install dependencies:")
        print("    pip install tinytuya paho-mqtt")
        print("Or run the automated setup:")
        print("    bash setup_venv.sh\n")
        sys.exit(1)

# Optional MQTT support
try:
    import paho.mqtt.client as mqtt
    MQTT_AVAILABLE = True
except ImportError:
    MQTT_AVAILABLE = False


# --- Standard DP Mapping Presets for Tuya Dual Meters ---
PRESET_DP_MAPS = {
    # 1. Dual Clamp Bi-directional Meter (PJ-1203A / PC321-TY / WDYK clamp meter)
    'pj1203a': {
        'name': 'Tuya Dual Clamp Bi-directional Meter (PJ-1203A / PC321-TY)',
        'v1': 111, 'i1': 112, 'p1': 113, 'pf1': 114, 'e1': 115,
        'v2': 121, 'i2': 122, 'p2': 123, 'pf2': 124, 'e2': 125,
        'freq': 131, 'total_p': 132,
        'scale_v': 0.1,    # e.g. 2315 -> 231.5 V
        'scale_i': 0.001,  # e.g. 4250 -> 4.250 A
        'scale_p': 0.1,    # e.g. 9815 -> 981.5 W
        'scale_e': 0.01    # e.g. 1540 -> 15.40 kWh
    },
    # 2. Tongou 2-Channel DIN Rail Smart Energy Meter / EARU Dual Meter
    'tongou': {
        'name': 'Tongou 2-Channel DIN Rail Smart Meter / EARU Dual Meter',
        'v1': 20, 'i1': 18, 'p1': 19, 'e1': 101,
        'v2': 23, 'i2': 21, 'p2': 22, 'e2': 102,
        'freq': 105, 'total_p': 106,
        'scale_v': 0.1,    # 2305 -> 230.5 V
        'scale_i': 0.001,  # 3200 mA -> 3.20 A
        'scale_p': 0.1,    # 7360 -> 736.0 W (or 1.0 depending on firmware)
        'scale_e': 0.01
    },
    # 3. Dual Switch + Metering (Standard Tuya 2-gang switch with energy)
    'switch_dual': {
        'name': 'Tuya 2-Gang Metering Breaker / Socket',
        'v1': 20, 'i1': 18, 'p1': 19, 'e1': 17,
        'v2': 20, 'i2': 21, 'p2': 22, 'e2': 17,
        'freq': None, 'total_p': None,
        'scale_v': 0.1,
        'scale_i': 0.001,
        'scale_p': 0.1,
        'scale_e': 0.01
    },
    # 4. Bidirectional DIN Rail Smart Energy Meter (TOMZN / EARU / Acrel / Tongou Bidirectional)
    'din_bidirectional': {
        'name': 'Tuya Smart Bi-directional DIN Rail Energy Meter',
        'v1': 112, 'i1': 113, 'p1': None, 'pf1': 110, 'e1': 101,
        'v2': None, 'i2': None, 'p2': None, 'e2': None,
        'freq': 111, 'total_p': None,
        'direction': 102,
        'scale_v': 0.1,     # 2503 -> 250.3 V
        'scale_i': 0.001,   # 1966 -> 1.966 A
        'scale_p': 1.0,
        'scale_e': 0.01,    # 4537 -> 45.37 kWh
        'scale_freq': 0.01  # 5904 -> 59.04 Hz
    }
}


def parse_arguments():
    parser = argparse.ArgumentParser(
        description="EIES Tuya WiFi Dual Meter Local Data Logger & MQTT Gateway"
    )
    # Device Identification
    parser.add_argument('-d', '--device-id', type=str, default=os.getenv('TUYA_DEVICE_ID', ''),
                        nargs='?', const='',
                        help='Tuya Device ID (20 or 22 characters)')
    parser.add_argument('-k', '--local-key', type=str, default=os.getenv('TUYA_LOCAL_KEY', ''),
                        nargs='?', const='',
                        help='16-character Local Encryption Key from Tuya IoT Platform / tinytuya wizard')
    parser.add_argument('-a', '--ip', type=str, default=os.getenv('TUYA_IP', ''),
                        nargs='?', const='',
                        help='Meter local IP address (e.g. 192.168.1.150). Auto-discovered if omitted.')
    parser.add_argument('-p', '--protocol', type=str, default='3.4',
                        nargs='?', const='3.4',
                        help='Tuya Protocol Version (default: 3.4; use 3.3 or 3.5 if needed)')
    
    # Reading & CSV Configuration
    parser.add_argument('-i', '--interval', type=float, default=3.5,
                        help='Polling interval in seconds (default: 3.5)')
    parser.add_argument('--csv', type=str, default='meter_data.csv',
                        help='Target CSV file path (default: meter_data.csv)')
    parser.add_argument('--tz', '--timezone', type=str, default=os.getenv('TZ', 'Asia/Manila'),
                        help='Timezone for CSV timestamps (default: Asia/Manila / UTC+8)')
    parser.add_argument('--listen-push', action='store_true',
                        help='Listen for unsolicited push events from meter instead of polling')
    
    # Model & DP Mapping Presets
    parser.add_argument('--model', type=str, default='auto',
                        choices=['auto', 'pj1203a', 'tongou', 'switch_dual', 'custom'],
                        help='Meter DP Preset (default: auto - smart auto-detection)')
    
    # Custom DP Overrides (if model is custom or meter has non-standard DPs)
    parser.add_argument('--dp-v1', type=int, default=None, help='DP ID for Channel 1 Voltage')
    parser.add_argument('--dp-i1', type=int, default=None, help='DP ID for Channel 1 Current')
    parser.add_argument('--dp-p1', type=int, default=None, help='DP ID for Channel 1 Power')
    parser.add_argument('--dp-e1', type=int, default=None, help='DP ID for Channel 1 Energy (kWh)')
    parser.add_argument('--dp-v2', type=int, default=None, help='DP ID for Channel 2 Voltage')
    parser.add_argument('--dp-i2', type=int, default=None, help='DP ID for Channel 2 Current')
    parser.add_argument('--dp-p2', type=int, default=None, help='DP ID for Channel 2 Power')
    parser.add_argument('--dp-e2', type=int, default=None, help='DP ID for Channel 2 Energy (kWh)')
    parser.add_argument('--dp-freq', type=int, default=None, help='DP ID for Frequency')
    parser.add_argument('--dp-total-p', type=int, default=None, help='DP ID for Total Active Power')
    parser.add_argument('--scale-v', type=float, default=None, help='Multiplier for Voltage (e.g. 0.1 for 2300 -> 230V)')
    parser.add_argument('--scale-i', type=float, default=None, help='Multiplier for Current (e.g. 0.001 for 3000mA -> 3.0A)')
    parser.add_argument('--scale-p', type=float, default=None, help='Multiplier for Power (e.g. 0.1 or 1.0)')

    # MQTT Gateway Options
    parser.add_argument('--mqtt-broker', type=str, default=os.getenv('MQTT_BROKER', ''),
                        help='MQTT Broker IP/Host (e.g. 127.0.0.1 or 192.168.1.50). Leave empty to disable MQTT.')
    parser.add_argument('--mqtt-port', type=int, default=1883,
                        help='MQTT Broker port (default: 1883)')
    parser.add_argument('--mqtt-topic', type=str, default='tuya/dual_meter',
                        help='Base MQTT Topic prefix (default: tuya/dual_meter)')
    parser.add_argument('--mqtt-user', type=str, default=os.getenv('MQTT_USER', ''),
                        help='MQTT Username (optional)')
    parser.add_argument('--mqtt-pass', type=str, default=os.getenv('MQTT_PASS', ''),
                        help='MQTT Password (optional)')
    parser.add_argument('--ha-discovery', action='store_true',
                        help='Publish Home Assistant MQTT Auto-Discovery topics')

    # Utility Diagnostic Modes
    parser.add_argument('--scan', action='store_true',
                        help='Scan local WiFi network for all Tuya devices and exit')
    parser.add_argument('--dump-dps', action='store_true',
                        help='Query meter once, display all raw DPS dictionary points, and exit')

    return parser.parse_args()


CSV_HEADERS = [
    'Timestamp',
    'Phase 1 Voltage (V)', 'Phase 2 Voltage (V)', 'Phase 3 Voltage (V)',
    'Phase 1 Current (A)', 'Phase 2 Current (A)', 'Phase 3 Current (A)',
    'Phase 1 Power (W)', 'Phase 2 Power (W)', 'Phase 3 Power (W)',
    'Frequency (Hz)', 'Total Active Power (W)', 'Total Apparent Power (VA)'
]


def init_csv(csv_path):
    """Ensures CSV exists with standard 13-column headers."""
    if not os.path.exists(csv_path):
        os.makedirs(os.path.dirname(os.path.abspath(csv_path)), exist_ok=True)
        with open(csv_path, mode='w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(CSV_HEADERS)
        print(f"Created new CSV file with EIES schema: {csv_path}")


def scan_local_devices():
    """Scan local network for Tuya devices using UDP broadcast."""
    check_tinytuya()
    print("==========================================================")
    print(" Scanning local network for Tuya WiFi Devices (UDP)...")
    print(" Ensure your computer is connected to the same 2.4GHz WiFi")
    print("==========================================================")
    devices = tinytuya.deviceScan(False, 8)
    if not devices:
        print("No Tuya devices responded to UDP broadcast.")
        print("Note: Some meters do not respond to broadcast; use their static/DHCP IP directly.")
        return

    print(f"Found {len(devices)} Tuya device(s):")
    for ip, dev in devices.items():
        dev_id = dev.get('gwId', dev.get('id', 'Unknown ID'))
        ver = dev.get('version', '3.3')
        name = dev.get('name', 'Tuya Device')
        print(f"  -> IP: {ip:<15} | Device ID: {dev_id:<22} | Protocol: {ver} | {name}")
    print("==========================================================")


def connect_mqtt(args):
    """Establish connection to MQTT broker if configured."""
    if not args.mqtt_broker:
        return None
    if not MQTT_AVAILABLE:
        print("[WARNING] paho-mqtt is not installed. MQTT publishing disabled.")
        return None

    try:
        client = mqtt.Client(client_id=f"tuya-meter-logger-{int(time.time())}")
        if args.mqtt_user and args.mqtt_pass:
            client.username_pw_set(args.mqtt_user, args.mqtt_pass)
        print(f"Connecting to MQTT broker at {args.mqtt_broker}:{args.mqtt_port}...")
        client.connect(args.mqtt_broker, args.mqtt_port, 60)
        client.loop_start()
        print("Connected to MQTT broker successfully.")

        if args.ha_discovery:
            publish_ha_discovery(client, args.mqtt_topic, args.device_id or "tuya_dual_meter")

        return client
    except Exception as e:
        print(f"[WARNING] Failed to connect to MQTT broker: {e}")
        return None


def publish_ha_discovery(mqtt_client, base_topic, dev_id):
    """Publish Home Assistant MQTT Auto-Discovery configuration for both channels."""
    entities = [
        {"id": "ch1_voltage", "name": "Channel 1 Voltage", "unit": "V", "dev_class": "voltage", "val": "{{ value_json.channel_a.voltage }}"},
        {"id": "ch1_current", "name": "Channel 1 Current", "unit": "A", "dev_class": "current", "val": "{{ value_json.channel_a.current }}"},
        {"id": "ch1_power", "name": "Channel 1 Power", "unit": "W", "dev_class": "power", "val": "{{ value_json.channel_a.power }}"},
        {"id": "ch2_voltage", "name": "Channel 2 Voltage", "unit": "V", "dev_class": "voltage", "val": "{{ value_json.channel_b.voltage }}"},
        {"id": "ch2_current", "name": "Channel 2 Current", "unit": "A", "dev_class": "current", "val": "{{ value_json.channel_b.current }}"},
        {"id": "ch2_power", "name": "Channel 2 Power", "unit": "W", "dev_class": "power", "val": "{{ value_json.channel_b.power }}"},
        {"id": "total_power", "name": "Total Active Power", "unit": "W", "dev_class": "power", "val": "{{ value_json.total_power }}"},
        {"id": "frequency", "name": "Frequency", "unit": "Hz", "dev_class": "frequency", "val": "{{ value_json.frequency }}"},
    ]

    for ent in entities:
        disc_topic = f"homeassistant/sensor/{dev_id}/{ent['id']}/config"
        payload = {
            "name": ent["name"],
            "unique_id": f"{dev_id}_{ent['id']}",
            "state_topic": f"{base_topic}/state",
            "value_template": ent["val"],
            "unit_of_measurement": ent["unit"],
            "device_class": ent["dev_class"],
            "state_class": "measurement",
            "device": {
                "identifiers": [dev_id],
                "name": "Tuya WiFi Dual Energy Meter",
                "manufacturer": "EIES / Tuya",
                "model": "Dual-Channel Smart Meter"
            }
        }
        mqtt_client.publish(disc_topic, json.dumps(payload), retain=True)
    print(f"Published {len(entities)} Home Assistant MQTT auto-discovery sensors.")


# Persistent cache for Tuya DPS delta updates and anti-dropout latch
CACHED_DPS = {}
LAST_VALID_READINGS = {
    'v1': 230.0, 'i1': 0.0, 'p1': 0.0, 'e1': 0.0,
    'v2': 0.0, 'i2': 0.0, 'p2': 0.0, 'e2': 0.0,
    'freq': 60.0, 'pf': 0.92, 'total_active': 0.0, 'total_apparent': 0.0,
    'direction': 'FORWARD'
}
ZERO_SAMPLE_STREAK = 0

def smart_extract_dps(new_dps, args):
    """
    Intelligently decode raw Tuya DPS dictionary into Channel A & Channel B values.
    Supports auto-detection heuristics, manual/preset overrides, stateful caching
    for partial packets, and anti-dropout glitch filtering.
    """
    global CACHED_DPS, LAST_VALID_READINGS, ZERO_SAMPLE_STREAK

    # 1. Merge incoming delta DPS into cached state so partial packets don't drop to 0
    if isinstance(new_dps, dict):
        CACHED_DPS.update(new_dps)
    dps = CACHED_DPS

    # 2. Start with preset or custom settings
    preset_key = args.model
    preset = PRESET_DP_MAPS.get(preset_key, {})

    # Helper to fetch DP value with fallback
    def get_dp(dp_id):
        if dp_id is None:
            return None
        return dps.get(str(dp_id), dps.get(int(dp_id), None))

    # Determine DP mappings
    dp_v1 = args.dp_v1 if args.dp_v1 is not None else preset.get('v1')
    dp_i1 = args.dp_i1 if args.dp_i1 is not None else preset.get('i1')
    dp_p1 = args.dp_p1 if args.dp_p1 is not None else preset.get('p1')
    dp_e1 = args.dp_e1 if args.dp_e1 is not None else preset.get('e1')

    dp_v2 = args.dp_v2 if args.dp_v2 is not None else preset.get('v2')
    dp_i2 = args.dp_i2 if args.dp_i2 is not None else preset.get('i2')
    dp_p2 = args.dp_p2 if args.dp_p2 is not None else preset.get('p2')
    dp_e2 = args.dp_e2 if args.dp_e2 is not None else preset.get('e2')

    dp_freq = args.dp_freq if args.dp_freq is not None else preset.get('freq')
    dp_tot_p = args.dp_total_p if args.dp_total_p is not None else preset.get('total_p')

    # If model is 'auto', test standard patterns against present keys
    is_single_bidirectional = False
    if args.model == 'auto':
        str_keys = {str(k) for k in dps.keys()}
        if '102' in str_keys or ('112' in str_keys and '113' in str_keys and ('106' in str_keys or '130' in str_keys)):
            # Matches Tuya Smart Bi-directional DIN Rail Energy Meter!
            preset = PRESET_DP_MAPS['din_bidirectional']
            dp_v1, dp_i1, dp_p1, dp_e1 = preset['v1'], preset['i1'], preset['p1'], preset['e1']
            dp_v2, dp_i2, dp_p2, dp_e2 = None, None, None, None
            dp_freq, dp_tot_p = preset['freq'], preset['total_p']
            is_single_bidirectional = True
        elif '111' in str_keys and '121' in str_keys:
            # Matches PJ-1203A / PC321-TY dual clamp
            preset = PRESET_DP_MAPS['pj1203a']
            dp_v1, dp_i1, dp_p1, dp_e1 = preset['v1'], preset['i1'], preset['p1'], preset['e1']
            dp_v2, dp_i2, dp_p2, dp_e2 = preset['v2'], preset['i2'], preset['p2'], preset['e2']
            dp_freq, dp_tot_p = preset['freq'], preset['total_p']
        elif '18' in str_keys and '21' in str_keys:
            # Matches Tongou DIN Dual
            preset = PRESET_DP_MAPS['tongou']
            dp_v1, dp_i1, dp_p1, dp_e1 = preset['v1'], preset['i1'], preset['p1'], preset['e1']
            dp_v2, dp_i2, dp_p2, dp_e2 = preset['v2'], preset['i2'], preset['p2'], preset['e2']
            dp_freq, dp_tot_p = preset['freq'], preset['total_p']

    # Read raw values
    raw_v1 = get_dp(dp_v1)
    raw_i1 = get_dp(dp_i1)
    raw_p1 = get_dp(dp_p1)
    raw_e1 = get_dp(dp_e1)

    raw_v2 = get_dp(dp_v2) if dp_v2 is not None else None
    raw_i2 = get_dp(dp_i2) if dp_i2 is not None else None
    raw_p2 = get_dp(dp_p2) if dp_p2 is not None else None
    raw_e2 = get_dp(dp_e2) if dp_e2 is not None else None

    raw_freq = get_dp(dp_freq)
    raw_tot_p = get_dp(dp_tot_p)

    # Scaling function with smart fallback and hold-last-good value
    def scale_voltage(raw, default_val=None):
        if raw is None:
            last_v = LAST_VALID_READINGS.get('v1')
            if last_v and last_v > 50.0:
                return last_v
            return default_val if default_val is not None else 230.0
        val = float(raw)
        if args.scale_v is not None:
            return val * args.scale_v
        if preset.get('scale_v') is not None:
            return val * preset['scale_v']
        if val > 500.0:  # e.g. 2391 -> 239.1 V
            return val / 10.0
        return val

    def scale_current(raw, ch=1):
        if raw is None:
            return LAST_VALID_READINGS.get(f'i{ch}', 0.0)
        val = float(raw)
        if args.scale_i is not None:
            return val * args.scale_i
        # Tuya energy meter DP 113 (and clamp meters) is always reported in milliamps (mA)
        # e.g. 405 mA -> 0.405 A, 1966 mA -> 1.966 A
        if preset.get('scale_i') is not None:
            return val * preset['scale_i']
        return val / 1000.0

    def scale_power(raw, v, i, ch=1):
        if raw is None:
            if v > 0 and i > 0:
                return v * i * 0.90
            return LAST_VALID_READINGS.get(f'p{ch}', 0.0)
        val = float(raw)
        if args.scale_p is not None:
            return val * args.scale_p
        # If power value is already in watts (e.g. 353), return directly
        if val < 50000:
            return val
        return val / 10.0

    def scale_energy(raw, ch=1):
        if raw is None:
            return LAST_VALID_READINGS.get(f'e{ch}', 0.0)
        val = float(raw)
        if val > 1000.0:
            return val / 100.0  # e.g. 4537 -> 45.37 kWh
        return val

    v1 = scale_voltage(raw_v1, 230.0)
    raw_calc_i1 = scale_current(raw_i1, 1)

    # Anti-dropout glitch filter:
    # If line voltage is healthy (> 180V), previous current was active (> 0.1A),
    # but this isolated sample reported 0.0 (transient Tuya packet drop), hold last good reading for 1 poll.
    # If current remains 0 for 2+ consecutive polls, accept that the load was genuinely switched off.
    if v1 > 180.0 and raw_calc_i1 < 0.01 and LAST_VALID_READINGS.get('i1', 0.0) > 0.1:
        ZERO_SAMPLE_STREAK += 1
        if ZERO_SAMPLE_STREAK < 2:
            i1 = LAST_VALID_READINGS['i1']
        else:
            i1 = raw_calc_i1
    else:
        ZERO_SAMPLE_STREAK = 0
        i1 = raw_calc_i1

    if v1 > 50.0:
        LAST_VALID_READINGS['v1'] = v1
    if i1 > 0.001:
        LAST_VALID_READINGS['i1'] = i1

    e1 = scale_energy(raw_e1, 1)
    if e1 > 0:
        LAST_VALID_READINGS['e1'] = e1

    # Power Factor from DP 110 (e.g. 80 -> 0.80, 92 -> 0.92)
    raw_pf = dps.get('110')
    if raw_pf is not None:
        try:
            pf_val = float(raw_pf)
            if pf_val > 1.0:
                pf_val = pf_val / 100.0
            pf_val = max(0.01, min(1.0, pf_val))
        except (ValueError, TypeError):
            pf_val = 0.92
    else:
        pf_val = 0.92

    if is_single_bidirectional or dp_v2 is None:
        v2, i2, p2, e2 = 0.0, 0.0, 0.0, 0.0
        # Accurate physics-based Active Power: P = V * I * PF
        s1 = v1 * i1
        p1 = s1 * pf_val
        tot_active = p1
        tot_apparent = s1
    else:
        v2 = scale_voltage(raw_v2) if raw_v2 is not None else v1
        i2 = scale_current(raw_i2)
        p1 = scale_power(raw_p1, v1, i1)
        p2 = scale_power(raw_p2, v2, i2)
        e2 = scale_energy(raw_e2)
        tot_active = p1 + p2
        tot_apparent = (v1 * i1) + (v2 * i2)

    # Frequency: 5904 -> 59.04 Hz
    if raw_freq is not None:
        freq = float(raw_freq)
        if freq > 1000.0:
            freq = freq / 100.0
        elif freq > 100.0:
            freq = freq / 10.0
    else:
        freq = 60.0

    if tot_apparent == 0.0 and tot_active > 0:
        tot_apparent = tot_active / pf_val

    direction = str(dps.get('102', 'FORWARD'))

    return {
        'v1': round(v1, 2),
        'i1': round(i1, 3),
        'p1': round(p1, 2),
        'e1': round(e1, 2),
        'v2': round(v2, 2),
        'i2': round(i2, 3),
        'p2': round(p2, 2),
        'e2': round(e2, 2),
        'freq': round(freq, 2),
        'total_active': round(tot_active, 2),
        'total_apparent': round(tot_apparent, 2),
        'pf': round(pf_val, 2),
        'direction': direction,
        'is_single': is_single_bidirectional
    }


def query_meter_status(device, args):
    """
    Query device status with automatic protocol fallback (3.4 -> 3.3 -> 3.5)
    and updatedps() and receive() fallback.
    """
    # 1. Try standard query
    try:
        data = device.status()
        if data and isinstance(data, dict) and 'dps' in data:
            return data
    except Exception:
        data = {}

    # 2. Try updatedps() query
    try:
        up_data = device.updatedps()
        if up_data and isinstance(up_data, dict) and 'dps' in up_data:
            return up_data
    except Exception:
        pass

    # 3. Try alternative protocol versions with clean socket reset
    current_ver = getattr(device, 'version', 3.4)
    candidate_versions = [3.4, 3.3, 3.5, 3.1]
    for alt_ver in candidate_versions:
        if alt_ver == current_ver:
            continue
        try:
            device.close()
            device.set_version(alt_ver)
            alt_data = device.status()
            if alt_data and isinstance(alt_data, dict) and 'dps' in alt_data:
                print(f"✅ Successfully auto-negotiated Tuya Protocol v{alt_ver}!")
                args.protocol = str(alt_ver)
                return alt_data
            
            # Also try updatedps with alt version
            alt_up = device.updatedps()
            if alt_up and isinstance(alt_up, dict) and 'dps' in alt_up:
                print(f"✅ Successfully queried DPS using Protocol v{alt_ver} via updatedps()!")
                args.protocol = str(alt_ver)
                return alt_up
        except Exception:
            pass

    # 4. Try passive receive() in case meter is push-only
    try:
        payload = device.receive()
        if payload and isinstance(payload, dict) and 'dps' in payload:
            return payload
    except Exception:
        pass

    # Revert back to current version
    try:
        device.set_version(current_ver)
    except Exception:
        pass

    return data


CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tuya_config.json')

def load_tuya_config():
    """Load cached configuration from tuya_config.json if available."""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_tuya_config(cfg):
    """Save valid credentials to tuya_config.json for persistent autostart."""
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, indent=2)
        print(f"💾 Saved device configuration to: {CONFIG_FILE}")
    except Exception as e:
        print(f"[Notice] Could not save config file: {e}")

def create_tuya_device(args):
    """Instantiate and configure tinytuya Device instance."""
    check_tinytuya()

    # 1. Check cached tuya_config.json first
    cfg = load_tuya_config()
    if not args.device_id and cfg.get('device_id'):
        args.device_id = cfg['device_id']
        print(f"Loaded Device ID from {os.path.basename(CONFIG_FILE)}: {args.device_id}")
    if not args.local_key and cfg.get('local_key'):
        args.local_key = cfg['local_key']
        print(f"Loaded Local Key from {os.path.basename(CONFIG_FILE)}.")
    if not args.ip and cfg.get('ip'):
        args.ip = cfg['ip']
        print(f"Loaded IP from {os.path.basename(CONFIG_FILE)}: {args.ip}")
    if (not args.protocol or args.protocol == '3.4') and cfg.get('protocol'):
        args.protocol = str(cfg['protocol'])
        print(f"Loaded Protocol from {os.path.basename(CONFIG_FILE)}: {args.protocol}")
    if cfg.get('interval') and (args.interval is None or args.interval == 3.5):
        try:
            args.interval = float(cfg['interval'])
            print(f"Loaded Interval from {os.path.basename(CONFIG_FILE)}: {args.interval}s")
        except (ValueError, TypeError):
            pass

    # 2. Interactive Python input if still missing (completely avoids shell expansion issues)
    args.device_id = (args.device_id or '').strip().strip('"\'')
    if not args.device_id:
        try:
            print("\n" + "=" * 58)
            print("⚡ Tuya WiFi Dual Meter Setup")
            print("=" * 58)
            args.device_id = input("Enter Tuya Device ID (e.g. bf0123...): ").strip().strip('"\'')
        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            sys.exit(0)

    args.local_key = (args.local_key or '').strip().strip('"\'')
    if not args.local_key:
        try:
            args.local_key = input("Enter 16-character Local Key: ").strip().strip('"\'')
        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            sys.exit(0)

    if not args.device_id or not args.local_key:
        print("[ERROR] Both Device ID (-d) and Local Key (-k) are required.")
        print("Run with -h for help or create tuya_config.json.")
        sys.exit(1)

    # 3. Save to tuya_config.json so the user never has to re-enter it
    cfg_to_save = {
        'device_id': args.device_id,
        'local_key': args.local_key,
        'ip': args.ip or '',
        'protocol': args.protocol or '3.4',
        'interval': getattr(args, 'interval', 3.5)
    }
    save_tuya_config(cfg_to_save)

    ip = (args.ip or '').strip().strip('"\'')
    if not ip:
        print(f"IP address not specified. Auto-discovering device ID {args.device_id} on local LAN...")
        devices = tinytuya.deviceScan(False, 5)
        for d_ip, d_info in devices.items():
            if d_info.get('gwId') == args.device_id or d_info.get('id') == args.device_id:
                ip = d_ip
                print(f"Discovered meter IP: {ip}")
                # Update saved config with discovered IP
                cfg_to_save['ip'] = ip
                save_tuya_config(cfg_to_save)
                break
        if not ip:
            print(f"[ERROR] Could not auto-discover IP for device ID '{args.device_id}'.")
            print("Please specify the meter IP manually with: --ip <IP_ADDRESS> or in tuya_config.json")
            sys.exit(1)

    # Determine protocol version
    version = 3.4
    if args.protocol and args.protocol != 'auto':
        try:
            version = float(args.protocol)
        except ValueError:
            version = 3.4

    print(f"Configuring Local Tuya Device: ID={args.device_id[:6]}... IP={ip} Protocol={version}")
    device = tinytuya.OutletDevice(
        dev_id=args.device_id,
        address=ip,
        local_key=args.local_key,
        version=version
    )
    device.set_socketPersistent(False)
    device.set_socketTimeout(5)
    return device, ip


def main():
    args = parse_arguments()

    # Ensure CSV path is resolved to script directory if relative
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if not os.path.isabs(args.csv):
        args.csv = os.path.abspath(os.path.join(script_dir, args.csv))

    # Diagnostic Mode 1: Local Network Scan
    if args.scan:
        scan_local_devices()
        return

    # Diagnostic Mode 2: Dump Raw DPs once and exit
    if args.dump_dps:
        device, _ = create_tuya_device(args)
        print("Querying device raw DPS dictionary...")
        data = query_meter_status(device, args)
        print("\n--- Raw Tuya Meter Response ---")
        print(json.dumps(data, indent=2))
        if isinstance(data, dict) and 'dps' in data:
            print("\n--- Parsed DPS Map Analysis ---")
            for dp_num, val in sorted(data['dps'].items(), key=lambda x: int(x[0]) if x[0].isdigit() else 999):
                print(f"  DP {dp_num:>4} : {str(val):<12} (type: {type(val).__name__})")
        else:
            print("\n⚠️  [DIAGNOSTIC NOTICE FOR ERROR 904]")
            print("Tuya Error 904 indicates the meter rejected or could not decrypt the request.")
            print("This occurs due to one of the following:")
            print("  1) Protocol Version: The meter requires Tuya v3.4 or v3.5.")
            print("     -> Try: ./run_tuya_reader.sh ... -p 3.4  (or -p 3.5)")
            print("  2) Invalid Local Key: If the meter was re-paired or re-added in Smart Life,")
            print("     Tuya Cloud automatically issued a NEW local_key. Check iot.tuya.com.")
            print("  3) Device in Single-Socket Mode: Close the Smart Life app on your phone so")
            print("     it does not hold an active TCP connection to the meter.")
        return

    # Normal Acquisition Mode
    device, meter_ip = create_tuya_device(args)
    mqtt_client = connect_mqtt(args)
    init_csv(args.csv)

    print("\n==========================================================")
    print(" EIES Tuya WiFi Dual Meter Acquisition Started")
    print(f" Target Device:  {args.device_id}")
    print(f" IP Address:     {meter_ip} (TCP port 6668)")
    print(f" Protocol:       Tuya v{args.protocol}")
    print(f" Polling Rate:   Every {args.interval}s")
    print(f" Target CSV:     {args.csv}")
    if args.mqtt_broker:
        print(f" MQTT Gateway:   {args.mqtt_broker}:{args.mqtt_port} -> {args.mqtt_topic}/#")

    # Fast TCP connectivity diagnostic
    def test_tcp_port(target_ip, port=6668, timeout=3):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(timeout)
            s.connect((target_ip, port))
            s.close()
            return True, "Port 6668 reachable"
        except socket.timeout:
            return False, "Connection timed out after 3 seconds"
        except ConnectionRefusedError:
            return False, "Connection refused by target meter"
        except Exception as e:
            return False, str(e)

    print(f"Testing direct TCP connection to {meter_ip}:6668...")
    tcp_ok, tcp_msg = test_tcp_port(meter_ip, 6668, 3)
    if tcp_ok:
        print(f"✅ Connection successful! Meter is actively listening on {meter_ip}:6668.")
    else:
        print(f"⚠️ [WARNING] Direct TCP connection check failed: {tcp_msg}")
        print("  -> Please verify Orange Pi can reach meter IP (try: ping -c 2 " + meter_ip + ")")
        print("  -> Ensure Tuya / Smart Life app on phone is completely closed.")
    print(" Press Ctrl+C to terminate data collection.")
    print("==========================================================\n")

    consecutive_errors = 0
    backoff = 1.0

    while True:
        try:
            # Query meter status with auto protocol fallback
            status_data = query_meter_status(device, args)

            if not status_data or not isinstance(status_data, dict) or 'dps' not in status_data:
                err_msg = status_data.get('Error', 'Empty response from meter') if isinstance(status_data, dict) else str(status_data)
                err_code = status_data.get('Err', '') if isinstance(status_data, dict) else ''
                print(f"[{datetime.now().strftime('%H:%M:%S')}] ⚠️ Tuya Notice (No DPS payload): {err_msg} (code: {err_code})")
                consecutive_errors += 1
                if consecutive_errors > 3:
                    print("Re-establishing socket connection...")
                    device.close()
                    time.sleep(min(backoff, 10.0))
                    backoff *= 1.5
                time.sleep(args.interval)
                continue

            consecutive_errors = 0
            backoff = 1.0
            dps = status_data['dps']

            # Extract dual channel readings
            m = smart_extract_dps(dps, args)
            now_str = get_now_timestamp(getattr(args, 'tz', 'Asia/Manila'))

            # 1. Formatted Terminal Console Display
            if m.get('is_single'):
                print(f"--- {now_str} [Tuya Smart Bi-directional Meter: {meter_ip}] ---")
                print(f"  AC Voltage: {m['v1']:>6.2f} V  | AC Current: {m['i1']:>6.3f} A  | Active Power: {m['p1']:>7.2f} W  | PF: {m.get('pf', 0.92):.2f}")
                print(f"  Total Energy: {m['e1']:>7.2f} kWh | Frequency: {m['freq']:.2f} Hz | Flow Direction: {m.get('direction', 'FORWARD')}")
            else:
                print(f"--- {now_str} [Tuya WiFi Dual Meter: {meter_ip}] ---")
                print(f"  Channel A (Ch 1): {m['v1']:>6.2f} V  | {m['i1']:>6.3f} A  | {m['p1']:>7.2f} W  | Energy: {m['e1']:>6.2f} kWh")
                print(f"  Channel B (Ch 2): {m['v2']:>6.2f} V  | {m['i2']:>6.3f} A  | {m['p2']:>7.2f} W  | Energy: {m['e2']:>6.2f} kWh")
                print(f"  Combined System:  Total Power: {m['total_active']:>7.2f} W | Apparent: {m['total_apparent']:>7.2f} VA | Freq: {m['freq']:.2f} Hz")

            # 2. Append to CSV (Phase 1 = Ch A, Phase 2 = Ch B, Phase 3 = 0.0)
            with open(args.csv, mode='a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow([
                    now_str,
                    f"{m['v1']:.2f}",
                    f"{m['v2']:.2f}",
                    "0.00",
                    f"{m['i1']:.3f}",
                    f"{m['i2']:.3f}",
                    "0.00",
                    f"{m['p1']:.2f}",
                    f"{m['p2']:.2f}",
                    "0.00",
                    f"{m['freq']:.2f}",
                    f"{m['total_active']:.2f}",
                    f"{m['total_apparent']:.2f}"
                ])
                f.flush()
                try:
                    os.fsync(f.fileno())
                except Exception:
                    pass

            print(f"  [CSV] Synced -> {args.csv}")
            print("-" * 68)

            # 3. Publish to MQTT (if enabled)
            if mqtt_client:
                mqtt_payload = {
                    "timestamp": now_str,
                    "meter_ip": meter_ip,
                    "channel_a": {
                        "voltage": m['v1'],
                        "current": m['i1'],
                        "power": m['p1'],
                        "energy_kwh": m['e1']
                    },
                    "channel_b": {
                        "voltage": m['v2'],
                        "current": m['i2'],
                        "power": m['p2'],
                        "energy_kwh": m['e2']
                    },
                    "total_power": m['total_active'],
                    "total_apparent": m['total_apparent'],
                    "frequency": m['freq']
                }
                # Publish JSON state
                mqtt_client.publish(f"{args.mqtt_topic}/state", json.dumps(mqtt_payload))
                # Publish discrete channel topics for easy dashboard binding
                mqtt_client.publish(f"{args.mqtt_topic}/ch1/power", str(m['p1']))
                mqtt_client.publish(f"{args.mqtt_topic}/ch2/power", str(m['p2']))
                mqtt_client.publish(f"{args.mqtt_topic}/total_power", str(m['total_active']))

        except KeyboardInterrupt:
            print("\nUser stopped the data logger.")
            break
        except socket.timeout:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Socket timeout communicating with meter at {meter_ip}.")
            time.sleep(2)
        except Exception as e:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Acquisition error: {e}")
            traceback.print_exc()
            time.sleep(3)

        time.sleep(args.interval)

    # Cleanup on exit
    try:
        device.close()
    except Exception:
        pass
    if mqtt_client:
        try:
            mqtt_client.loop_stop()
            mqtt_client.disconnect()
        except Exception:
            pass
    print("Tuya WiFi Dual Meter session terminated cleanly.")


if __name__ == '__main__':
    main()
