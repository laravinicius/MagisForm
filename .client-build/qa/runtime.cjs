const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { _electron } = require('C:/Users/Vinicius/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

(async () => {
  const qa = path.join(root, '.client-build', 'qa');
  const data = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'magisform-qa-'));
  const config = { host: '127.0.0.1', port: 1, user: 'qa_magisform', password: 'qa_sintetica', database: 'qa_magisform' };
  const configDir = path.join(data, 'MagisForm');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(config));
  const asar = path.resolve(pkg.build.directories.output.replace('${version}', pkg.version), 'win-unpacked/resources/app.asar');
  const runner = path.join(data, 'runner');
  fs.mkdirSync(runner);
  fs.writeFileSync(path.join(runner, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, type: 'module', main: 'main.mjs' }));
  fs.writeFileSync(path.join(runner, 'main.mjs'), `import { app } from 'electron'; app.setPath('appData', ${JSON.stringify(data)}); await import(${JSON.stringify(pathToFileURL(path.join(asar, 'dist-electron/main.js')).href)});`);
  const app = await _electron.launch({ executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'), args: [runner, '--disable-gpu'], timeout: 30000 });
  try {
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    assert.equal(await win.title(), 'MagisForm - Manipulação');
    assert.deepEqual(await win.evaluate(() => window.electronAPI.getConfig()), { host: config.host, port: config.port, user: config.user, database: config.database });
    await win.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
    await win.waitForFunction(() => [...document.querySelectorAll('.max-w-md')].every(el => getComputedStyle(el).opacity === '1'));
    await win.screenshot({ path: path.join(qa, 'magisform-login.png') });
    const source = fs.readFileSync('electron/main.ts', 'utf8');
    await win.locator('input[type=text]').fill(source.match(/const MASTER_USERNAME = '([^']+)'/)[1]);
    await win.locator('input[type=password]').fill(source.match(/const MASTER_PASSWORD = '([^']+)'/)[1]);
    await win.getByRole('button', { name: 'Entrar', exact: true }).click();
    await win.getByRole('button', { name: 'Testar Conexão', exact: true }).waitFor();
    await win.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
    await win.screenshot({ path: path.join(qa, 'magisform-settings.png') });
    assert.equal(await app.evaluate(({ app }) => app.getName()), 'MagisForm');
    assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), configDir);
    console.log('MagisForm: login, logo, título e configuração validados com dados sintéticos.');
  } finally {
    await app.evaluate(({ app, BrowserWindow }) => { for (const win of BrowserWindow.getAllWindows()) win.destroy(); app.exit(0); }).catch(() => {});
    await app.close().catch(() => {});
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf8')), config);
})().catch(error => { console.error(error); process.exit(1); });
