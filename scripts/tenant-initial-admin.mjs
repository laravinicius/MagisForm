import { hash, verify } from '@node-rs/argon2';
import mysql from 'mysql2/promise';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const credentials = JSON.parse(input);
if (typeof credentials.name !== 'string' || !credentials.name.trim() || typeof credentials.username !== 'string' || !/^[A-Za-z0-9_.-]{1,50}$/.test(credentials.username) || typeof credentials.password !== 'string' || credentials.password.length < 20) {
  throw new Error('Credenciais iniciais inválidas.');
}
const passwordFile = process.env.MAGISFORM_SERVER_DB_PASSWORD_FILE ?? process.env.MAGISFORM_DB_PASSWORD_FILE;
if (!passwordFile) throw new Error('Arquivo de senha do banco não configurado.');
const dbPassword = (await (await import('node:fs/promises')).readFile(passwordFile, 'utf8')).replace(/[\r\n]+$/, '');
const connection = await mysql.createConnection({
  host: process.env.MAGISFORM_SERVER_DB_HOST ?? process.env.MAGISFORM_DB_HOST,
  port: Number(process.env.MAGISFORM_SERVER_DB_PORT ?? process.env.MAGISFORM_DB_PORT ?? 3306),
  database: process.env.MAGISFORM_SERVER_DB_NAME ?? process.env.MAGISFORM_DB_NAME,
  user: process.env.MAGISFORM_SERVER_DB_USER ?? process.env.MAGISFORM_DB_USER,
  password: dbPassword,
  timezone: '-03:00',
});
try {
  const [[lock]] = await connection.query("SELECT GET_LOCK('magisform_initial_admin', 10) AS acquired");
  if (Number(lock.acquired) !== 1) throw new Error('Não foi possível reservar o provisionamento do administrador.');
  const [[count]] = await connection.query('SELECT COUNT(*) AS total FROM users');
  if (Number(count.total) > 0) {
    const [[existing]] = await connection.execute('SELECT id FROM users WHERE username=? LIMIT 1', [credentials.username]);
    if (existing) {
      const [[stored]] = await connection.execute('SELECT password, role FROM users WHERE id=?', [existing.id]);
      if (stored.role !== 'admin' || !String(stored.password).startsWith('$argon2id$') || !(await verify(stored.password, credentials.password))) throw new Error('Usuário inicial existente não corresponde à credencial protegida. Nenhuma conta foi alterada.');
      process.stdout.write('Administrador inicial já provisionado.\n');
    }
    else throw new Error('Já existem usuários; nenhum administrador foi alterado.');
  } else {
    const encodedPassword = await hash(credentials.password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    await connection.beginTransaction();
    try {
      const [result] = await connection.execute('INSERT INTO users (name,username,password,role) VALUES (?,?,?,?)', [credentials.name.trim(), credentials.username, encodedPassword, 'admin']);
      await connection.execute('INSERT INTO action_logs (user_id,user_name,action,entity,entity_id,details) VALUES (?,?,?,?,?,?)', [null, 'Provisionamento', 'add', 'users', result.insertId, `Administrador inicial criado: ${credentials.username}.`]);
      await connection.commit();
      process.stdout.write('Administrador inicial criado.\n');
    } catch (error) { await connection.rollback(); throw error; }
  }
} finally { await connection.query("SELECT RELEASE_LOCK('magisform_initial_admin')"); await connection.end(); }
