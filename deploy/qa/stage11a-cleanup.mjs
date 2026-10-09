import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const statePath = path.join(os.tmpdir(), 'magisform-stage11a-qa.json');
if (!existsSync(statePath)) { process.stdout.write('Nenhum estado Stage 11A foi registrado.\n'); process.exit(0); }
const state = JSON.parse(readFileSync(statePath, 'utf8'));
for (const processInfo of state.processes ?? []) {
  const killed = spawnSync('taskkill.exe', ['/PID', String(processInfo.pid), '/T', '/F'], { encoding: 'utf8', windowsHide: true });
  if (killed.status !== 0 && !/not found|não foi encontrado/i.test(killed.stderr ?? '')) process.stderr.write(`taskkill PID ${processInfo.pid}: ${(killed.stderr ?? '').trim()}\n`);
  for (const file of [processInfo.stdoutPath, processInfo.stderrPath]) if (file && existsSync(file)) rmSync(file, { force: true });
}
for (const container of state.containers ?? []) {
  const removed = spawnSync('docker', ['rm', '--force', container], { encoding: 'utf8', windowsHide: true });
  if (removed.status !== 0 && !/no such container|no such object/i.test(removed.stderr ?? '')) process.stderr.write(`docker rm ${container}: ${(removed.stderr ?? '').trim()}\n`);
}
rmSync(statePath, { force: true });
process.stdout.write('Processos Node e containers MariaDB Stage 11A removidos; dados QA efêmeros descartados.\n');
