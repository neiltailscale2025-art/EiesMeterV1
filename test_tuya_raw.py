#!/usr/bin/env python3
"""
EIES Tuya Meter Diagnostic Probe
Tests direct socket connectivity, protocol versions (3.3 vs 3.4 vs 3.5),
and attempts all query methods (status, updatedps, receive).
"""
import os
import sys
import json
import socket
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(SCRIPT_DIR, 'tuya_config.json')

try:
    import tinytuya
except ImportError:
    print("[ERROR] tinytuya not installed. Run: pip install tinytuya")
    sys.exit(1)

def run_diagnostics():
    print("=" * 60)
    print("⚡ EIES Tuya WiFi Dual Meter Quick Diagnostic Probe")
    print("=" * 60)

    # 1. Load config
    cfg = {}
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
            print(f"Loaded config from: {CONFIG_FILE}")
        except Exception as e:
            print(f"Could not read {CONFIG_FILE}: {e}")

    dev_id = cfg.get('device_id', os.getenv('TUYA_DEVICE_ID', ''))
    local_key = cfg.get('local_key', os.getenv('TUYA_LOCAL_KEY', ''))
    ip = cfg.get('ip', os.getenv('TUYA_IP', ''))

    if not dev_id:
        dev_id = input("Enter Device ID: ").strip()
    if not local_key:
        local_key = input("Enter Local Key: ").strip()

    print(f"\nTarget Device ID: {dev_id}")
    print(f"Target Local Key: {local_key[:4]}****{local_key[-4:]} (length: {len(local_key)})")

    # 2. IP Discovery / Ping
    if not ip:
        print("\nScanning local network for device IP via UDP broadcast...")
        devices = tinytuya.deviceScan(False, 5)
        for d_ip, d_info in devices.items():
            if d_info.get('gwId') == dev_id or d_info.get('id') == dev_id:
                ip = d_ip
                print(f"✅ Discovered IP: {ip}")
                break

    if not ip:
        ip = input("Enter Meter IP address manually (e.g. 192.168.1.150): ").strip()

    print(f"Target IP: {ip}")

    # 3. Test Raw TCP Socket on Port 6668
    print("\n--- 1. Testing TCP Port 6668 Connectivity ---")
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(3.0)
    try:
        s.connect((ip, 6668))
        print("✅ TCP Port 6668 is OPEN and reachable!")
        s.close()
    except Exception as e:
        print(f"❌ Cannot connect to {ip}:6668 -> {e}")
        print("Check if meter is powered on and connected to the same Wi-Fi subnet.")
        return

    # 4. Probe Protocol Versions (3.4, 3.3, 3.5, 3.1)
    protocols_to_test = [3.4, 3.3, 3.5, 3.1]
    successful_protocol = None
    dps_found = None

    print("\n--- 2. Probing Protocol Versions & Decryption ---")
    for ver in protocols_to_test:
        print(f"\n[Testing Protocol {ver}] ...")
        try:
            d = tinytuya.OutletDevice(dev_id=dev_id, address=ip, local_key=local_key, version=ver)
            d.set_socketPersistent(False)
            d.set_socketTimeout(4)

            # Test A: status()
            res = d.status()
            print(f"  status() response: {json.dumps(res)}")
            if res and isinstance(res, dict) and 'dps' in res:
                print(f"  🎉 SUCCESS with Protocol {ver} via status()!")
                successful_protocol = ver
                dps_found = res['dps']
                break

            # Test B: updatedps()
            print("  Trying updatedps() query...")
            up_res = d.updatedps()
            print(f"  updatedps() response: {json.dumps(up_res)}")
            if up_res and isinstance(up_res, dict) and 'dps' in up_res:
                print(f"  🎉 SUCCESS with Protocol {ver} via updatedps()!")
                successful_protocol = ver
                dps_found = up_res['dps']
                break

        except Exception as ex:
            print(f"  Exception with {ver}: {ex}")

    # 5. Test C: Listen for Unsolicited Push Messages
    if not dps_found:
        print("\n--- 3. Testing Passive Push Listener (5 seconds) ---")
        print("Some meters do not respond to polling; they push data every few seconds.")
        try:
            d = tinytuya.OutletDevice(dev_id=dev_id, address=ip, local_key=local_key, version=3.4)
            d.set_socketPersistent(True)
            d.set_socketTimeout(5)
            payload = d.receive()
            print(f"  Received raw packet: {json.dumps(payload)}")
            if payload and isinstance(payload, dict) and 'dps' in payload:
                print(f"  🎉 Captured DPS via push broadcast!")
                dps_found = payload['dps']
                successful_protocol = 3.4
            d.close()
        except Exception as ex:
            print(f"  Push listener result: {ex}")

    # 6. Summary & Recommendations
    print("\n" + "=" * 60)
    print(" DIAGNOSTIC SUMMARY")
    print("=" * 60)
    if dps_found:
        print(f"✅ WORKING PROTOCOL: {successful_protocol}")
        print("✅ RAW DPS DETECTED:")
        for dp, val in sorted(dps_found.items(), key=lambda x: int(x[0]) if x[0].isdigit() else 999):
            print(f"    DP {dp:>4}: {val} (type: {type(val).__name__})")

        # Save verified settings to tuya_config.json
        cfg['device_id'] = dev_id
        cfg['local_key'] = local_key
        cfg['ip'] = ip
        cfg['protocol'] = str(successful_protocol)
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, indent=2)
        print(f"\n✅ Automatically updated {CONFIG_FILE} with working settings!")
        print("Now you can run: ./run_tuya_reader.sh")
    else:
        print("❌ Could not decrypt valid DPS from the meter.")
        print("\nCommon reasons:")
        print("1. Local Key mismatch: If you re-paired the device in Smart Life,")
        print("   Tuya issued a NEW local_key! Re-check iot.tuya.com.")
        print("2. Smartphone app open: If Smart Life app is open on phone, it blocks")
        print("   the meter socket. Close the Smart Life app completely.")
        print("3. Meter firmware: Check if meter needs to be power-cycled.")
    print("=" * 60)

if __name__ == '__main__':
    run_diagnostics()
