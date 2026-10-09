import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import os from 'node:os';
import path from 'node:path';

const tenant = process.argv[2];
if (!['a', 'b'].includes(tenant)) throw new Error('Uso: node stage11-fixtures.mjs a|b');
const passwordFile = process.env.MAGISFORM_SERVER_DB_PASSWORD_FILE;
if (!passwordFile && !process.env.MAGISFORM_SERVER_DB_PASSWORD) throw new Error('Defina a senha QA do MariaDB por variável de ambiente ou arquivo.');
const password = passwordFile ? (await fs.readFile(passwordFile, 'utf8')).replace(/[\r\n]+$/, '') : process.env.MAGISFORM_SERVER_DB_PASSWORD;
const pool = mysql.createPool({ host: process.env.MAGISFORM_SERVER_DB_HOST, port: Number(process.env.MAGISFORM_SERVER_DB_PORT ?? 3306), user: process.env.MAGISFORM_SERVER_DB_USER, password, database: process.env.MAGISFORM_SERVER_DB_NAME, connectionLimit: 4, timezone: '-03:00' });
const marker = `STAGE11_QA_${tenant.toUpperCase()}`;
const userPassword = `Etapa11QA_${tenant}_Synthet1c_${crypto.createHash('sha256').update(marker).digest('hex').slice(0, 8)}`;
const passwordHash = crypto.createHash('sha256').update(userPassword).digest('hex');

try {
  const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM formulas');
  if (Number(count.total) > 10_000) throw new Error(`${marker}: o banco já tem mais de 10 mil fórmulas; fixture não reduzirá dados.`);

  for (let i = 1; i <= 20; i++) {
    const username = `s11load${tenant}${String(i).padStart(2, '0')}`;
    await pool.execute('INSERT INTO users(name,username,password,role) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), password=VALUES(password), role=VALUES(role)', [`Carga QA ${tenant.toUpperCase()} ${i}`, username, passwordHash, 'employee']);
  }

  const [[customerCount]] = await pool.query("SELECT COUNT(*) AS total FROM customers WHERE name LIKE ?", [`${marker}_CLIENTE_%`]);
  if (Number(customerCount.total) === 0) {
    const customers = Array.from({ length: 100 }, (_, i) => [`${marker}_CLIENTE_${String(i + 1).padStart(3, '0')}`, `${tenant === 'a' ? '5511888' : '5511777'}${String(i + 1).padStart(4, '0')}`]);
    await pool.query('INSERT INTO customers(name,phone) VALUES ?', [customers]);
  }
  const [[insumoCount]] = await pool.query("SELECT COUNT(*) AS total FROM insumos WHERE name=?", [`${marker}_INSUMO`]);
  if (Number(insumoCount.total) === 0) await pool.execute('INSERT INTO insumos(name) VALUES (?)', [`${marker}_INSUMO`]);

  const [[now]] = await pool.query('SELECT COUNT(*) AS total FROM formulas');
  const remaining = 10_000 - Number(now.total);
  const [[firstCustomer]] = await pool.execute('SELECT id FROM customers WHERE name=? LIMIT 1', [`${marker}_CLIENTE_001`]);
  const [[insumo]] = await pool.execute('SELECT id FROM insumos WHERE name=? LIMIT 1', [`${marker}_INSUMO`]);
  if (remaining > 0 && (!firstCustomer || !insumo)) throw new Error(`${marker}: cliente ou insumo QA ausente.`);
  for (let offset = 0; offset < remaining; offset += 250) {
    const batch = Array.from({ length: Math.min(250, remaining - offset) }, (_, index) => [firstCustomer.id + ((offset + index) % 100), '', `Atendente QA ${tenant.toUpperCase()}`, `Q${String((offset + index) % 100_000).padStart(5, '0')}`, null, null, '', null, null, '', 0, null, 'pending']);
    const [inserted] = await pool.query('INSERT INTO formulas(customer_id,customer_phone,attendant_name,budget_number,delivery_date,delivered_at,payment_status,partial_payment_amount,payment_method,delivery_status,manager_verified,cancel_reason,status) VALUES ?', [batch]);
    const ids = Array.from({ length: batch.length }, (_, index) => [inserted.insertId + index, insumo.id, 1, 'g']);
    await pool.query('INSERT INTO formula_items(formula_id,insumo_id,quantity,unit) VALUES ?', [ids]);
    const budgetItems = Array.from({ length: batch.length }, (_, index) => [inserted.insertId + index, 1, 'caps', 10, 1]);
    await pool.query('INSERT INTO formula_budget_items(formula_id,quantity,unit,value,is_selected) VALUES ?', [budgetItems]);
  }

  const [[formulaTotal]] = await pool.query('SELECT COUNT(*) AS total FROM formulas');
  if (Number(formulaTotal.total) !== 10_000) throw new Error(`${marker}: esperado 10000 fórmulas, obtido ${formulaTotal.total}.`);
  const [[allCustomers]] = await pool.query("SELECT COUNT(*) AS total FROM customers WHERE name LIKE ?", [`${marker}_CLIENTE_%`]);
  const [[allInsumos]] = await pool.query("SELECT COUNT(*) AS total FROM insumos WHERE name=?", [`${marker}_INSUMO`]);
  await fs.writeFile(path.join(os.tmpdir(), `${marker.toLowerCase()}.json`), JSON.stringify({ marker, formulaCount: Number(formulaTotal.total), customerCount: Number(allCustomers.total), insumoCount: Number(allInsumos.total), usernamePrefix: `s11load${tenant}`, password: userPassword }));
  process.stdout.write(`${marker}: ${formulaTotal.total} fórmulas, ${allCustomers.total} clientes, ${allInsumos.total} insumo de QA e 20 contas sintéticas prontos.\n`);
} finally {
  await pool.end();
}
