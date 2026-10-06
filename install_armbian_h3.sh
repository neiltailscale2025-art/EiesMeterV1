#!/bin/bash
# ==============================================================================
# EIES Power Monitoring Platform — Armbian H3 Automated Installer
# Target: Armbian 26.8.1 Orange Pi One / PC (Allwinner H3 512MB/1GB RAM)
# Kernel: 6.18+ / Ubuntu Noble or Debian Minimal
# Eneftech Innovative Engineering Services • Tagbilaran City, Bohol
# ==============================================================================
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Detect user executing script
RUN_USER="${SUDO_USER:-$(whoami)}"
USER_HOME=$(eval echo "~$RUN_USER")

echo "========================================================================"
echo "⚡ EIES Power Monitoring Platform — Armbian H3 Installer"
echo "   Board:       Orange Pi One / PC (Allwinner H3)"
echo "   OS Image:    Armbian 26.8.1 (Resolute Minimal)"
echo "   Directory:   $PROJECT_DIR"
echo "   User:        $RUN_USER"
echo "========================================================================"
echo ""

# ------------------------------------------------------------------------------
# 1. Configure System Timezone (Asia/Manila, UTC+8)
# ------------------------------------------------------------------------------
echo ">>> [1/7] Configuring system timezone to Asia/Manila (UTC+8)..."
if command -v timedatectl >/dev/null 2>&1; then
    sudo timedatectl set-timezone Asia/Manila || true
    sudo timedatectl set-ntp true || true
else
    sudo ln -sf /usr/share/zoneinfo/Asia/Manila /etc/localtime || true
fi
echo "Timezone configured: $(date)"

# ------------------------------------------------------------------------------
# 2. Configure 2GB Swap (Mandatory for 512MB/1GB H3 boards during builds)
# ------------------------------------------------------------------------------
echo ">>> [2/7] Checking swap configuration..."
SWAP_TOTAL=$(free -m | awk '/Swap:/ {print $2}')
if [ -z "$SWAP_TOTAL" ] || [ "$SWAP_TOTAL" -lt 1000 ]; then
    echo "Creating 2GB swap file (/swapfile) to protect against OOM crashes..."
    sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile || true
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    fi
    echo "✅ 2GB Swap activated."
else
    echo "✅ Existing swap ($SWAP_TOTAL MB) is sufficient."
fi

# ------------------------------------------------------------------------------
# 3. Install System Packages & Node.js Runtime
# ------------------------------------------------------------------------------
echo ">>> [3/7] Updating package index and installing essential tools..."
sudo apt-get update -y
sudo apt-get install -y \
    curl git build-essential \
    python3 python3-pip python3-venv python3-dev \
    libffi-dev libssl-dev \
    nodejs npm \
    net-tools

echo "Node.js version: $(node -v 2>/dev/null || echo 'not found')"
echo "npm version:     $(npm -v 2>/dev/null || echo 'not found')"
echo "Python version:  $(python3 --version 2>/dev/null || echo 'not found')"

# ------------------------------------------------------------------------------
# 4. Set Up Python Virtual Environment
# ------------------------------------------------------------------------------
echo ">>> [4/7] Setting up Python virtual environment..."
# Ensure python3-venv and dev dependencies are installed
sudo apt-get install -y python3-venv python3-pip python3-dev python3-setuptools python3-wheel libffi-dev libssl-dev || true

# If venv directory is missing OR corrupted/missing activate script, rebuild it cleanly
if [ ! -f "venv/bin/activate" ] || [ ! -f "venv/bin/python3" ]; then
    echo "Creating clean virtual environment in ./venv..."
    rm -rf venv 2>/dev/null || true
    if ! python3 -m venv --system-site-packages venv 2>/dev/null; then
        if ! python3 -m venv venv 2>/dev/null; then
            echo "Falling back to --without-pip bootstrap..."
            python3 -m venv --without-pip --system-site-packages venv
            curl -sS https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py 2>/dev/null || wget -qO /tmp/get-pip.py https://bootstrap.pypa.io/get-pip.py
            ./venv/bin/python3 /tmp/get-pip.py
            rm -f /tmp/get-pip.py
        fi
    fi
fi

if [ ! -f "venv/bin/activate" ]; then
    echo "[ERROR] Could not create venv/bin/activate. Please run: sudo apt install -y python3-venv python3-full"
    exit 1
fi

source venv/bin/activate
pip install --upgrade pip 2>/dev/null || true
pip install tinytuya paho-mqtt pymodbus pyserial

# ------------------------------------------------------------------------------
# 5. Build Web Dashboard (Production Build)
# ------------------------------------------------------------------------------
echo ">>> [5/7] Installing Node dependencies and building frontend..."
# Increase Node memory limit for H3 ARMv7 build
export NODE_OPTIONS="--max-old-space-size=768"
npm install --no-audit --no-fund
if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
    npm run build
else
    echo "✅ Production web bundle (dist/) already compiled."
fi

# ------------------------------------------------------------------------------
# 6. Ensure File Permissions
# ------------------------------------------------------------------------------
echo ">>> [6/7] Setting permissions and initial CSV..."
chmod +x run_tuya_reader.sh run_reader.sh setup_venv.sh 2>/dev/null || true
if [ ! -f "meter_data.csv" ]; then
    echo "Timestamp,Phase 1 Voltage (V),Phase 2 Voltage (V),Phase 3 Voltage (V),Phase 1 Current (A),Phase 2 Current (A),Phase 3 Current (A),Phase 1 Power (W),Phase 2 Power (W),Phase 3 Power (W),Frequency (Hz),Total Active Power (W),Total Apparent Power (VA)" > meter_data.csv
fi
chmod 666 meter_data.csv 2>/dev/null || true

# Add user to dialout for RS485 USB adapters
sudo usermod -aG dialout "$RUN_USER" 2>/dev/null || true

# ------------------------------------------------------------------------------
# 7. Configure 24/7 Systemd Services
# ------------------------------------------------------------------------------
echo ">>> [7/7] Setting up automatic systemd services..."

# Service 1: Web Dashboard (Port 3000)
NODE_BIN=$(which node)
sudo tee /etc/systemd/system/eies-dashboard.service > /dev/null <<EOF
[Unit]
Description=EIES Power Monitoring Web Dashboard
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$NODE_BIN $PROJECT_DIR/server.js
Restart=always
RestartSec=5
Environment=PORT=3000
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Service 2: Tuya Meter Data Acquisition Engine
sudo tee /etc/systemd/system/tuya-meter.service > /dev/null <<EOF
[Unit]
Description=EIES Tuya WiFi Dual Meter 24/7 Logger
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$PROJECT_DIR
Environment="TZ=Asia/Manila"
ExecStart=$PROJECT_DIR/venv/bin/python3 $PROJECT_DIR/read_tuya_wifi_dual_meter.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Reload and enable services
sudo systemctl daemon-reload
sudo systemctl enable eies-dashboard.service
sudo systemctl restart eies-dashboard.service

# Check if tuya_config.json has valid keys before auto-starting logger
if [ -f "$PROJECT_DIR/tuya_config.json" ] && grep -q '"device_id"' "$PROJECT_DIR/tuya_config.json" && ! grep -q '"device_id": ""' "$PROJECT_DIR/tuya_config.json"; then
    sudo systemctl enable tuya-meter.service
    sudo systemctl restart tuya-meter.service
    echo "✅ tuya-meter.service enabled and started."
else
    echo "ℹ️  tuya_config.json needs your Device ID and Local Key."
    echo "    Run: ./run_tuya_reader.sh once to enter credentials, then start the service:"
    echo "    sudo systemctl enable --now tuya-meter.service"
fi

HOST_IP=$(hostname -I | awk '{print $1}')
[ -z "$HOST_IP" ] && HOST_IP="<ORANGE_PI_IP>"

echo ""
echo "========================================================================"
echo "🎉 Installation Complete on Orange Pi One / PC (Armbian H3)!"
echo "========================================================================"
echo "Web Dashboard Status:"
sudo systemctl is-active eies-dashboard.service && echo "  ✅ Web Dashboard is LIVE on Port 3000" || echo "  ⚠️ Web Dashboard starting..."
echo ""
echo "Access the dashboard on your phone, tablet, or PC:"
echo "  👉 http://${HOST_IP}:3000"
echo ""
echo "Useful Service Commands:"
echo "  Dashboard Logs:  sudo journalctl -u eies-dashboard.service -f"
echo "  Meter Logs:      sudo journalctl -u tuya-meter.service -f"
echo "  Restart Both:    sudo systemctl restart eies-dashboard tuya-meter"
echo "========================================================================"
