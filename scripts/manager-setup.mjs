import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { hash } from '@node-rs/argon2';
import { createTotpSecret } from '../dist-server/manager/totp.js';

const username = process.argv[2]?.trim();
if (!/^[A-Za-z0-9._-]{2,100}$/.test(username ?? '')) throw new Error('Uso: npm run manager:setup -- <usuario>');
const root = path.resolve(process.env.MAGISFORM_MANAGER_STATE ?? 'manager-state');
await fs.mkdir(root, { recursive: true, mode: 0o700 });
const operatorPath = path.join(root, 'operator.json');
const tokenPath = path.join(root, 'agent-token.txt');
for (const file of [operatorPath, tokenPath]) {
  try { await fs.access(file); throw new Error(`O arquivo ${file} já existe; setup recusado para preservar a conta atual.`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const password = crypto.randomBytes(24).toString('base64url');
const totpSecret = createTotpSecret();
const passwordHash = await hash(password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
const writePrivate = async (file, value) => { await fs.writeFile(file, value, { flag: 'wx', mode: 0o600 }); if (process.platform !== 'win32') await fs.chmod(file, 0o600); };
await writePrivate(operatorPath, JSON.stringify({ username, passwordHash, totpSecret }, null, 2) + '\n');
await writePrivate(tokenPath, crypto.randomBytes(48).toString('base64url') + '\n');
const otpUri = `otpauth://totp/${encodeURIComponent(`MagisForm Gestão:${username}`)}?secret=${totpSecret}&issuer=${encodeURIComponent('MagisForm Gestão')}&algorithm=SHA1&digits=6&period=30`;
console.log(JSON.stringify({ username, password, totpSecret, otpUri, stateDirectory: root }, null, 2));
console.log('Guarde a senha e configure a chave TOTP em um autenticador agora. A senha só é exibida nesta execução. Proteja e faça backup cifrado do diretório de estado.');
