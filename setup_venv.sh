#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================================="
echo " Setting up Python Virtual Environment for Modbus Reader"
echo " EIES Power Monitoring Platform - Eneftech"
echo " Tagbilaran City, Bohol"
echo "=========================================================="

# Check if build tools and Python dev headers are present on Ubuntu/Debian
if [ ! -f /usr/include/python3*/Python.h ] 2>/dev/null; then
    echo "[INFO] Python.h header files or build tools not found. Installing..."
    if command -v sudo >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update -y && sudo apt-get install -y python3-dev libffi-dev libssl-dev build-essential python3-venv python3-pip python3-cffi python3-cryptography || true
    fi
fi

# 1. Create virtual environment (with system-site-packages to leverage pre-built ARMv7 cffi/cryptography)
if [ ! -d "venv" ] || [ ! -f "venv/bin/activate" ]; then
    echo "[1/3] Creating Python virtual environment in ./venv..."
    rm -rf venv 2>/dev/null || true
    if ! python3 -m venv --system-site-packages venv 2>/dev/null; then
        echo "[NOTICE] Standard venv with ensurepip failed."
        echo "Creating virtual environment using --without-pip..."
        python3 -m venv --without-pip --system-site-packages venv
        echo "Bootstrapping pip via get-pip.py..."
        curl -sS https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py || wget -qO /tmp/get-pip.py https://bootstrap.pypa.io/get-pip.py || true
        if [ -f /tmp/get-pip.py ]; then
            ./venv/bin/python3 /tmp/get-pip.py
            rm -f /tmp/get-pip.py
        else
            echo "Please run: sudo apt install -y python3-venv python3-pip python3-dev libffi-dev"
            exit 1
        fi
    fi
else
    echo "[1/3] Virtual environment ./venv already exists."
fi

# 2. Activate venv
echo "[2/3] Activating virtual environment..."
source venv/bin/activate

# 3. Install packages
echo "[3/3] Installing required packages from requirements.txt..."
pip install --upgrade pip 2>/dev/null || true
pip install -r requirements.txt

chmod +x read_meter.py read_tuya_wifi_dual_meter.py setup_venv.sh run_reader.sh run_tuya_reader.sh 2>/dev/null || true

echo ""
echo "=========================================================="
echo " [SUCCESS] Virtual environment configured!"
echo " Option 1 - Modbus RS485 Meter (USB/UART):"
echo "   ./run_reader.sh --port /dev/ttyUSB0"
echo ""
echo " Option 2 - Tuya WiFi Dual Meter (Local Tuya API + MQTT):"
echo "   ./run_tuya_reader.sh -d <DEVICE_ID> -k <LOCAL_KEY> -a <METER_IP>"
echo "   ./run_tuya_reader.sh --scan   # scan WiFi subnet"
echo "=========================================================="
