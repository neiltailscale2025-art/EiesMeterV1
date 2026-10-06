import React, { useState, useEffect } from 'react';
import { Info, CheckCircle2, XCircle, Sparkles, BookOpen, Layers } from 'lucide-react';

interface DissectedFrame {
  slaveId: number;
  functionCode: number;
  functionName: string;
  byteCount?: number;
  dataHex: string;
  crcHex: string;
  computedCrc: string;
  isCrcValid: boolean;
  decodedFloat?: number;
  decodedUlong?: number;
  decodedUint?: number;
}

const HexDecoder: React.FC = () => {
  // Default matches the example in modbus.pdf Page 6: 43 66 33 34 = 230.2
  const [hexInput, setHexInput] = useState<string>('43 66 33 34');
  const [fullFrameInput, setFullFrameInput] = useState<string>('01 04 04 43 66 33 34 1B 38');
  const [floatResult, setFloatResult] = useState<number | null>(null);
  const [ulongResult, setUlongResult] = useState<number | null>(null);
  const [uintResult, setUintResult] = useState<number | null>(null);
  const [error, setError] = useState<string>('');
  const [dissected, setDissected] = useState<DissectedFrame | null>(null);

  // CRC-16 Modbus (Polynomial 0xA001)
  const computeModbusCRC = (buffer: Uint8Array): number => {
    let crc = 0xFFFF;
    for (let i = 0; i < buffer.length; i++) {
      crc ^= buffer[i];
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x0001) !== 0) {
          crc = (crc >> 1) ^ 0xA001;
        } else {
          crc = crc >> 1;
        }
      }
    }
    return crc;
  };

  const decodeRawHex = (input: string) => {
    const clean = input.replace(/\s+/g, '').replace(/0x/gi, '');
    if (clean.length === 0) {
      setFloatResult(null);
      setUlongResult(null);
      setUintResult(null);
      setError('');
      return;
    }

    try {
      if (clean.length === 8) {
        // 4 bytes: Float32 or ULONG
        const bytes = new Uint8Array(4);
        for (let i = 0; i < 4; i++) {
          const b = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
          if (isNaN(b)) throw new Error("Invalid hex character");
          bytes[i] = b;
        }

        const view = new DataView(bytes.buffer);
        const f32 = view.getFloat32(0, false); // Big endian
        const u32 = view.getUint32(0, false);
        setFloatResult(f32);
        setUlongResult(u32);
        setUintResult(null);
        setError('');
      } else if (clean.length === 4) {
        // 2 bytes: UINT
        const bytes = new Uint8Array(2);
        for (let i = 0; i < 2; i++) {
          const b = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
          if (isNaN(b)) throw new Error("Invalid hex character");
          bytes[i] = b;
        }
        const view = new DataView(bytes.buffer);
        const u16 = view.getUint16(0, false);
        setUintResult(u16);
        setFloatResult(null);
        setUlongResult(null);
        setError('');
      } else {
        setError(`Expected 4 bytes (8 hex chars) or 2 bytes (4 hex chars). Got ${clean.length} chars.`);
        setFloatResult(null);
        setUlongResult(null);
        setUintResult(null);
      }
    } catch (e: any) {
      setError(e.message || "Invalid hex string");
    }
  };

  const dissectFrame = (frameStr: string) => {
    const clean = frameStr.replace(/\s+/g, '').replace(/0x/gi, '');
    if (clean.length < 8 || clean.length % 2 !== 0) {
      setDissected(null);
      return;
    }

    try {
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
      }

      const slaveId = bytes[0];
      const functionCode = bytes[1];
      let functionName = 'Unknown';
      if (functionCode === 0x03) functionName = '03H (Read Holding Registers)';
      else if (functionCode === 0x04) functionName = '04H (Read Input Registers)';
      else if (functionCode === 0x10) functionName = '10H (Write Holding Registers)';

      // Modbus sends CRC Low Byte then High Byte
      const payloadBytes = bytes.slice(0, bytes.length - 2);
      const computed = computeModbusCRC(payloadBytes);
      const receivedCrc = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);

      const computedLow = (computed & 0xFF).toString(16).padStart(2, '0').toUpperCase();
      const computedHigh = ((computed >> 8) & 0xFF).toString(16).padStart(2, '0').toUpperCase();
      const computedCrcStr = `${computedLow} ${computedHigh}`;

      const recLow = bytes[bytes.length - 2].toString(16).padStart(2, '0').toUpperCase();
      const recHigh = bytes[bytes.length - 1].toString(16).padStart(2, '0').toUpperCase();
      const receivedCrcStr = `${recLow} ${recHigh}`;

      const isCrcValid = (computed === receivedCrc);

      // Check if response frame with byte count
      let byteCount: number | undefined = undefined;
      let dataHex = '';
      let decodedFloat: number | undefined = undefined;
      let decodedUlong: number | undefined = undefined;
      let decodedUint: number | undefined = undefined;

      if (bytes.length >= 6) {
        byteCount = bytes[2];
        const dataPortion = bytes.slice(3, bytes.length - 2);
        dataHex = Array.from(dataPortion).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

        if (dataPortion.length === 4) {
          const view = new DataView(dataPortion.buffer, dataPortion.byteOffset, 4);
          decodedFloat = view.getFloat32(0, false);
          decodedUlong = view.getUint32(0, false);
        } else if (dataPortion.length === 2) {
          const view = new DataView(dataPortion.buffer, dataPortion.byteOffset, 2);
          decodedUint = view.getUint16(0, false);
        }
      }

      setDissected({
        slaveId,
        functionCode,
        functionName,
        byteCount,
        dataHex,
        crcHex: receivedCrcStr,
        computedCrc: computedCrcStr,
        isCrcValid,
        decodedFloat,
        decodedUlong,
        decodedUint
      });
    } catch {
      setDissected(null);
    }
  };

  useEffect(() => {
    decodeRawHex(hexInput);
  }, [hexInput]);

  useEffect(() => {
    dissectFrame(fullFrameInput);
  }, [fullFrameInput]);

  // Presets from modbus.pdf Page 6 & 7
  const setPreset = (type: 'page6_resp1' | 'page6_resp2' | 'page7_resp3' | 'page6_req1') => {
    if (type === 'page6_resp1') {
      setFullFrameInput('01 04 04 43 66 33 34 1B 38');
      setHexInput('43 66 33 34');
    } else if (type === 'page6_resp2') {
      setFullFrameInput('01 03 04 00 00 61 AA 53 DC');
      setHexInput('00 00 61 AA');
    } else if (type === 'page7_resp3') {
      setFullFrameInput('01 03 02 00 05 78 47');
      setHexInput('00 05');
    } else if (type === 'page6_req1') {
      setFullFrameInput('01 04 00 00 00 02 71 CB');
      setHexInput('43 66 33 34');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <div className="flex items-center gap-2 text-amber-400">
              <Info size={22} />
              <h2 className="text-xl font-bold text-white tracking-tight">Modbus RTU Hex Decoder & Frame Dissector</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Test and verify raw serial hex packets received from your USB-to-RS485 converter using IEEE-754 Big-Endian and Modbus CRC-16.
            </p>
          </div>

          {/* Quick presets from PDF */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 font-semibold uppercase">PDF Examples:</span>
            <button
              onClick={() => setPreset('page6_resp1')}
              className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-emerald-400 border border-slate-700 transition-colors"
            >
              230.2V (Float32)
            </button>
            <button
              onClick={() => setPreset('page6_resp2')}
              className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-cyan-400 border border-slate-700 transition-colors"
            >
              250.02V (ULONG)
            </button>
            <button
              onClick={() => setPreset('page7_resp3')}
              className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-amber-400 border border-slate-700 transition-colors"
            >
              Slide Time = 5 (UINT)
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Section 1: Raw Register Data Decoder */}
        <div className="bg-slate-900/90 rounded-xl p-5 border border-slate-800 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <Sparkles size={16} className="text-amber-400" />
              1. Raw Register Payload Decoder (4 or 2 Bytes)
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter 4 bytes (8 hex characters) from registers e.g. <span className="font-mono text-emerald-400">43 66 33 34</span>.
            </p>

            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Hex String</label>
            <input 
              type="text" 
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-lg font-mono text-white focus:border-amber-500 focus:outline-none placeholder-slate-700"
              placeholder="e.g. 43 66 33 34"
            />
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
          </div>

          <div className="mt-6 space-y-3 pt-4 border-t border-slate-800">
            {/* Decoded Float32 */}
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex justify-between items-center">
              <div>
                <span className="text-[11px] text-slate-500 uppercase block font-semibold">IEEE-754 Float32 (FC 04H)</span>
                <span className="text-xs text-slate-400">Big-Endian ABCD (Voltage, Current, Power, kWh)</span>
              </div>
              <div className="text-right">
                <span className="text-xl font-mono font-bold text-emerald-400">
                  {floatResult !== null ? floatResult.toFixed(3) : '---'}
                </span>
              </div>
            </div>

            {/* Decoded ULONG */}
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex justify-between items-center">
              <div>
                <span className="text-[11px] text-slate-500 uppercase block font-semibold">32-Bit ULONG (FC 03H)</span>
                <span className="text-xs text-slate-400">Integer format (e.g. 0.01V scale: {(ulongResult ? ulongResult * 0.01 : 0).toFixed(2)}V)</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-mono font-bold text-cyan-400">
                  {ulongResult !== null ? ulongResult.toLocaleString() : '---'}
                </span>
              </div>
            </div>

            {/* Decoded UINT */}
            <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex justify-between items-center">
              <div>
                <span className="text-[11px] text-slate-500 uppercase block font-semibold">16-Bit UINT (FC 03H)</span>
                <span className="text-xs text-slate-400">Settings / CT parameter value</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-mono font-bold text-amber-400">
                  {uintResult !== null ? uintResult : '---'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Complete Modbus RTU Frame Dissector */}
        <div className="bg-slate-900/90 rounded-xl p-5 border border-slate-800 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <Layers size={16} className="text-cyan-400" />
              2. Full Modbus RTU Packet Dissector & CRC-16 Check
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Paste the complete hex frame including address, function code, data, and CRC bytes.
            </p>

            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Full Frame Hex</label>
            <input 
              type="text" 
              value={fullFrameInput}
              onChange={(e) => setFullFrameInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm font-mono text-white focus:border-cyan-500 focus:outline-none placeholder-slate-700"
              placeholder="e.g. 01 04 04 43 66 33 34 1B 38"
            />
          </div>

          {dissected ? (
            <div className="mt-5 space-y-2.5 pt-4 border-t border-slate-800 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                  <span className="text-slate-500 uppercase font-semibold text-[10px]">Slave Address:</span>
                  <div className="font-mono text-white font-bold">0x{dissected.slaveId.toString(16).padStart(2, '0').toUpperCase()} ({dissected.slaveId})</div>
                </div>
                <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                  <span className="text-slate-500 uppercase font-semibold text-[10px]">Function Code:</span>
                  <div className="font-mono text-cyan-400 font-bold">{dissected.functionName}</div>
                </div>
              </div>

              {dissected.byteCount !== undefined && (
                <div className="bg-slate-950 p-2.5 rounded border border-slate-800 flex justify-between">
                  <span className="text-slate-500 uppercase font-semibold text-[10px]">Byte Count:</span>
                  <span className="font-mono text-white">{dissected.byteCount} bytes</span>
                </div>
              )}

              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <span className="text-slate-500 uppercase font-semibold text-[10px]">Payload Hex:</span>
                <div className="font-mono text-amber-300 font-semibold mt-0.5">{dissected.dataHex || '(Empty / Request)'}</div>
                {dissected.decodedFloat !== undefined && (
                  <div className="text-emerald-400 font-mono mt-1 font-bold">
                    = {dissected.decodedFloat.toFixed(3)} (Float32)
                  </div>
                )}
              </div>

              {/* CRC Verification */}
              <div className={`p-2.5 rounded border flex items-center justify-between ${
                dissected.isCrcValid 
                  ? 'bg-emerald-950/20 border-emerald-900/60 text-emerald-400' 
                  : 'bg-red-950/20 border-red-900/60 text-red-400'
              }`}>
                <div className="flex items-center gap-2">
                  {dissected.isCrcValid ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  <div>
                    <span className="font-semibold block">
                      {dissected.isCrcValid ? 'CRC-16 Checksum Valid' : 'CRC-16 Checksum Mismatch!'}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      Recv: {dissected.crcHex} | Calc: {dissected.computedCrc}
                    </span>
                  </div>
                </div>
                <span className="font-mono font-bold text-xs uppercase">
                  {dissected.isCrcValid ? 'PASS' : 'FAIL'}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-4 p-4 bg-slate-950/50 rounded border border-slate-800 text-center text-xs text-slate-500">
              Enter valid Modbus RTU hex bytes above to dissect packet structure.
            </div>
          )}
        </div>

      </div>

      {/* Official Manual Reference Note */}
      <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1">
        <h4 className="font-semibold text-slate-300 flex items-center gap-1.5">
          <BookOpen size={14} className="text-amber-400" />
          Reference Note from modbus.pdf (Page 6 & 7):
        </h4>
        <p>
          <span className="text-amber-300 font-mono">Request: 01 04 00 00 00 02 71 CB</span> &rarr; Read 2 registers starting at 0x0000 (Voltage).
        </p>
        <p>
          <span className="text-emerald-300 font-mono">Response: 01 04 04 43 66 33 34 1B 38</span> &rarr; Returns 4 data bytes <code className="text-white">43 66 33 34</code> = <strong className="text-emerald-400">230.2 V</strong> with CRC <code className="text-white">1B 38</code>.
        </p>
      </div>

    </div>
  );
};

export default HexDecoder;
