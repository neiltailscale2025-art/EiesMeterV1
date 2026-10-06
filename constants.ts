import { RegisterDefinition } from './types';

/**
 * Register definitions extracted from the meter map (modbus.pdf & 3-phase parameter map):
 * - Function Code 04H: Read Input Registers (32-bit Float Big Endian IEEE-754)
 */

export const REGISTER_MAP: RegisterDefinition[] = [
  { address: 0x0000, hexAddress: '0x0000', name: 'Phase 1 Voltage', unit: 'V', description: 'Phase 1 line to neutral voltage', functionCode: '04H', dataType: 'Float32', category: 'instantaneous', readOnly: true },
  { address: 0x0002, hexAddress: '0x0002', name: 'Phase 2 Voltage', unit: 'V', description: 'Phase 2 line to neutral voltage', functionCode: '04H', dataType: 'Float32', category: 'instantaneous', readOnly: true },
  { address: 0x0004, hexAddress: '0x0004', name: 'Phase 3 Voltage', unit: 'V', description: 'Phase 3 line to neutral voltage', functionCode: '04H', dataType: 'Float32', category: 'instantaneous', readOnly: true },
  { address: 0x0006, hexAddress: '0x0006', name: 'Phase 1 Current', unit: 'A', description: 'Phase 1 current', functionCode: '04H', dataType: 'Float32', category: 'instantaneous', readOnly: true },
  { address: 0x0008, hexAddress: '0x0008', name: 'Phase 2 Current', unit: 'A', description: 'Phase 2 current', functionCode: '04H', dataType: 'Float32', category: 'instantaneous', readOnly: true },
  { address: 0x000A, hexAddress: '0x000A', name: 'Phase 3 Current', unit: 'A', description: 'Phase 3 current', functionCode: '04H', dataType: 'Float32', category: 'instantaneous', readOnly: true },
  { address: 0x000C, hexAddress: '0x000C', name: 'Phase 1 Power', unit: 'W', description: 'Phase 1 active power', functionCode: '04H', dataType: 'Float32', category: 'instantaneous', readOnly: true },
  { address: 0x000E, hexAddress: '0x000E', name: 'Phase 2 Power', unit: 'W', description: 'Phase 2 active power', functionCode: '04H', dataType: 'Float32', category: 'instantaneous', readOnly: true },
  { address: 0x0010, hexAddress: '0x0010', name: 'Phase 3 Power', unit: 'W', description: 'Phase 3 active power', functionCode: '04H', dataType: 'Float32', category: 'instantaneous', readOnly: true },
  { address: 0x0030, hexAddress: '0x0030', name: 'Frequency', unit: 'Hz', description: 'Frequency of supply voltages', functionCode: '04H', dataType: 'Float32', category: 'instantaneous', readOnly: true },
  { address: 0x0032, hexAddress: '0x0032', name: 'Total Active Power', unit: 'W', description: 'Total system active power', functionCode: '04H', dataType: 'Float32', category: 'instantaneous', readOnly: true },
  { address: 0x0036, hexAddress: '0x0036', name: 'Total Apparent Power', unit: 'VA', description: 'Total system apparent power', functionCode: '04H', dataType: 'Float32', category: 'instantaneous', readOnly: true },
];

export const INPUT_REGISTERS_FLOAT = REGISTER_MAP;

export const PYTHON_ASYNC_TEMPLATE = `#!/usr/bin/env python3
"""
Pymodbus Asynchronous Client for Meter Reading (Final Fixed Version)
--------------------------------------------------------------------------
"""
import asyncio
import csv
import os
import traceback
from datetime import datetime

# --- Pymodbus Imports ---
from pymodbus.client import AsyncModbusSerialClient
from pymodbus import ModbusException, pymodbus_apply_logging_config
from pymodbus.constants import Endian
from pymodbus.payload import BinaryPayloadDecoder

# --- Configuration ---
PORT = '{PORT}'  # Change to /dev/ttyACM0 if needed
BAUDRATE = {BAUD}
PARITY = '{PARITY}'
STOPBITS = {STOP}
SLAVE_ID = {SLAVE_ID}
CSV_FILE = 'meter_data.csv'

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
    print("Press Ctrl+C to stop.\\n")
    
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

                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

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
            
        # Wait 1 second before next read
        await asyncio.sleep({POLL_INTERVAL})

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
        print("\\nUser stopped the script.")
`;

export const PYTHON_TEMPLATE = PYTHON_ASYNC_TEMPLATE;
export const PYTHON_PYSERIAL_TEMPLATE = PYTHON_ASYNC_TEMPLATE;
