import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import { exec } from 'child_process';

// Vite plugin to serve /api/data directly during vite dev mode
function modbusDataApiPlugin() {
  const CSV_FILE = path.resolve(__dirname, 'meter_data.csv');
  const CSV_HEADERS = [
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

  function ensureCsvFile() {
    if (!fs.existsSync(CSV_FILE)) {
      fs.writeFileSync(CSV_FILE, CSV_HEADERS.join(',') + '\n', 'utf8');
    }
  }

  function generateSampleData(mode: string = 'single') {
    const isDual = mode === 'dual';
    const isSingle = mode === 'single';
    const rows = [CSV_HEADERS.join(',')];
    const now = new Date();
    const totalPoints = 60;
    const intervalMinutes = (4 * 60) / totalPoints;

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
        v1.toFixed(2), v2.toFixed(2), v3.toFixed(2),
        i1.toFixed(2), i2.toFixed(2), i3.toFixed(2),
        p1.toFixed(2), p2.toFixed(2), p3.toFixed(2),
        freq.toFixed(2), totalActiveW.toFixed(2), totalApparentVA.toFixed(2)
      ].join(','));
    }

    fs.writeFileSync(CSV_FILE, rows.join('\n') + '\n', 'utf8');
  }

  ensureCsvFile();

  return {
    name: 'modbus-data-api-plugin',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url && req.url.startsWith('/api/data')) {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: any) => { body += chunk; });
            req.on('end', () => {
              try {
                let parsed: any = {};
                try { parsed = JSON.parse(body); } catch {}
                const mode = parsed?.mode || (parsed?.singlePhase === false ? 'three' : 'single');
                generateSampleData(mode);
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, message: `Sample data generated (${mode})` }));
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }
          if (req.method === 'DELETE') {
            try {
              const urlObj = new URL(req.url, 'http://localhost:3000');
              const beforeDate = urlObj.searchParams.get('before')?.replace('T', ' ') || null;
              const keepParam = urlObj.searchParams.get('keep');
              const keepLast = keepParam ? parseInt(keepParam) : null;
              const clearAll = urlObj.searchParams.get('all') === 'true' || (!beforeDate && !keepLast);

              if (clearAll) {
                fs.writeFileSync(CSV_FILE, CSV_HEADERS.join(',') + '\n', 'utf8');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, message: 'All old records cleared successfully.' }));
                return;
              }

              if (fs.existsSync(CSV_FILE)) {
                const lines = fs.readFileSync(CSV_FILE, 'utf8').split('\n').filter(Boolean);
                const header = lines[0];
                let dataRows = lines.slice(1);

                if (beforeDate) {
                  dataRows = dataRows.filter(r => r.split(',')[0] >= beforeDate);
                } else if (keepLast && keepLast > 0) {
                  dataRows = dataRows.slice(-keepLast);
                }

                fs.writeFileSync(CSV_FILE, [header, ...dataRows].join('\n') + '\n', 'utf8');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, message: `Retained ${dataRows.length} records.`, remaining: dataRows.length }));
                return;
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, message: 'No records to delete.' }));
              return;
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
              return;
            }
          }

          ensureCsvFile();

          const urlObj = new URL(req.url, 'http://localhost:3000');
          const limitParam = urlObj.searchParams.get('limit');
          const queryLimit = limitParam !== null ? parseInt(limitParam) : 2000;
          const startDate = urlObj.searchParams.get('start')?.replace('T', ' ') || null;
          const endDate = urlObj.searchParams.get('end')?.replace('T', ' ') || null;

          const results: Record<string, string>[] = [];
          const parser = fs.createReadStream(CSV_FILE)
            .pipe(parse({ columns: true, trim: true }));

          parser.on('data', (row: Record<string, string>) => {
            if (startDate && row.Timestamp < startDate) return;
            if (endDate && row.Timestamp > endDate) return;

            results.push(row);

            if (queryLimit > 0 && results.length > queryLimit) {
              results.shift();
            }
          });

          parser.on('error', (err: any) => {
            console.error('Error reading CSV in Vite middleware:', err);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Failed to read data' }));
          });

          parser.on('end', () => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(results));
          });

          return;
        }

        if (req.url && req.url.startsWith('/api/tailscale/status')) {
          exec('tailscale status --json', { timeout: 3000 }, (err: any, stdout: any) => {
            res.setHeader('Content-Type', 'application/json');
            if (err) {
              res.statusCode = 200;
              res.end(JSON.stringify({
                installed: false,
                running: false,
                funnelActive: false,
                dnsName: null,
                funnelUrl: null,
                tailscaleIp: null,
                nodeName: null,
                message: 'Tailscale is not installed or tailscaled is not running on this host.'
              }));
              return;
            }

            try {
              const statusData = JSON.parse(stdout);
              const selfNode = statusData.Self || {};
              const rawDns = (selfNode.DNSName || '').replace(/\.$/, '');
              const tailscaleIps = selfNode.TailscaleIPs || [];
              const nodeName = selfNode.HostName || 'node';

              exec('tailscale funnel status', { timeout: 3000 }, (funnelErr: any, funnelOut: any) => {
                const funnelText = (funnelOut || '').toString();
                const isFunnelActive = !funnelErr && (funnelText.includes('funnel on') || funnelText.includes('http') || funnelText.includes('.ts.net'));
                
                let funnelUrl = null;
                const urlMatch = funnelText.match(/https:\/\/[^\s]+/);
                if (urlMatch) {
                  funnelUrl = urlMatch[0];
                } else if (rawDns) {
                  funnelUrl = `https://${rawDns}`;
                }

                res.statusCode = 200;
                res.end(JSON.stringify({
                  installed: true,
                  running: true,
                  funnelActive: isFunnelActive,
                  dnsName: rawDns,
                  funnelUrl: funnelUrl,
                  tailscaleIp: tailscaleIps[0] || null,
                  nodeName: nodeName,
                  funnelDetails: funnelText.trim()
                }));
              });
            } catch {
              res.statusCode = 200;
              res.end(JSON.stringify({
                installed: true,
                running: true,
                funnelActive: false,
                dnsName: null,
                funnelUrl: null,
                tailscaleIp: null,
                nodeName: null,
                message: 'Failed to parse Tailscale status JSON'
              }));
            }
          });
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), modbusDataApiPlugin()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
  },
});
