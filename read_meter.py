#!/usr/bin/env python3
"""
Pymodbus Asynchronous Client for Meter Reading (Final Fixed Version)
--------------------------------------------------------------------------
"""
import argparse
import asyncio
import csv
import os
import sys
import traceback
from datetime import datetime

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None

def get_now_timestamp(tz_name="Asia/Manila"):
    """Returns formatted local timestamp honoring configured timezone (defaults to Philippine Time UTC+8)."""
    if ZoneInfo:
        try:
            return datetime.now(ZoneInfo(tz_name)).strftime('%Y-%m-%d %H:%M:%S')
        except Exception:
            pass
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')

# --- Pymodbus Imports ---
from pymodbus.client import AsyncModbusSerialClient
from pymodbus import ModbusException, pymodbus_apply_logging_config
from pymodbus.constants import Endian
from pymodbus.payload import BinaryPayloadDecoder

# --- Configuration & Argument Parsing ---
def parse_arguments():
    parser = argparse.ArgumentParser(description="EIES Modbus RTU Energy Meter Reader (Ubuntu & Orange Pi H3)")
    parser.add_argument('--port', type=str, default='/dev/ttyUSB0',
                        help='Serial port device path (e.g. /dev/ttyUSB0, /dev/ttyACM0, or /dev/ttyS1 for Orange Pi GPIO UART)')
    parser.add_argument('--baud', type=int, default=9600,
                        help='Baud rate (default: 9600)')
    parser.add_argument('--parity', type=str, choices=['N', 'E', 'O'], default='N',
                        help='Parity: N (None), E (Even), O (Odd) (default: N)')
    parser.add_argument('--stopbits', type=int, choices=[1, 2], default=1,
                        help='Stop bits (default: 1)')
    parser.add_argument('--slave', type=int, default=1,
                        help='Modbus Slave ID (default: 1)')
    parser.add_argument('--interval', type=float, default=1.0,
                        help='Polling interval in seconds (default: 1.0)')
    parser.add_argument('--csv', type=str, default='meter_data.csv',
                        help='Target CSV file path (default: meter_data.csv)')
    return parser.parse_args()

args = parse_arguments()
PORT = args.port
BAUDRATE = args.baud
PARITY = args.parity
STOPBITS = args.stopbits
SLAVE_ID = args.slave
POLL_INTERVAL = args.interval
CSV_FILE = args.csv
script_dir = os.path.dirname(os.path.abspath(__file__))
if not os.path.isabs(CSV_FILE):
    CSV_FILE = os.path.abspath(os.path.join(script_dir, CSV_FILE))

# Logging: set to "ERROR" to keep console clean, or "DEBUG" to troubleshoot
pymodbus_apply_logging_config("ERROR")

def init_csv():
    """Initialize CSV file with headers if it doesn't exist."""
    if not os.path.exists(CSV_FILE):
        with open(CSV_FILE, mode='w', newline='') as file:
            writer = csv.writer(file)
            writer.writerow([
                'Timestamp', 
                'Phase 1 Voltage (V)', 'Phase 2 Voltage (V)', 'Phase 3 Voltage (V)',
                'Phase 1 Current (A)', 'Phase 2 Current (A)', 'Phase 3 Current (A)',
                'Phase 1 Power (W)', 'Phase 2 Power (W)', 'Phase 3 Power (W)',
                'Frequency (Hz)', 'Total Active Power (W)', 'Total Apparent Power (VA)'
            ])
        print(f"Created new CSV file: {CSV_FILE}")

async def reading_loop(client):
    """Continuous reading loop."""
    print(f"--- Starting Data Collection from Slave {SLAVE_ID} ---")
    print("Press Ctrl+C to stop.\n")
    
    init_csv()
    
    while True:
        try:
            # Read Input Registers (Function Code 04)
            # Address 0, count 60 (Adjust if your meter map is different)
            rr = await client.read_input_registers(0, count=60, slave=SLAVE_ID)

            if rr.isError():
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Modbus Error: {rr}")
            else:
                # Helper to extract Float32 from the registers list
                def decode_slice(start_reg, count=2):
                    slice_regs = rr.registers[start_reg : start_reg + count]
                    decoder = BinaryPayloadDecoder.fromRegisters(
                        slice_regs, 
                        byteorder=Endian.BIG,  # FIXED: Must be uppercase
                        wordorder=Endian.BIG   # Try Endian.LITTLE if values are scrambled
                    )
                    return decoder.decode_32bit_float()

                # --- 1. Decode Values ---
                v1 = decode_slice(0)
                v2 = decode_slice(2)
                v3 = decode_slice(4)
                
                i1 = decode_slice(6)
                i2 = decode_slice(8)
                i3 = decode_slice(10)
                
                p1 = decode_slice(12)
                p2 = decode_slice(14)
                p3 = decode_slice(16)
                
                freq = decode_slice(48)
                total_active_p = decode_slice(50)
                total_apparent_p = decode_slice(54)

                timestamp = get_now_timestamp()

                # --- 2. Display All Values (Console) ---
                print(f"--- {timestamp} ---")
                print(f"Voltage (V):  L1: {v1:<7.2f} | L2: {v2:<7.2f} | L3: {v3:<7.2f}")
                print(f"Current (A):  L1: {i1:<7.2f} | L2: {i2:<7.2f} | L3: {i3:<7.2f}")
                print(f"Power (W):    L1: {p1:<7.2f} | L2: {p2:<7.2f} | L3: {p3:<7.2f}")
                print(f"System:       Freq: {freq:.2f}Hz | TotActive: {total_active_p:.2f}W | TotApparent: {total_apparent_p:.2f}VA")
                print("-" * 60)

                # --- 3. Save to CSV ---
                with open(CSV_FILE, mode='a', newline='') as file:
                    writer = csv.writer(file)
                    writer.writerow([
                        timestamp,
                        f"{v1:.2f}", f"{v2:.2f}", f"{v3:.2f}",
                        f"{i1:.2f}", f"{i2:.2f}", f"{i3:.2f}",
                        f"{p1:.2f}", f"{p2:.2f}", f"{p3:.2f}",
                        f"{freq:.2f}", f"{total_active_p:.2f}", f"{total_apparent_p:.2f}"
                    ])

        except ModbusException as exc:
            print(f"Modbus Library Exception: {exc}")
        except Exception as e:
            print(f"General Error: {e}")
            traceback.print_exc()
            
        # Wait POLL_INTERVAL seconds before next read
        await asyncio.sleep(POLL_INTERVAL)

async def run_async_client():
    """Run async client setup and connection."""
    print(f"Initializing Serial Client on {PORT}...")
    
    # Initialize Client
    client = AsyncModbusSerialClient(
        port=PORT,
        baudrate=BAUDRATE,
        bytesize=8,
        parity=PARITY,
        stopbits=STOPBITS,
        timeout=1, 
    )

    print("Connecting to meter...")
    await client.connect()
    
    if client.connected:
        print("✅ Connected successfully!")
        try:
            await reading_loop(client)
        except asyncio.CancelledError:
            print("Loop cancelled.")
        finally:
            print("Closing connection...")
            client.close()
    else:
        print("❌ Failed to connect to serial port.")
        print(f"Check: ls -l {PORT} and permissions (sudo chmod 666 {PORT}).")

if __name__ == "__main__":
    try:
        asyncio.run(run_async_client())
    except KeyboardInterrupt:
        print("\nUser stopped the script.")
