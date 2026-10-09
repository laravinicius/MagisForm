import { execFileSync } from 'node:child_process';

const [startAt, endAt] = process.argv.slice(2);
if (!startAt || !endAt || Number.isNaN(Date.parse(startAt)) || Number.isNaN(Date.parse(endAt))) throw new Error('Uso: node deploy/qa/stage11-server-metrics.mjs <start-ISO> <end-ISO>');
const start = Date.parse(startAt); const end = Date.parse(endAt);
const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? Number(sorted[Math.ceil(sorted.length * p) - 1].toFixed(2)) : null; };
const result = {};
for (const tenant of ['a', 'b']) {
  const output = execFileSync('docker', ['logs', `magisform-stage11-${tenant}-app-1`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  const details = new Map(); const completed = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.time < start || entry.time > end) continue;
      if (entry.msg === 'Requisição concluída' && entry.operation) details.set(entry.reqId, { operation: entry.operation, statusCode: Number(entry.statusCode) });
      if (entry.msg === 'request completed' && Number.isFinite(Number(entry.responseTime))) {
        const request = details.get(entry.reqId);
        if (request) completed.push({ ...request, ms: Number(entry.responseTime) });
      }
    } catch {}
  }
  result[tenant] = Object.fromEntries([...new Set(completed.map(({ operation }) => operation))].map((operation) => {
    const rows = completed.filter((row) => row.operation === operation);
    const errors5xx = rows.filter((row) => row.statusCode >= 500).length;
    return [operation, { count: rows.length, p50Ms: percentile(rows.map(({ ms }) => ms), 0.5), p95Ms: percentile(rows.map(({ ms }) => ms), 0.95), p99Ms: percentile(rows.map(({ ms }) => ms), 0.99), maxMs: Number(Math.max(...rows.map(({ ms }) => ms)).toFixed(2)), errors5xx, errors5xxPercent: Number((errors5xx * 100 / rows.length).toFixed(4)) }];
  }));
}
process.stdout.write(JSON.stringify({ startAt, endAt, backendMetricsByTenant: result }, null, 2) + '\n');
