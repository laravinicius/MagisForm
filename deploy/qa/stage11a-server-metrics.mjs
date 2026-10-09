import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
let startAt; let endAt; let logA; let logB;
if (args.length === 3) {
  const load = JSON.parse(readFileSync(args[0], 'utf8'));
  ({ startedAt: startAt, endedAt: endAt } = load); [logA, logB] = args.slice(1);
} else [startAt, endAt, logA, logB] = args;
if (!startAt || !endAt || !logA || !logB || Number.isNaN(Date.parse(startAt)) || Number.isNaN(Date.parse(endAt))) throw new Error('Uso: node stage11a-server-metrics.mjs <arquivo-load.json> <log-A> <log-B>');
const start = Date.parse(startAt); const end = Date.parse(endAt);
const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? Number(sorted[Math.ceil(sorted.length * p) - 1].toFixed(2)) : null; };
const result = {};
for (const [tenant, file] of [['a', logA], ['b', logB]]) {
  const records = new Map(); const completed = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.startsWith('{')) continue;
    try {
      const entry = JSON.parse(line);
      if (Number(entry.time) < start || Number(entry.time) > end) continue;
      if (entry.msg === 'Requisição concluída' && entry.operation) records.set(entry.reqId, { operation: entry.operation, statusCode: Number(entry.statusCode) });
      if (entry.msg === 'request completed' && Number.isFinite(Number(entry.responseTime))) {
        const request = records.get(entry.reqId);
        if (request) completed.push({ ...request, ms: Number(entry.responseTime) });
      }
    } catch {}
  }
  result[tenant] = Object.fromEntries([...new Set(completed.map(row => row.operation))].map(operation => {
    const rows = completed.filter(row => row.operation === operation);
    const errors5xx = rows.filter(row => row.statusCode >= 500).length;
    return [operation, { count: rows.length, p50Ms: percentile(rows.map(row => row.ms), 0.5), p95Ms: percentile(rows.map(row => row.ms), 0.95), p99Ms: percentile(rows.map(row => row.ms), 0.99), maxMs: Number(Math.max(...rows.map(row => row.ms)).toFixed(2)), errors5xx, errors5xxPercent: Number((errors5xx * 100 / rows.length).toFixed(4)) }];
  }));
}
process.stdout.write(JSON.stringify({ startAt, endAt, backendMetricsByTenant: result }, null, 2) + '\n');
