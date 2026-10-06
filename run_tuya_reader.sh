#!/bin/bash
# ==============================================================================
# EIES Tuya WiFi Dual Meter Reader Runner
# Eneftech Innovative Engineering Services • Tagbilaran City, Bohol
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "[INFO] Python virtual environment not found. Setting up..."
    bash setup_venv.sh
fi

# 2. Activate virtual environment
source venv/bin/activate

# 3. Ensure tinytuya and paho-mqtt are present
if ! python3 -c "import tinytuya" 2>/dev/null; then
    echo "[INFO] Installing Tuya local API dependencies (tinytuya, paho-mqtt)..."
    pip install tinytuya paho-mqtt
fi

# 4. Set Philippine Standard Time (UTC+8) and run python reader
export TZ="Asia/Manila"
exec python3 read_tuya_wifi_dual_meter.py "$@"
