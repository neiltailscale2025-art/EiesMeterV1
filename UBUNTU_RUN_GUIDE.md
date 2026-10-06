# EIES Power Monitoring Platform — Ubuntu Linux Quick Start Guide
**Eneftech Innovative Engineering Services • Tagbilaran City, Bohol**

> 💡 **Running on an Orange Pi 1 / PC / One (1GB H3 ARM board)?** Check out the dedicated [ORANGE_PI_GUIDE.md](./ORANGE_PI_GUIDE.md) and automated installer `setup_orange_pi.sh`.

This guide walks you through connecting your USB-to-RS485 adapter, configuring permissions, setting up a Python virtual environment, reading Modbus RTU telemetry to `meter_data.csv`, and viewing the web dashboard.

---

## 1. Hardware Connections (USB-to-RS485)

Connect your USB-to-RS485 converter to the energy meter's communication terminal block:

| USB Converter Pin | Energy Meter RS-485 Terminal | Notes |
|:---|:---|:---|
| **A (D+)** | **Terminal A (+)** | Non-inverting line |
| **B (D-)** | **Terminal B (-)** | Inverting line |
| **GND** | **Shield / Common Ground** | Optional (recommended for long runs) |

> **Note:** If you experience read timeouts or CRC errors, try swapping **A** and **B** (some manufacturers invert labels).

---

## 2. Identify the Serial Device on Ubuntu

Plug the USB adapter into your Ubuntu machine and run:

```bash
# Check detected USB serial devices
ls -l /dev/ttyUSB* /dev/ttyACM* 2>/dev/null
```

Or view recent kernel messages:
```bash
dmesg | grep -E "ttyUSB|ttyACM|ch341|ftdi|cp210"
```

Common device paths:
- `/dev/ttyUSB0` (FTDI, CH340, CP2102 chips)
- `/dev/ttyACM0` (CDC-ACM devices)

---

## 3. Grant Serial Port Permissions (No `sudo` Required)

By default, Ubuntu restricts serial port access to members of the `dialout` group. Add your user account:

```bash
# Add current user to the dialout group
sudo usermod -aG dialout $USER

# Apply changes to your current shell session immediately
newgrp dialout
```

*(Alternatively, for a quick one-time test, you can run: `sudo chmod 666 /dev/ttyUSB0`)*

---

## 4. Set Up the Python Virtual Environment

Install Python virtual environment tools if not already present:

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip
```

Navigate to your project directory and set up the virtual environment:

### Option A: Using the Automated Script
```bash
bash setup_venv.sh
```

### Option B: Manual Setup
```bash
# 1. Create the virtual environment
python3 -m venv venv

# 2. Activate the virtual environment
source venv/bin/activate

# 3. Upgrade pip and install required packages
pip install --upgrade pip
pip install pymodbus>=3.6.0 pyserial>=3.5
```

---

## 5. Run the Meter Reader (`read_meter.py`)

With the virtual environment activated, run:

```bash
# Activate virtual environment (if not already active)
source venv/bin/activate

# Run the meter logger
python3 read_meter.py
```

Or simply execute the launcher script:
```bash
./run_reader.sh
```

### Expected Terminal Output:
```text
Initializing Serial Client on /dev/ttyUSB0...
Connecting to meter...
✅ Connected successfully!
--- Starting Data Collection from Slave 1 ---
Press Ctrl+C to stop.

--- 2026-09-30 16:32:00 ---
Voltage (V):  L1: 230.15  | L2: 229.40  | L3: 230.80 
Current (A):  L1: 4.25    | L2: 3.80    | L3: 4.10   
Power (W):    L1: 938.20  | L2: 830.45  | L3: 915.10 
System:       Freq: 50.02Hz | TotActive: 2683.75W | TotApparent: 2795.50VA
------------------------------------------------------------
```

Every reading is appended directly to `meter_data.csv` in real-time.

---

## 6. Launch the Web Dashboard

Open a second terminal window in the project folder to start the EIES web platform:

```bash
# Install frontend & server dependencies (if not already done)
npm install

# Start the application
npm run dev
```

Open your browser and navigate to:
```
http://localhost:3000
```

- **Live Monitor**: View real-time 3-phase voltages, currents, power distribution, and power factor.
- **Timeline & kWh**: View integrated energy consumption ($\Delta \text{kWh}$), consumption histograms, and Philippine Peso ($\text{₱}$) billing estimates.
- **Historical Analysis**: Export datasets in CSV or JSON.

---

## 7. How to Delete / Manage Old Records

You can clean or trim old records either directly from the **Web Dashboard** or via the **Ubuntu terminal**:

### Method 1: Via the Web Dashboard (Recommended)
1. Go to the **Timeline & kWh** tab in the dashboard.
2. Click the **Delete / Clear Records** button (next to *Export CSV*).
3. Select an option:
   - **Clear All Records (0 Rows)**: Cleans the file to start completely fresh.
   - **Delete > 24h Old**: Trims historical data to keep only the last 24 hours.
   - **Delete > 7 Days Old**: Keeps the past 7 days.
   - **Keep Latest 50 Records**: Retains only the 50 most recent records.
   - **Initial Cumulative kWh Offset**: Change the starting kWh offset (e.g. set to `0.00` or match your physical meter display).

### Method 2: Via Ubuntu Terminal

#### To clear all data rows while keeping the CSV header:
```bash
sed -i '2,$d' meter_data.csv
```

#### To delete the file completely (read_meter.py will create a fresh one automatically):
```bash
rm meter_data.csv
```

#### To keep only the header and the last 100 entries:
```bash
(head -n 1 meter_data.csv && tail -n 100 meter_data.csv) > /tmp/meter_trimmed.csv && mv /tmp/meter_trimmed.csv meter_data.csv
```

---

## 8. Optional: Run 24/7 as an Ubuntu `systemd` Service

To ensure the meter reader runs continuously in the background and restarts automatically on system reboot:

1. Create a systemd service file:
```bash
sudo nano /etc/systemd/system/eies-meter.service
```

2. Paste the following configuration (replace `/path/to/project` and `your_username` with your actual directory and username):
```ini
[Unit]
Description=EIES Modbus RTU Energy Meter Reader
After=network.target

[Service]
Type=simple
User=your_username
WorkingDirectory=/path/to/project
ExecStart=/path/to/project/venv/bin/python3 /path/to/project/read_meter.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

3. Enable and start the service:
```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to run on boot
sudo systemctl enable eies-meter.service

# Start the service now
sudo systemctl start eies-meter.service

# Check service status
sudo systemctl status eies-meter.service
```

4. View live logs anytime:
```bash
journalctl -u eies-meter.service -f
```

---

## 9. Access on the Open Web via Tailscale Funnel (Public HTTPS)

If you need to access this dashboard remotely from outside your local network (e.g., from an off-site laptop or smartphone):

1. **Run the automated setup script**:
   ```bash
   bash setup_tailscale_funnel.sh
   ```
2. Or run manually:
   ```bash
   # Install Tailscale (if not installed)
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up

   # Expose port 3000 to the open web with automated HTTPS
   sudo tailscale funnel --bg 3000

   # View your public URL:
   tailscale funnel status
   ```
3. Open the resulting `https://<node>.<tailnet>.ts.net` URL on any internet browser worldwide!

