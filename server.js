import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const CSV_FILE = path.join(__dirname, 'meter_data.csv');

export const CSV_HEADERS = [
  'Timestamp',
  'Phase 1 Voltage (V)',
  'Phase 2 Voltage (V)',
  'Phase 3 Voltage (V)',
  'Phase 1 Current (A)',
  'Phase 2 Current (A)',
  'Phase 3 Current (A)',
  'Phase 1 Power (W)',
  'Phase 2 Power (W)',
  'Phase 3 Power (W)',
  'Frequency (Hz)',
  'Total Active Power (W)',
  'Total Apparent Power (VA)'
];

// Ensure CSV file exists with proper headers, but NEVER overwrite existing user/meter data
export function ensureCsvFile() {
  if (!fs.existsSync(CSV_FILE)) {
    console.log("Initializing new meter_data.csv with headers...");
    fs.writeFileSync(CSV_FILE, CSV_HEADERS.join(',') + '\n', 'utf8');
  }
}

// Generate sample data ONLY when explicitly requested by user
export function generateSampleData(mode = 'single') {
  const isDual = mode === 'dual';
  const isSingle = mode === 'single' || mode === true;
  console.log(`Generating sample test data (${isDual ? 'Tuya Dual-Channel' : isSingle ? 'Single-Phase' : '3-Phase'})...`);
  const rows = [CSV_HEADERS.join(',')];
  const now = new Date();
  const totalPoints = 60;
  const intervalMinutes = (4 * 60) / totalPoints; // 4 hours of data

  for (let i = totalPoints; i >= 0; i--) {
    const pointTime = new Date(now.getTime() - i * intervalMinutes * 60 * 1000);
    const dateStr = pointTime.toISOString().slice(0, 10);
    const timeStr = pointTime.toTimeString().slice(0, 8);
    const timestamp = `${dateStr} ${timeStr}`;

    const v1 = parseFloat((231.5 + (Math.random() - 0.5) * 1.5).toFixed(2));
    const v2 = (isSingle && !isDual) ? 0.0 : parseFloat((230.8 + (Math.random() - 0.5) * 1.5).toFixed(2));
    const v3 = (isSingle || isDual) ? 0.0 : parseFloat((230.0 + (Math.random() - 0.5) * 2.0).toFixed(2));

    const i1 = isDual ? parseFloat(Math.max(0.5, 4.20 + (Math.random() - 0.5) * 0.4).toFixed(2)) : parseFloat(Math.max(0.1, 0.75 + (Math.random() - 0.5) * 0.15).toFixed(2));
    const i2 = (isSingle && !isDual) ? 0.0 : (isDual ? parseFloat(Math.max(0.2, 2.15 + (Math.random() - 0.5) * 0.3).toFixed(2)) : parseFloat(Math.max(0.1, 0.70 + (Math.random() - 0.5) * 0.15).toFixed(2)));
    const i3 = (isSingle || isDual) ? 0.0 : parseFloat(Math.max(0.1, 0.80 + (Math.random() - 0.5) * 0.15).toFixed(2));

    const p1 = parseFloat((v1 * i1 * (isDual ? 0.95 : 0.88)).toFixed(2));
    const p2 = (isSingle && !isDual) ? 0.0 : parseFloat((v2 * i2 * (isDual ? 0.96 : 0.88)).toFixed(2));
    const p3 = (isSingle || isDual) ? 0.0 : parseFloat((v3 * i3 * 0.88).toFixed(2));

    const totalActiveW = parseFloat((p1 + p2 + p3).toFixed(2));
    const totalApparentVA = parseFloat(((v1 * i1) + (v2 * i2) + (v3 * i3)).toFixed(2));
    const freq = parseFloat((50.0 + (Math.random() - 0.5) * 0.06).toFixed(2));

    rows.push([
      timestamp,
      v1.toFixed(2),
      v2.toFixed(2),
      v3.toFixed(2),
      i1.toFixed(2),
      i2.toFixed(2),
      i3.toFixed(2),
      p1.toFixed(2),
      p2.toFixed(2),
      p3.toFixed(2),
      freq.toFixed(2),
      totalActiveW.toFixed(2),
      totalApparentVA.toFixed(2)
    ].join(','));
  }

  fs.writeFileSync(CSV_FILE, rows.join('\n') + '\n', 'utf8');
}

// On startup: only ensure the file exists. NEVER overwrite existing records!
ensureCsvFile();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// API Endpoint to delete/trim old records
app.delete('/api/data', (req, res) => {
  try {
    const beforeDate = req.query.before ? req.query.before.replace('T', ' ') : null;
    const keepLast = req.query.keep ? parseInt(req.query.keep) : null;
    const clearAll = req.query.all === 'true' || (!beforeDate && !keepLast);

    if (clearAll) {
      // Keep only header row
      fs.writeFileSync(CSV_FILE, CSV_HEADERS.join(',') + '\n', 'utf8');
      return res.json({ success: true, message: 'All old records cleared successfully.' });
    }

    if (!fs.existsSync(CSV_FILE)) {
      return res.json({ success: true, message: 'No file to clean.' });
    }

    const lines = fs.readFileSync(CSV_FILE, 'utf8').split('\n').filter(Boolean);
    if (lines.length <= 1) {
      return res.json({ success: true, message: 'File is already empty.' });
    }

    const header = lines[0];
    let dataRows = lines.slice(1);

    if (beforeDate) {
      dataRows = dataRows.filter(row => {
        const timestamp = row.split(',')[0];
        return timestamp >= beforeDate;
      });
    } else if (keepLast && keepLast > 0) {
      dataRows = dataRows.slice(-keepLast);
    }

    fs.writeFileSync(CSV_FILE, [header, ...dataRows].join('\n') + '\n', 'utf8');
    return res.json({
      success: true,
      message: `Retained ${dataRows.length} records.`,
      remaining: dataRows.length
    });
  } catch (err) {
    console.error('Error clearing data:', err);
    return res.status(500).json({ error: 'Failed to clear records' });
  }
});

// API Endpoint to generate sample data (manual user trigger only)
app.post('/api/data/sample', (req, res) => {
  try {
    const mode = req.body?.mode || (req.body?.singlePhase === false ? 'three' : 'single');
    generateSampleData(mode);
    res.json({ success: true, message: `Sample data created (${mode}).` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate sample data' });
  }
});

// API Endpoint to get CSV data
app.get('/api/data', (req, res) => {
  ensureCsvFile();

  const results = [];
  const queryLimit = req.query.limit !== undefined ? parseInt(req.query.limit) : 2000;
  
  const startDate = req.query.start ? req.query.start.replace('T', ' ') : null;
  const endDate = req.query.end ? req.query.end.replace('T', ' ') : null;

  const parser = fs.createReadStream(CSV_FILE)
    .pipe(parse({ columns: true, trim: true }));

  parser.on('data', (row) => {
    if (startDate && row.Timestamp < startDate) return;
    if (endDate && row.Timestamp > endDate) return;

    results.push(row);

    if (queryLimit > 0 && results.length > queryLimit) {
      results.shift(); 
    }
  });

  parser.on('error', (err) => {
    console.error("Error reading CSV:", err);
    res.status(500).json({ error: "Failed to read data" });
  });

  parser.on('end', () => {
    res.json(results);
  });
});

// API Endpoint for Tailscale Funnel Status
app.get('/api/tailscale/status', (req, res) => {
  exec('tailscale status --json', { timeout: 3000 }, (err, stdout) => {
    if (err) {
      return res.json({
        installed: false,
        running: false,
        funnelActive: false,
        dnsName: null,
        funnelUrl: null,
        tailscaleIp: null,
        nodeName: null,
        message: 'Tailscale is not installed or the tailscaled daemon is not active on this host.'
      });
    }

    try {
      const statusData = JSON.parse(stdout);
      const selfNode = statusData.Self || {};
      const rawDns = (selfNode.DNSName || '').replace(/\.$/, '');
      const tailscaleIps = selfNode.TailscaleIPs || [];
      const nodeName = selfNode.HostName || 'node';

      exec('tailscale funnel status', { timeout: 3000 }, (funnelErr, funnelOut) => {
        const funnelText = (funnelOut || '').toString();
        const isFunnelActive = !funnelErr && (funnelText.includes('funnel on') || funnelText.includes('http') || funnelText.includes('.ts.net'));
        
        let funnelUrl = null;
        const urlMatch = funnelText.match(/https:\/\/[^\s]+/);
        if (urlMatch) {
          funnelUrl = urlMatch[0];
        } else if (rawDns) {
          funnelUrl = `https://${rawDns}`;
        }

        res.json({
          installed: true,
          running: true,
          funnelActive: isFunnelActive,
          dnsName: rawDns,
          funnelUrl: funnelUrl,
          tailscaleIp: tailscaleIps[0] || null,
          nodeName: nodeName,
          funnelDetails: funnelText.trim()
        });
      });
    } catch (parseErr) {
      res.json({
        installed: true,
        running: true,
        funnelActive: false,
        dnsName: null,
        funnelUrl: null,
        tailscaleIp: null,
        nodeName: null,
        message: 'Tailscale status returned non-JSON.'
      });
    }
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Watching for data at: ${CSV_FILE}`);
});
