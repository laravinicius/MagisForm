import https from 'node:https';
import { readFile } from 'node:fs/promises';

const [keyPath, certificatePath, portArg = '28444', upstreamPortArg = '28443'] = process.argv.slice(2);
if (!keyPath || !certificatePath) throw new Error('Uso: node stage11-electron-proxy.mjs <key.pem> <certificate.pem> [porta-local] [porta-https-npm]');
const key = await readFile(keyPath);
const cert = await readFile(certificatePath);
const server = https.createServer({ key, cert }, (incoming, outgoing) => {
  const upstream = https.request({ hostname: 'qa-a.invalid', port: Number(upstreamPortArg), method: incoming.method, path: incoming.url, rejectUnauthorized: false, lookup: (_hostname, options, callback) => {
    if (typeof options === 'function') { callback = options; options = {}; }
    if (options?.all) callback(null, [{ address: '127.0.0.1', family: 4 }]);
    else callback(null, '127.0.0.1', 4);
  }, headers: { ...incoming.headers, host: 'qa-a.invalid' } }, (response) => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  upstream.on('error', () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end('QA proxy indisponível.'); });
  incoming.pipe(upstream);
});
server.listen(Number(portArg), '127.0.0.1', () => process.stdout.write(`Proxy Electron QA escutando em 127.0.0.1:${portArg}.\n`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
