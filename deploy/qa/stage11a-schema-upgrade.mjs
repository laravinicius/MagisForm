import { spawnSync } from 'node:child_process';
import mysql from 'mysql2/promise';

const host = '127.0.0.1'; const port = 33111; const user = 'root'; const password = 'Stage11aRootQA_A'; const database = 'stage11a_upgrade_qa';
const env = { ...process.env, MAGISFORM_DB_HOST: host, MAGISFORM_DB_PORT: String(port), MAGISFORM_DB_NAME: database, MAGISFORM_DB_USER: user, MAGISFORM_DB_PASSWORD: password };
function run(args) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true, env });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) throw new Error(result.stderr?.trim() || result.error?.message || 'Comando de schema falhou.');
}
const conn = await mysql.createConnection({ host, port, user, password });
try {
  await conn.query('DROP DATABASE IF EXISTS stage11a_upgrade_qa');
} finally { await conn.end(); }
run(['scripts/database-schema.mjs', 'bootstrap']);
const qa = await mysql.createConnection({ host, port, user, password, database });
try {
  await qa.query('ALTER TABLE formulas DROP INDEX idx_formulas_created_id');
  await qa.query("UPDATE schema_version SET version=1, source='bootstrap', checksum=REPEAT('0',64) WHERE singleton=1");
} finally { await qa.end(); }
run(['scripts/database-schema.mjs', 'upgrade']);
run(['scripts/database-schema.mjs', 'preflight']);
const target = await mysql.createConnection({ host, port, user, password, database: 'magisform' });
try {
  const [[count]] = await target.query('SELECT COUNT(*) AS total FROM formulas');
  const [plan] = await target.query("EXPLAIN SELECT f.id FROM formulas f WHERE (f.created_at < '2030-01-01 00:00:00' OR (f.created_at='2030-01-01 00:00:00' AND f.id<=999999)) AND f.status='pending' ORDER BY f.created_at DESC,f.id DESC LIMIT 51");
  const [withoutIndex] = await target.query("EXPLAIN SELECT f.id FROM formulas f IGNORE INDEX(idx_formulas_created_id) WHERE (f.created_at < '2030-01-01 00:00:00' OR (f.created_at='2030-01-01 00:00:00' AND f.id<=999999)) AND f.status='pending' ORDER BY f.created_at DESC,f.id DESC LIMIT 51");
  process.stdout.write(JSON.stringify({ fixtureRows: Number(count.total), withIndex: plan, withoutIndex: withoutIndex }, null, 2) + '\n');
} finally { await target.end(); }
