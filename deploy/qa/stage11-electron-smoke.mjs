import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import crypto from 'node:crypto';

const exe = process.env.MF_ETAPA11_ELECTRON_EXE;
const ca = process.env.MF_ETAPA11_ELECTRON_CA;
const profile = path.join(os.tmpdir(), 'magisform-stage11-electron-remote-profile');
const artifact = path.join(os.tmpdir(), 'magisform-stage11-electron-remote.png');
if (!exe || !ca) throw new Error('Defina MF_ETAPA11_ELECTRON_EXE e MF_ETAPA11_ELECTRON_CA para o pacote e CA de QA.');
const userData = path.join(profile, 'MagisForm');
await fs.mkdir(userData, { recursive: true });
await fs.writeFile(path.join(userData, 'config.json'), JSON.stringify({ connectionMode: 'remote', serverUrl: 'https://localhost:28444', host: 'localhost', port: 3306, user: '', password: '', database: 'magisform' }));
const password = `Etapa11QA_a_Synthet1c_${crypto.createHash('sha256').update('STAGE11_QA_A').digest('hex').slice(0, 8)}`;
const app = spawn(exe, ['--remote-debugging-port=9223'], { env: { ...process.env, APPDATA: profile, NODE_EXTRA_CA_CERTS: ca }, windowsHide: false, stdio: 'ignore' });
const getTargets = () => new Promise((resolve, reject) => http.get('http://127.0.0.1:9223/json', (res) => { let body = ''; res.setEncoding('utf8'); res.on('data', (chunk) => { body += chunk; }); res.on('end', () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } }); }).on('error', reject));
let target;
for (let attempt = 0; attempt < 60 && !target; attempt++) {
  if (app.exitCode !== null) throw new Error(`Electron encerrou durante a inicialização (exit ${app.exitCode}).`);
  try { target = (await getTargets()).find((item) => item.type === 'page' && item.webSocketDebuggerUrl); } catch {}
  if (!target) await delay(1000);
}
if (!target) throw new Error('Electron empacotado não publicou um alvo CDP em 60 segundos.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', (message) => {
  const event = JSON.parse(message.data);
  if (event.id && pending.has(event.id)) { const task = pending.get(event.id); clearTimeout(task.timer); task.resolve(event); pending.delete(event.id); }
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timer = setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); } }, 15_000);
  timer.unref();
  pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
await cdp('Page.enable'); await cdp('Runtime.enable');
await delay(3000);
const before = await evaluate('document.body.innerText');
if (typeof before !== 'string' || !before.includes('Usuário')) throw new Error(`Tela de login do pacote não apareceu: ${String(before).slice(0, 160)}.`);
await evaluate(`(() => { const set=(id,value)=>{const e=document.getElementById(id);const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');d.set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};set('mf-app-1','s11loada01');set('mf-app-2',${JSON.stringify(password)});const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Entrar');if(!b)throw Error('Botão Entrar ausente');b.click();return true;})()`);
await delay(8000);
let state = await evaluate('({body:document.body.innerText,loginVisible:!!document.getElementById("mf-app-1")})');
if (state?.body?.includes('Usuário já logado')) {
  await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Entrar mesmo assim');if(!b)throw Error('Botão de login forçado ausente');b.click();return true;})()`);
  await delay(8000);
  state = await evaluate('({body:document.body.innerText,loginVisible:!!document.getElementById("mf-app-1")})');
}
const after = state?.body;
if (typeof after !== 'string' || state.loginVisible || after.includes('Acesso negado') || after.includes('Usuário ou senha inválidos') || !after.includes('Fórmulas')) throw new Error(`O pacote não autenticou no tenant QA remoto ou não carregou o shell: ${String(after).slice(0, 240)}.`);
const screenshot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.writeFile(artifact, Buffer.from(screenshot.result.data, 'base64'));
console.log(JSON.stringify({ packagedExe: exe, title: await evaluate('document.title'), loginScreen: before.includes('Entrar'), authenticated: true, rendererContainsBearer: after.includes('Bearer '), screenshot: artifact, bodyTextSample: after.slice(0, 240) }, null, 2));
await cdp('Browser.close').catch(() => {});
socket.close();
app.kill();
