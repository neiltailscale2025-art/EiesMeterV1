# Tuya WiFi Dual Meter Data Acquisition & Local Tuya API Guide
**EIES Power Monitoring Platform — Eneftech Innovative Engineering Services**
*Tagbilaran City, Bohol*

---

## 1. Overview & Strategy

This system provides **100% local data acquisition** for Tuya WiFi Dual Channel / Dual Clamp Energy Meters (such as **PJ-1203A**, **PC321-TY**, **Tongou 2-Channel DIN Rail Smart Meters**, **WDYK**, and **EARU Dual Meters**) using the **Tuya Local API** over your local WiFi network.

### Why Local Tuya?
- **Zero Cloud Latency / Zero Subscription:** All telemetry is read directly from the meter via local TCP socket on port `6668` (or `6667`) inside your LAN.
- **Works Offline:** Continues reading and logging even if internet connectivity goes down.
- **Direct Web App Compatibility:** Data is logged directly into `meter_data.csv` using the exact 13-column schema. Channel A maps to Phase 1, Channel B maps to Phase 2, and Phase 3 is set to 0.0. The web app's **Timeline & kWh Dashboard** and **Live Monitor** instantly plot both channels in real time.
- **Built-in MQTT Gateway:** Can simultaneously stream telemetry to **Home Assistant**, **Mosquitto**, or **Node-RED** with Home Assistant MQTT auto-discovery.

---

## 2. Hardware Compatibility

The Python acquisition script `read_tuya_wifi_dual_meter.py` supports:
1. **Bi-directional Dual Clamp Meters (PJ-1203A / PC321-TY / WDYK)**:
   - Measures Grid & Solar or Main & Inverter channels independently.
   - Forward/Reverse power, Power Factor, and Frequency.
2. **Tongou 2-Channel DIN Rail Smart Energy Meters**:
   - Independent voltage, current, power, and cumulative kWh per channel.
3. **Tuya 2-Gang Energy Metering Breakers / Sockets**:
   - Dual relay switching with power telemetry.
4. **Custom Tuya Multi-Meters**:
   - Fully customizable DP flags (`--dp-v1`, `--dp-i1`, `--dp-p1`, `--dp-v2`, `--dp-i2`, `--dp-p2`, etc.).

---

## 3. How to Obtain Tuya `device_id` and `local_key`

Tuya devices require a 16-character encryption key (`local_key`) for local AES-128-ECB/GCM socket communication. You only need to obtain this once; it remains unchanged unless the device is re-paired.

### Method A: Automated via `tinytuya wizard` (Recommended & Easiest)
1. Install TinyTuya tools:
   ```bash
   pip install tinytuya
   ```
2. Run the interactive setup wizard:
   ```bash
   python3 -m tinytuya wizard
   ```
3. Enter your Tuya Developer API credentials (free at [iot.tuya.com](https://iot.tuya.com)).
4. The wizard will automatically download a file named `devices.json` containing the **Device ID**, **Local Key**, and **MAC address** for every device paired with your Smart Life / Tuya app!

### Method B: Via Tuya IoT Developer Platform (Web Browser)
1. Log in to [iot.tuya.com](https://iot.tuya.com) (free developer account).
2. Go to **Cloud** -> **Development** -> Select your Project.
3. Go to **Cloud** -> **API Explorer** -> **Smart Home Device System** -> **Device Control** -> **Get Device Details**.
4. Enter your meter's **Device ID** (found in the Smart Life app under Device Info).
5. Click **Submit Request**.
6. The JSON response will show `"local_key": "xxxxxxxxxxxxxxxx"`.

---

## 4. Quick Start & Execution

### 1. Set Up Environment
```bash
# Set up Python virtual environment and dependencies
bash setup_venv.sh
```

### 2. Discover Meter IP on Local WiFi
```bash
# Scan local network via UDP broadcast to find the meter's IP
./run_tuya_reader.sh --scan
```

### 3. Run Data Acquisition
```bash
# Basic run with Device ID, Local Key, and IP
./run_tuya_reader.sh -d "bf632901a1b2c3d4e5" -k "a1b2c3d4e5f60718" -a "192.168.1.150"
```

### 4. Run with MQTT Publishing
```bash
./run_tuya_reader.sh \
  -d "bf632901a1b2c3d4e5" \
  -k "a1b2c3d4e5f60718" \
  -a "192.168.1.150" \
  --mqtt-broker "192.168.1.200" \
  --mqtt-port 1883 \
  --mqtt-topic "tuya/dual_meter" \
  --ha-discovery
```

### 5. Inspect Raw Data Points (DPs)
To see your meter's raw manufacturer DP registers:
```bash
./run_tuya_reader.sh -d "bf632901a1b2c3d4e5" -k "a1b2c3d4e5f60718" -a "192.168.1.150" --dump-dps
```

---

## 5. Standard Tuya Dual Meter DP Maps

### PJ-1203A / PC321-TY Dual Clamp Bi-directional Meter:
| Parameter | DP ID | Raw Unit | Scaled Value |
|:---|:---:|:---:|:---|
| **Channel A Voltage** | `111` | 0.1 V | e.g. 2315 -> 231.5 V |
| **Channel A Current** | `112` | 0.001 A (mA) | e.g. 4250 -> 4.250 A |
| **Channel A Power** | `113` | 0.1 W | e.g. 9830 -> 983.0 W |
| **Channel A Power Factor** | `114` | 0.01 | e.g. 98 -> 0.98 |
| **Channel A Energy** | `115` | 0.01 kWh | e.g. 1540 -> 15.40 kWh |
| **Channel B Voltage** | `121` | 0.1 V | e.g. 2310 -> 231.0 V |
| **Channel B Current** | `122` | 0.001 A (mA) | e.g. 2100 -> 2.100 A |
| **Channel B Power** | `123` | 0.1 W | e.g. 4850 -> 485.0 W |
| **Channel B Power Factor** | `124` | 0.01 | e.g. 99 -> 0.99 |
| **Channel B Energy** | `125` | 0.01 kWh | e.g. 820 -> 8.20 kWh |
| **Frequency** | `131` | 0.1 Hz | e.g. 500 -> 50.0 Hz |
| **Total Active Power** | `132` | 0.1 W | e.g. 14680 -> 1468.0 W |

### Tongou 2-Channel DIN Rail Smart Meter:
| Parameter | DP ID | Raw Unit | Scaled Value |
|:---|:---:|:---:|:---|
| **Channel 1 Current** | `18` | mA | e.g. 3500 -> 3.50 A |
| **Channel 1 Power** | `19` | 0.1 W | e.g. 8050 -> 805.0 W |
| **Channel 1 Voltage** | `20` | 0.1 V | e.g. 2300 -> 230.0 V |
| **Channel 2 Current** | `21` | mA | e.g. 1800 -> 1.80 A |
| **Channel 2 Power** | `22` | 0.1 W | e.g. 4140 -> 414.0 W |
| **Channel 2 Voltage** | `23` | 0.1 V | e.g. 2300 -> 230.0 V |
| **Channel 1 Energy** | `101` | 0.01 kWh | e.g. 3400 -> 34.00 kWh |
| **Channel 2 Energy** | `102` | 0.01 kWh | e.g. 1200 -> 12.00 kWh |

---

## 6. Running 24/7 as a Background Service (systemd)

On Ubuntu Linux or Orange Pi H3:

1. Create a systemd service file:
   ```bash
   sudo nano /etc/systemd/system/tuya-meter.service
   ```

2. Paste the following configuration (adjust path and credentials):
   ```ini
   [Unit]
   Description=EIES Tuya WiFi Dual Meter Data Acquisition
   After=network.target

   [Service]
   Type=simple
   User=root
   WorkingDirectory=/home/orangepi/eies-meter
   ExecStart=/home/orangepi/eies-meter/venv/bin/python3 read_tuya_wifi_dual_meter.py \
       -d "YOUR_DEVICE_ID" \
       -k "YOUR_LOCAL_KEY" \
       -a "192.168.1.150" \
       --interval 2.0 \
       --csv meter_data.csv
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

3. Enable and start:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable tuya-meter.service
   sudo systemctl start tuya-meter.service
   sudo systemctl status tuya-meter.service
   ```

4. Check live service logs:
   ```bash
   journalctl -u tuya-meter.service -f
   ```

---

## 7. MQTT Topics & Integration

When `--mqtt-broker` is enabled, the script publishes:
- **`tuya/dual_meter/state`**: Complete JSON payload with timestamp, Channel A, Channel B, total power, apparent power, and frequency.
- **`tuya/dual_meter/ch1/power`**: Float string of Channel 1 power in Watts.
- **`tuya/dual_meter/ch2/power`**: Float string of Channel 2 power in Watts.
- **`tuya/dual_meter/total_power`**: Float string of Combined Active Power in Watts.
- **`homeassistant/sensor/...`**: Auto-discovery configs when `--ha-discovery` is passed.
