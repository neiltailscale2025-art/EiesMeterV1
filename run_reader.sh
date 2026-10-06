#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Virtual environment not detected. Running setup..."
    bash setup_venv.sh
fi

# Activate and run
source venv/bin/activate
exec python3 read_meter.py "$@"
