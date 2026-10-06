#!/bin/bash
# ==============================================================================
# EIES Power Monitoring Platform — Automated Setup for Orange Pi 1 (1GB H3)
# Eneftech Innovative Engineering Services • Tagbilaran City, Bohol
# ==============================================================================
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
CURRENT_USER="${SUDO_USER:-$USER}"

echo "===================================================================="
echo "⚡ Orange Pi 1 / PC (Allwinner H3 1GB RAM) Automated Setup Script"
echo "   EIES Modbus RTU Power Monitoring Platform"
echo "===================================================================="
echo "Detected directory: $PROJECT_DIR"
echo "Detected user:      $CURRENT_USER"
echo ""

# 1. System updates & essential packages (including Python C-headers for armhf wheel compilation)
echo "[1/6] Installing system tools, Python 3 dev headers, and build tools..."
sudo apt-get update -y
sudo apt-get install -y python3 python3-pip python3-venv python3-dev libffi-dev libssl-dev build-essential git curl python3-cffi python3-cryptography

# 2. Check and configure swap (1GB recommended for compiling npm packages on ARMv7)
echo "[2/6] Checking swap configuration for 1GB H3 board..."
SWAP_TOTAL=$(free -m | awk '/Swap:/ {print $2}')
if [ "$SWAP_TOTAL" -lt 500 ]; then
    echo "Creating 1GB swapfile to prevent OOM errors during builds..."
    sudo fallocate -l 1G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=1024
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    fi
    echo "✅ 1GB Swap configured successfully."
else
    echo "✅ Existing swap ($SWAP_TOTAL MB) is sufficient."
fi

# 3. Verify or install Node.js (with ARMv7 / armhf 32-bit support)
echo "[3/6] Verifying Node.js runtime..."
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    ARCH=$(dpkg --print-architecture 2>/dev/null || uname -m)
    echo "Detected architecture: $ARCH"

    # Clean up any partial/failed NodeSource repository entry
    sudo rm -f /etc/apt/sources.list.d/nodesource.list /etc/apt/keyrings/nodesource.gpg 2>/dev/null || true

    if [ "$ARCH" = "armhf" ] || [ "$ARCH" = "armv7l" ]; then
        echo "Detected 32-bit ARM (armhf/armv7l). NodeSource dropped armhf in v20+."
        echo "Installing Node.js & npm directly from official distribution repositories..."
        sudo apt-get update -y
        sudo apt-get install -y nodejs npm
    else
        echo "Installing Node.js via NodeSource..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null || true
        sudo apt-get install -y nodejs npm 2>/dev/null || sudo apt-get install -y nodejs
    fi
else
    echo "✅ Node.js $(node -v) and npm $(npm -v 2>/dev/null || echo 'installed') are already available."
fi

# 4. Set up Python virtual environment and dependencies
echo "[4/6] Setting up Python virtual environment (pymodbus & pyserial)..."
bash setup_venv.sh

# 5. Grant dialout serial permissions to user & set executable scripts
echo "[5/6] Granting serial port permissions and making scripts executable..."
sudo usermod -aG dialout "$CURRENT_USER" || true
sudo usermod -aG tty "$CURRENT_USER" || true
chmod +x run_reader.sh run_tuya_reader.sh setup_venv.sh setup_orange_pi.sh setup_tailscale_funnel.sh read_meter.py read_tuya_wifi_dual_meter.py 2>/dev/null || true

# 6. Install Node dependencies and build static web bundle
echo "[6/6] Building production web dashboard..."
npm install
npm run build

# Summary
HOST_IP=$(hostname -I | awk '{print $1}' || echo "localhost")

echo ""
echo "===================================================================="
echo "🎉 Setup Complete on Orange Pi H3!"
echo "===================================================================="
echo "To test run manually:"
echo "  Option A (Modbus RS485):  ./run_reader.sh --port /dev/ttyUSB0"
echo "  Option B (Tuya WiFi):     ./run_tuya_reader.sh -d <DEV_ID> -k <KEY> -a <IP>"
echo "  Start Web Server:         npm start"
echo ""
echo "Access from any device on your LAN:"
echo "  👉 http://${HOST_IP}:3000"
echo ""
echo "To install as 24/7 background systemd services:"
echo "  See: ORANGE_PI_GUIDE.md"
echo "===================================================================="
