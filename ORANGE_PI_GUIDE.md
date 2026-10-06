# EIES Power Monitoring Platform — Orange Pi 1 (1GB H3) Complete Guide
**Eneftech Innovative Engineering Services • Tagbilaran City, Bohol**

---

## ⚡ Can this app run on Orange Pi 1 (1GB RAM, Allwinner H3)?

**YES, absolutely 100%!** 

The **Orange Pi 1 / Orange Pi PC / Orange Pi One (Allwinner H3 Quad-Core Cortex-A7 @ 1.2GHz with 1GB DDR3 RAM)** is an **ideal, cost-effective industrial IoT gateway** for this platform.

### Resource Footprint Analysis:
| Process | CPU Usage | RAM Usage | Status on 1GB H3 |
|:---|:---|:---|:---|
| **Python Modbus Poller (`read_meter.py`)** | ~1% – 2% | ~25 MB – 35 MB | **Negligible load** |
| **Node.js Web & API Server (`server.js`)** | < 1% idle | ~35 MB – 45 MB | **Runs smoothly** |
| **Armbian Linux Base OS** | < 1% idle | ~110 MB – 150 MB | **Very lightweight** |
| **Total System Memory Required** | — | **~220 MB total** | **~780 MB FREE RAM available!** |

The 1GB RAM on the Allwinner H3 provides more than **3× to 4× the headroom** needed to run both the 24/7 background telemetry logger and the responsive web dashboard simultaneously.

---

## 1. Recommended Operating System

For the Orange Pi H3 (32-bit ARMv7 Cortex-A7):
- **Armbian Jammy (Ubuntu 22.04 LTS)** or **Armbian Bookworm (Debian 12)**
- Download official image from [Armbian for Orange Pi One / PC](https://www.armbian.com/orange-pi-one/)
- Flash to a good Class 10 / A1 MicroSD card (16GB or 32GB) using BalenaEtcher or Raspberry Pi Imager.

---

## 2. Initial Setup on Orange Pi

Connect your Orange Pi to your router via Ethernet or compatible USB Wi-Fi dongle, insert the SD card, and power it with a 5V/2A DC power supply.

SSH into your Orange Pi:
```bash
ssh root@<orange-pi-ip>
# Default Armbian password is '1234' on first boot (it will prompt you to set your own password and create a standard user, e.g. 'pi' or 'eneftech')
```

Update packages:
```bash
sudo apt update && sudo apt upgrade -y
```

---

## 3. Enable 1GB Swap (Recommended for Building on ARMv7)

Armbian includes `zram` by default, but adding a 1GB swapfile ensures you never run out of memory when compiling or updating npm packages:

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 4. Install Node.js & Python 3 on Orange Pi

Install build essentials, Python 3, and Node.js LTS:

```bash
# 1. Install Python 3, venv, and git
sudo apt install -y python3 python3-pip python3-venv git curl build-essential

# 2. Clean up any broken NodeSource repository if previously attempted:
sudo rm -f /etc/apt/sources.list.d/nodesource.list /etc/apt/keyrings/nodesource.gpg

# 3. Install Node.js & npm for ARM 32-bit (armhf) directly from official distribution repos:
sudo apt update
sudo apt install -y nodejs npm

# Verify versions:
node -v
npm -v
python3 -V
```

---

## 5. Clone or Copy the Project

Copy the project repository to your home directory:
```bash
cd ~
# If using git:
# git clone <your-repo-url> eies-meter
# Or copy the files into:
cd ~/eies-meter
```

### Install Dependencies:

```bash
# Set up Python virtual environment & pymodbus:
bash setup_venv.sh

# Install Node dependencies & build production frontend:
npm install
npm run build
```

---

## 6. RS-485 Hardware Options on Orange Pi H3

You have two simple ways to connect your energy meter:

### Option A: USB-to-RS485 Converter (Recommended / Easiest)
Plug any standard CH340, CP2102, or FTDI USB-to-RS485 dongle into any of the Orange Pi's USB ports:
- Device path: `/dev/ttyUSB0`
- Grant non-root access:
  ```bash
  sudo usermod -aG dialout $USER
  sudo chmod 666 /dev/ttyUSB0
  ```

### Option B: On-board 40-Pin GPIO Hardware UART (Zero USB Dongles Needed)
The Allwinner H3 has built-in hardware UARTs broken out on the 40-pin header:
- **UART1**: Pin 8 (TX: `PA13`), Pin 10 (RX: `PA14`) &rarr; Device: `/dev/ttyS1`
- **UART2**: Pin 11 (TX: `PA0`), Pin 13 (RX: `PA1` / Pin 15 RTS) &rarr; Device: `/dev/ttyS2`

To enable UART1/2 on Armbian:
1. Run `sudo armbian-config`
2. Navigate to **System** &rarr; **Hardware**
3. Select `uart1` or `uart2`, save and reboot.
4. Wire a cheap TTL-to-RS485 module (e.g. MAX485 auto-directional board) to 3.3V, GND, TX, and RX.

---

## 7. Test Running the Meter Logger

Test the connection directly from terminal:

```bash
# With USB adapter:
./run_reader.sh --port /dev/ttyUSB0

# Or with GPIO UART:
./run_reader.sh --port /dev/ttyS1
```

You should see:
```text
Initializing Serial Client on /dev/ttyUSB0...
Connecting to meter...
✅ Connected successfully!
--- Starting Data Collection from Slave 1 ---
--- 2026-10-01 18:30:00 ---
Voltage (V):  L1: 231.20 | L2: 230.15 | L3: 229.80
Current (A):  L1: 4.10   | L2: 3.90   | L3: 4.25
Power (W):    L1: 915.20 | L2: 865.10 | L3: 940.30
System:       Freq: 50.01Hz | TotActive: 2720.60W | TotApparent: 2835.40VA
```

---

## 8. Test the Web Dashboard

Start the Express web server:
```bash
npm start
```
You will see:
```text
Server running at http://localhost:3000
Watching for data at: /home/pi/eies-meter/meter_data.csv
```

Now from **any phone, tablet, or laptop on the same Wi-Fi / LAN network**, open:
```
http://<ORANGE_PI_IP_ADDRESS>:3000
```
*(To find your Orange Pi's IP address, run: `hostname -I`)*

---

## 9. 24/7 Autostart on Boot (Systemd Services)

Set up two lightweight background services so the Orange Pi automatically starts monitoring on power-up and restarts if power drops.

### Service 1A: Modbus RS485 Meter Poller (`/etc/systemd/system/eies-meter.service`)
```bash
sudo nano /etc/systemd/system/eies-meter.service
```
Paste (adjust `/home/pi/eies-meter` and `User=pi` to match your user):
```ini
[Unit]
Description=EIES Modbus RTU Energy Meter Poller
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/eies-meter
ExecStart=/home/pi/eies-meter/venv/bin/python3 /home/pi/eies-meter/read_meter.py --port /dev/ttyUSB0 --interval 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Service 1B (Alternative): Tuya WiFi Dual Meter (`/etc/systemd/system/tuya-meter.service`)
If you are using a Tuya WiFi Dual Clamp or DIN Rail meter (PJ-1203A / PC321-TY / Tongou) instead of Modbus RS-485:
```bash
sudo nano /etc/systemd/system/tuya-meter.service
```
Paste:
```ini
[Unit]
Description=EIES Tuya WiFi Dual Meter Local Telemetry Acquisition
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/eies-meter
ExecStart=/home/pi/eies-meter/venv/bin/python3 /home/pi/eies-meter/read_tuya_wifi_dual_meter.py -d "YOUR_DEVICE_ID" -k "YOUR_LOCAL_KEY" -a "192.168.1.150" --interval 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Service 2: Web Dashboard Server (`/etc/systemd/system/eies-web.service`)
```bash
sudo nano /etc/systemd/system/eies-web.service
```
Paste:
```ini
[Unit]
Description=EIES Power Monitoring Web Dashboard
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/eies-meter
ExecStart=/usr/bin/node /home/pi/eies-meter/server.js
Restart=always
RestartSec=5
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

### Enable and Start Services:
```bash
sudo systemctl daemon-reload

# For Modbus RS485:
sudo systemctl enable --now eies-meter.service eies-web.service

# Or for Tuya WiFi Dual Meter:
# sudo systemctl enable --now tuya-meter.service eies-web.service
```

### Check Status & View Live Logs:
```bash
# Check running status:
sudo systemctl status eies-meter.service  # or tuya-meter.service
sudo systemctl status eies-web.service

# Watch live telemetry streaming to logs:
journalctl -u eies-meter.service -f
# Or for Tuya:
# journalctl -u tuya-meter.service -f
```

---

## 9B. Web App Password Protection
The web application features built-in cryptographic SHA-256 hashed password protection for restricted engineering features:
- **Tuya WiFi Dual Meter Tab**
- **Open Web and Funnel Tab**
- **Hex Decoder & CRC Tab**
- **Python Script Gen Tab**
- **Delete / Clear Records Option**

**Engineer Passcode:** `Eies2023`
*(Stored securely as SHA-256 hash `22d9d68d9581580d46dcfeda8ecf56bb20d14897b87b00917d738c861d1381fe`)*

---

## 10. SD Card Endurance Tips for 24/7 Logging

Writing continuous telemetry every second to an SD card can cause write wear over years. Here is how to keep your Orange Pi running for years:
1. **Armbian RAMLOG (Built-in)**: Armbian automatically stores system logs in RAM and flushes periodically, protecting the SD card.
2. **Poll Interval**: Set `--interval 2` or `--interval 5` in the systemd service. A 2 to 5-second interval gives great precision while reducing SD card writes by 50%–80%.
3. **Built-in Record Trimming**: Use the dashboard's **Delete / Clear Records** modal in the Timeline tab to keep the CSV file compact (e.g. keeping only the last 7 days or 30 days of data).

---

## 11. Open Web Access via Tailscale Funnel (Public HTTPS)

To access your Orange Pi dashboard **anywhere in the world** over the public internet without port forwarding or static IPs:

### Quick Automated Setup:
```bash
bash setup_tailscale_funnel.sh
```

### Or Manual Setup:
1. **Install Tailscale**:
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   ```
2. **Authenticate your Orange Pi**:
   ```bash
   sudo tailscale up
   ```
3. **Ensure Funnel is enabled in your Tailscale Admin Console** (`login.tailscale.com/admin/acls`):
   ```json
   "nodeAttrs": [
     {
       "target": ["autogroup:member"],
       "attr": ["funnel"]
     }
   ]
   ```
4. **Start the Funnel on Port 3000**:
   ```bash
   sudo tailscale funnel --bg 3000
   ```
5. **Get your live public URL**:
   ```bash
   tailscale funnel status
   ```
   *Example: `https://orangepi-meter.tail1234.ts.net`*

You can now open that HTTPS link on any smartphone, tablet, or laptop worldwide to monitor your energy meter in real time!

