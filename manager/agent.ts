import Fastify from 'fastify';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { CreateTenantInput, ManagedTenant, TenantAction, TenantControl, TenantPackage } from './contracts.js';

const execFileAsync = promisify(execFile);
const idPattern = /^[a-z][a-z0-9-]{1,30}$/;
const hostPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const imagePattern = /^[a-z0-9][a-z0-9._/:@-]*@sha256:[a-f0-9]{64}$/;
const namePattern = /^[\p{L}\p{N}][\p{L}\p{N} .,'()&-]{0,79}$/u;
const schema = z.object({
  id: z.string().regex(idPattern), host: z.string().toLowerCase().regex(hostPattern),
  name: z.string().trim().min(1).max(80).regex(namePattern),
  adminName: z.string().trim().min(1).max(120), adminUsername: z.string().trim().regex(/^[A-Za-z0-9_.-]{1,50}$/),
  image: z.string().regex(imagePattern),
});
const actionSchema = z.object({ action: z.enum(['start', 'stop', 'restart']) });

type CatalogEntry = { host: string; alias: string; image: string; brand?: string; status: string; createdAt: string; compose: string };
type Catalog = Record<string, CatalogEntry>;
type AgentConfig = { root: string; token: string; port: number; approvedImages: string[] };

export function validateTenantCreation(input: unknown, approvedImages: string[]): CreateTenantInput {
  const value = schema.parse(input);
  if (!approvedImages.includes(value.image)) throw new Error('A imagem selecionada não está aprovada para provisionamento.');
  return value;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readCatalog(file: string): Promise<Catalog> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Catálogo inválido.');
    return parsed as Catalog;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

async function run(command: string, args: string[], cwd: string, extraEnv?: NodeJS.ProcessEnv) {
  return execFileAsync(command, args, { cwd, env: extraEnv ? { ...process.env, ...extraEnv } : process.env, windowsHide: true, timeout: 10 * 60_000, maxBuffer: 2 * 1024 * 1024 });
}

export function createTenantControl(config: AgentConfig): TenantControl {
  const catalogFile = path.join(config.root, 'deploy', 'tenants', 'catalog.json');
  const tenantRoot = path.join(config.root, 'deploy', 'tenants');
  let creationInProgress = false;

  const validateInput = (input: unknown): CreateTenantInput => validateTenantCreation(input, config.approvedImages);
  const entryFor = async (id: string) => {
    if (!idPattern.test(id)) throw new Error('Identificador inválido.');
    const catalog = await readCatalog(catalogFile);
    const entry = catalog[id];
    if (!entry || entry.compose !== `deploy/tenants/${id}/compose.yaml`) throw new Error('Instalação não encontrada no catálogo gerenciado.');
    const directory = path.resolve(config.root, entry.compose, '..');
    if (!directory.startsWith(`${path.resolve(tenantRoot)}${path.sep}`)) throw new Error('Caminho operacional inválido.');
    return { entry, directory, project: `magisform-${id}` };
  };

  return {
    async list(): Promise<ManagedTenant[]> {
      const catalog = await readCatalog(catalogFile);
      const tenants = await Promise.all(Object.entries(catalog).filter(([id, value]) => idPattern.test(id) && value.compose === `deploy/tenants/${id}/compose.yaml`).map(async ([id, entry]) => {
        const project = `magisform-${id}`;
        let containers: ManagedTenant['containers'] = [];
        try {
          const { stdout } = await run('docker', ['ps', '--all', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.Names}}\t{{.Image}}\t{{.State}}\t{{.Status}}\t{{.Label "com.docker.compose.service"}}'], config.root);
          containers = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => {
            const [name, image, state, status, service] = line.split('\t');
            const health = status?.match(/\((healthy|unhealthy|starting)\)/)?.[1] ?? null;
            return { name: name ?? '', service: service ?? 'serviço', image: image ?? '', state: state ?? 'unknown', health };
          });
        } catch {
          containers = [{ name: 'Docker indisponível', service: 'daemon', image: '', state: 'unavailable', health: null }];
        }
        return { id, name: entry.brand || id, host: entry.host, image: entry.image, status: entry.status, createdAt: entry.createdAt, containers };
      }));
      return tenants.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    },

    async create(rawInput: CreateTenantInput) {
      const input = validateInput(rawInput);
      if (creationInProgress) throw Object.assign(new Error('Outro provisionamento está em andamento.'), { statusCode: 409 });
      creationInProgress = true;
      try {
        const catalog = await readCatalog(catalogFile);
        const existing = catalog[input.id];
        if (existing && (existing.status === 'provisioned' || existing.host !== input.host || existing.image !== input.image || existing.brand !== input.name)) throw Object.assign(new Error('O identificador já pertence a uma instalação e não pode ser substituído.'), { statusCode: 409 });
        if (Object.entries(catalog).some(([id, item]) => id !== input.id && item.host.toLowerCase() === input.host)) throw Object.assign(new Error('O domínio já está cadastrado.'), { statusCode: 409 });
        if (existing && !['prepared', 'provisioning'].includes(existing.status)) throw Object.assign(new Error('Estado intermediário não pode ser retomado automaticamente.'), { statusCode: 409 });
        const args = ['scripts/provision-tenant.mjs', input.id, input.host, '--image', input.image, '--brand', input.name, '--admin-name', input.adminName, '--admin-user', input.adminUsername, '--apply', '--json-result'];
        const { stdout } = await run(process.execPath, args, config.root, { MAGISFORM_PROVISION_ROOT: config.root });
        const result = JSON.parse(stdout.trim()) as { id: string; host: string; name: string; admin: { name: string; username: string; password: string } };
        if (result.id !== input.id || result.host !== input.host || !result.admin?.password) throw new Error('Provisionamento não retornou a confirmação esperada.');
        return result.admin;
      } finally { creationInProgress = false; }
    },

    async action(id: string, action: TenantAction) {
      if (!['start', 'stop', 'restart'].includes(action)) throw new Error('Operação não permitida.');
      const { directory, project } = await entryFor(id);
      const { entry } = await entryFor(id);
      if (entry.status !== 'provisioned') throw Object.assign(new Error('A instalação ainda não está provisionada e não aceita ações de ciclo de vida.'), { statusCode: 409 });
      const { stdout: stateOutput } = await run('docker', ['ps', '--all', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.ID}}'], config.root);
      if (!stateOutput.trim()) throw new Error('Não há containers registrados para esta instalação.');
      const envFile = path.join(directory, '.env');
      await fs.access(envFile);
      try {
        await run('docker', ['compose', '--project-name', project, '--env-file', envFile, '--file', path.join(directory, 'compose.yaml'), action], directory);
        await fs.appendFile(path.join(config.root, 'deploy', 'tenants', 'manager-audit.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), action, id, host: entry.host, outcome: 'success' })}\n`, { mode: 0o600 });
      } catch (error) {
        await fs.appendFile(path.join(config.root, 'deploy', 'tenants', 'manager-audit.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), action, id, host: entry.host, outcome: 'failure', errorType: error instanceof Error ? error.name : 'UnknownError' })}\n`, { mode: 0o600 });
        throw error;
      }
    },

    async generate(rawInput: CreateTenantInput): Promise<TenantPackage> {
      const input = validateInput(rawInput);
      const catalog = await readCatalog(catalogFile);
      if (catalog[input.id] || Object.values(catalog).some((item) => item.host.toLowerCase() === input.host)) throw new Error('O identificador ou domínio já está cadastrado.');
      const compose = await fs.readFile(path.join(config.root, 'deploy', 'tenant-template', 'compose.yaml'), 'utf8');
      const values: Record<string, string> = {
        COMPOSE_PROJECT_NAME: `magisform-${input.id}`, MAGISFORM_IMAGE: input.image,
        TENANT_HOST: input.host, TENANT_NAME: input.name, TENANT_BRAND: input.name,
        TENANT_BRAND_PRIMARY: '#D95C4F', TENANT_BRAND_SECONDARY: '#173E35', TENANT_BRAND_BACKGROUND: '#F4F1E9',
        TENANT_BRAND_SURFACE: '#FFFDF8', TENANT_BRAND_INK: '#17201D', TENANT_BRAND_MUTED: '#5F6965',
        TENANT_ALIAS: `mf-${input.id}`, TENANT_EDGE_NETWORK: `npm-${input.id}`, TENANT_EDGE_CIDR: 'PREENCHER_CIDR_EXCLUSIVO',
      };
      const envExample = Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
      const instructions = `# Instalação MagisForm — ${input.name}\n\nIdentificador: ${input.id}\nDomínio: ${input.host}\nImagem aprovada: ${input.image}\nAlias NPM: mf-${input.id}:3001\n\n1. Copie compose.yaml e .env.example para uma pasta exclusiva no servidor e renomeie .env.example para .env.\n2. Substitua PREENCHER_CIDR_EXCLUSIVO por uma sub-rede /24 ainda livre no Docker.\n3. Crie secrets/db_password.txt e secrets/db_root_password.txt com valores aleatórios longos; restrinja a leitura ao operador.\n4. Crie a rede npm-${input.id} com o CIDR escolhido e o rótulo com.magisform.tenant=${input.id}.\n5. Execute docker compose up -d db, valide a saúde, aplique o bootstrap pelo procedimento operacional e depois execute docker compose up -d app.\n6. Conecte o NPM à rede npm-${input.id} e cadastre manualmente ${input.host} apontando para mf-${input.id}:3001 com TLS/Force SSL.\n\nNunca inclua os segredos no Git, em logs ou em mensagens. Preserve o volume em qualquer parada.\n`;
      return { id: input.id, host: input.host, name: input.name, image: input.image, compose, envExample, instructions };
    },
  };
}

export async function startAgent(config: AgentConfig, runtimeRoot = '/opt/magisform-runtime'): Promise<void> {
  if (!config.token || config.token.length < 40) throw new Error('Segredo de comunicação interna ausente ou curto.');
  const root = path.resolve(config.root);
  if (root === path.parse(root).root) throw new Error('Diretório de estado inválido.');
  await fs.mkdir(path.join(root, 'deploy', 'tenants'), { recursive: true, mode: 0o700 });
  for (const relative of ['deploy/tenant-template', 'database/upgrades']) await fs.cp(path.join(runtimeRoot, relative), path.join(root, relative), { recursive: true, force: true });
  await fs.mkdir(path.join(root, 'scripts'), { recursive: true, mode: 0o700 });
  for (const file of ['provision-tenant.mjs', 'tenant-initial-admin.mjs', 'database-schema.mjs']) await fs.copyFile(path.join(runtimeRoot, 'scripts', file), path.join(root, 'scripts', file));
  await fs.copyFile(path.join(runtimeRoot, 'database.sql'), path.join(root, 'database.sql'));
  const control = createTenantControl(config);
  const app = Fastify({ logger: { level: 'warn', redact: { paths: ['req.headers.authorization', 'req.body'], censor: '[REDACTED]' } }, bodyLimit: 64 * 1024 });
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.split('?')[0] === '/health/live') return;
    const auth = request.headers.authorization ?? '';
    if (!safeEqual(auth, `Bearer ${config.token}`)) return reply.code(401).send({ error: 'Não autorizado.' });
  });
  app.get('/internal/health', async () => ({ status: 'ok' }));
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & { statusCode?: number };
    request.log.error({ operation: `${request.method} ${request.url.split('?')[0]}`, errorType: err.name }, 'Falha na operação interna do executor');
    const status = err.statusCode ?? (error instanceof z.ZodError ? 400 : 500);
    return reply.code(status).send({ error: status >= 500 ? 'Falha interna no executor.' : 'Dados inválidos.' });
  });
  app.get('/internal/installations', async () => ({ data: await control.list() }));
  app.post('/internal/installations', async (request, reply) => {
    const input = schema.parse(request.body);
    const admin = await control.create(input);
    reply.code(201);
    return { data: { admin } };
  });
  app.post('/internal/installations/:id/actions', async (request) => {
    const params = z.object({ id: z.string().regex(idPattern) }).parse(request.params);
    const body = actionSchema.parse(request.body);
    await control.action(params.id, body.action);
    return { data: { success: true } };
  });
  app.post('/internal/installations/package', async (request) => ({ data: await control.generate(schema.parse(request.body)) }));
  await app.listen({ host: '0.0.0.0', port: config.port });
}
