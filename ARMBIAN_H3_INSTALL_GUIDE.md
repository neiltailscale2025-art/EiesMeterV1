# Complete Guide: Deploying to Orange Pi One / PC (1GB H3) on Armbian 26.8.1 Minimal

This guide is specifically tailored for **`Armbian_26.8.1_Orangepione_resolute_current_6.18.44_minimal`** (Allwinner H3 32-bit ARMv7).

---

## 1. Initial Orange Pi Setup & First Login

When first booting Armbian Minimal:

1. Connect your Orange Pi to your local network via an Ethernet cable or WiFi.
2. Find the Orange Pi IP address from your router or using `nmap -sn 192.168.1.0/24`.
3. SSH into the Orange Pi:
   ```bash
   ssh root@<ORANGE_PI_IP>
   # Default password on fresh Armbian: 1234
   ```
4. Follow the prompt to set your new root password and optional regular user (e.g. `eies`).

---

## 2. Copy the App Files to Your Orange Pi

From your development computer, transfer the project directory to `/root/EiesMeterV1` on the Orange Pi:

```bash
# Run this from your computer inside the project directory:
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'venv' ./ root@<ORANGE_PI_IP>:/root/EiesMeterV1/
```
*(Or use `scp -r` if rsync is not installed).*

---

## 3. Run the Automated 1-Command Installer

SSH back into your Orange Pi:

```bash
ssh root@<ORANGE_PI_IP>
cd /root/EiesMeterV1
bash install_armbian_h3.sh
```

### What this script automatically does:
1. **Configures Asia/Manila (UTC+8) Timezone** and enables NTP sync.
2. **Creates a 2GB Swapfile (`/swapfile`)**: Essential on 512MB/1GB H3 boards to prevent Out-Of-Memory (OOM) crashes during Node/npm operations.
3. **Installs System Packages**: `git`, `curl`, `python3`, `python3-pip`, `python3-venv`, `python3-dev`, `build-essential`, `nodejs`, `npm`.
4. **Sets up Python Virtual Environment (`venv`)**: Installs `tinytuya`, `paho-mqtt`, `pymodbus`, `pyserial`.
5. **Installs Node Dependencies & Builds Dashboard**: Compiles the production frontend bundle into `dist/`.
6. **Creates & Enables 24/7 Systemd Services**:
   - `eies-dashboard.service` (Serves the Web UI on Port 3000 on boot)
   - `tuya-meter.service` (Acquires meter telemetry and logs to `meter_data.csv`)

---

## 4. Configure Your Tuya Meter Credentials

If you haven't entered your Tuya credentials yet:

```bash
cd /root/EiesMeterV1
./run_tuya_reader.sh
```
The script will prompt you for:
- **Device ID:** (e.g. `bf0123...`)
- **Local Key:** (16 characters)
- **Meter IP:** (e.g. `192.168.1.150` or press Enter to auto-discover)

It automatically saves your credentials to `tuya_config.json`. Once saved, enable the continuous 24/7 background service:

```bash
sudo systemctl enable --now tuya-meter.service
```

---

## 5. Verify Operation

### Check Service Status:
```bash
# Check Web Server
sudo systemctl status eies-dashboard.service

# Check Meter Logger
sudo systemctl status tuya-meter.service
```

### Stream Live Logs:
```bash
# Watch live telemetry streaming into CSV:
journalctl -u tuya-meter.service -f

# Watch web server requests:
journalctl -u eies-dashboard.service -f
```

---

## 6. Access the Dashboard

Open any web browser on your phone, tablet, or PC connected to the same WiFi/network:

👉 **`http://<ORANGE_PI_IP>:3000`**

### Summary of Useful Commands:
| Action | Command |
| :--- | :--- |
| **Restart Dashboard** | `sudo systemctl restart eies-dashboard` |
| **Restart Meter Logger** | `sudo systemctl restart tuya-meter` |
| **View Live CSV Rows** | `tail -f /root/EiesMeterV1/meter_data.csv` |
| **Check Port 3000** | `curl -I http://localhost:3000` |
