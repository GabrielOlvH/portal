import type { Hono } from 'hono';
import { homedir } from 'os';
import { basename, dirname, join } from 'path';
import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from 'fs/promises';
import { jsonError } from '../errors';

type CliProvider = 'claude' | 'codex' | 'opencode';
type CliAssetType = 'skill' | 'mcp' | 'rule' | 'agent';

type CliAsset = {
  id: string;
  provider: CliProvider;
  type: CliAssetType;
  name: string;
  content: string;
  updatedAt?: number;
  path?: string;
  meta?: {
    filename?: string;
    raw?: boolean;
    source?: string;
    description?: string;
    userInvocable?: boolean;
    keywords?: string[];
  };
};

const PROVIDERS: CliProvider[] = ['claude', 'codex', 'opencode'];
const ASSET_TYPES: CliAssetType[] = ['skill', 'mcp', 'rule', 'agent'];

// Flat file types (rules, agents) vs folder types (skills)
type FlatFileType = 'rule' | 'agent';
type FolderType = 'skill';

const PROVIDER_PATHS: Record<CliProvider, {
  skill: string[];
  rule: string[];
  agent: string[];
  mcp: string[];
}> = {
  claude: {
    skill: ['.claude/skills'],
    rule: ['.claude/rules'],
    agent: ['.claude/agents'],
    mcp: ['.claude/mcp.json', '.claude/mcp.jsonc'],
  },
  codex: {
    skill: ['.codex/skills'],
    rule: ['.codex/rules'],
    agent: [],
    mcp: ['.codex/mcp.json', '.codex/mcp.jsonc'],
  },
  opencode: {
    skill: ['.config/opencode/skills', '.opencode/skills'],
    rule: ['.config/opencode/instructions', '.opencode/instructions'],
    agent: [],
    mcp: ['.config/opencode/mcp.json', '.opencode/mcp.json'],
  },
};

function toAbsolutePath(path: string): string {
  if (path === '~') {
    return homedir();
  }
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  if (path.startsWith('/')) {
    return path;
  }
  return join(homedir(), path);
}

async function exists(path: string): Promise<Awaited<ReturnType<typeof stat>> | null> {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

async function resolveFirstExisting(paths: string[], wantDir: boolean): Promise<string | null> {
  for (const candidate of paths) {
    const abs = toAbsolutePath(candidate);
    const info = await exists(abs);
    if (!info) continue;
    if (wantDir && info.isDirectory()) return abs;
    if (!wantDir && info.isFile()) return abs;
  }
  return null;
}

async function resolveAssetDir(provider: CliProvider, type: FlatFileType | FolderType, ensure: boolean) {
  const candidates = PROVIDER_PATHS[provider][type];
  if (!candidates || candidates.length === 0) {
    throw new Error(`${type} not supported for ${provider}`);
  }
  const existing = await resolveFirstExisting(candidates, true);
  const fallback = toAbsolutePath(candidates[0]);
  if (!existing && ensure) {
    await mkdir(fallback, { recursive: true });
  }
  return existing ?? fallback;
}

async function resolveMcpFile(provider: CliProvider, ensure: boolean) {
  const candidates = PROVIDER_PATHS[provider].mcp;
  const existing = await resolveFirstExisting(candidates, false);
  const fallback = toAbsolutePath(candidates[0]);
  if (!existing && ensure) {
    await mkdir(dirname(fallback), { recursive: true });
  }
  return existing ?? fallback;
}

function sanitizeAssetName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const safeBase = basename(trimmed).replace(/[\\/]/g, '').trim();
  return safeBase.replace(/\s+/g, ' ').trim();
}

function ensureExtension(filename: string, fallbackExt: string): string {
  if (extname(filename)) return filename;
  return `${filename}${fallbackExt}`;
}

// List flat file assets (rules, agents) - simple .md files in a directory
async function listFlatFileAssets(provider: CliProvider, type: FlatFileType): Promise<CliAsset[]> {
  const candidates = PROVIDER_PATHS[provider][type];
  if (!candidates || candidates.length === 0) return [];

  let dir: string;
  try {
    dir = await resolveAssetDir(provider, type, false);
  } catch {
    return [];
  }
  const info = await exists(dir);
  if (!info || !info.isDirectory()) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  const assets: CliAsset[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.startsWith('.')) continue;
    const filePath = join(dir, entry.name);
    const content = await readFile(filePath, 'utf-8').catch(() => '');
    const stats = await stat(filePath).catch(() => null);
    const name = entry.name.replace(/\.[^.]+$/, '');

    assets.push({
      id: `${provider}:${type}:${entry.name}`,
      provider,
      type,
      name,
      content,
      updatedAt: stats?.mtimeMs,
      path: filePath,
      meta: { filename: entry.name },
    });
  }

  return assets;
}

// Parse YAML frontmatter from markdown content
function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const [, yaml, body] = match;
  const frontmatter: Record<string, unknown> = {};

  // Simple YAML parser for common fields
  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();

    // Parse arrays like [a, b, c]
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s) => s.trim());
    }
    // Parse booleans
    else if (value === 'true') value = true;
    else if (value === 'false') value = false;

    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

// List skill assets - folders with SKILL.md inside
async function listSkillAssets(provider: CliProvider): Promise<CliAsset[]> {
  const candidates = PROVIDER_PATHS[provider].skill;
  if (!candidates || candidates.length === 0) return [];

  let dir: string;
  try {
    dir = await resolveAssetDir(provider, 'skill', false);
  } catch {
    return [];
  }
  const info = await exists(dir);
  if (!info || !info.isDirectory()) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  const assets: CliAsset[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;

    const skillPath = join(dir, entry.name, 'SKILL.md');
    const content = await readFile(skillPath, 'utf-8').catch(() => null);
    if (content === null) continue; // Skip folders without SKILL.md

    const stats = await stat(skillPath).catch(() => null);
    const { frontmatter } = parseFrontmatter(content);

    assets.push({
      id: `${provider}:skill:${entry.name}`,
      provider,
      type: 'skill',
      name: entry.name,
      content,
      updatedAt: stats?.mtimeMs,
      path: skillPath,
      meta: {
        filename: entry.name,
        description: typeof frontmatter.description === 'string' ? frontmatter.description : undefined,
        userInvocable: frontmatter['user-invocable'] === true || frontmatter['user_invocable'] === true,
        keywords: Array.isArray(frontmatter.keywords) ? frontmatter.keywords : undefined,
      },
    });
  }

  return assets;
}

function stripJsonComments(content: string): string {
  const withoutBlock = content.replace(/\/\*[\s\S]*?\*\//g, '');
  return withoutBlock.replace(/^\s*\/\/.*$/gm, '');
}

function tryParseJson(content: string): unknown | null {
  try {
    return JSON.parse(content);
  } catch {
    try {
      return JSON.parse(stripJsonComments(content));
    } catch {
      return null;
    }
  }
}

function extractMcpServers(value: unknown): {
  root: Record<string, unknown>;
  key: 'mcpServers' | 'servers';
  servers: Record<string, unknown>;
} | null {
  if (!value || typeof value !== 'object') return null;
  const root = value as Record<string, unknown>;
  const mcpServers = root.mcpServers;
  if (mcpServers && typeof mcpServers === 'object' && !Array.isArray(mcpServers)) {
    return { root, key: 'mcpServers', servers: mcpServers as Record<string, unknown> };
  }
  const servers = root.servers;
  if (servers && typeof servers === 'object' && !Array.isArray(servers)) {
    return { root, key: 'servers', servers: servers as Record<string, unknown> };
  }
  return null;
}

async function listMcpAssets(provider: CliProvider): Promise<CliAsset[]> {
  const filePath = await resolveMcpFile(provider, false);
  const raw = await readFile(filePath, 'utf-8').catch(() => null);
  if (!raw) return [];

  const parsed = tryParseJson(raw);
  const extracted = parsed ? extractMcpServers(parsed) : null;

  if (!extracted) {
    return [
      {
        id: `${provider}:mcp:raw`,
        provider,
        type: 'mcp',
        name: 'raw',
        content: raw,
        updatedAt: (await stat(filePath).catch(() => null))?.mtimeMs,
        path: filePath,
        meta: { raw: true },
      },
    ];
  }

  const stats = await stat(filePath).catch(() => null);
  return Object.entries(extracted.servers).map(([name, config]) => ({
    id: `${provider}:mcp:${name}`,
    provider,
    type: 'mcp',
    name,
    content: JSON.stringify(config, null, 2),
    updatedAt: stats?.mtimeMs,
    path: filePath,
    meta: { source: extracted.key },
  }));
}

// Upsert flat file asset (rules, agents)
async function upsertFlatFileAsset(
  provider: CliProvider,
  type: FlatFileType,
  name: string,
  content: string
) {
  const safeName = sanitizeAssetName(name);
  if (!safeName) {
    throw new Error('Invalid name');
  }
  const dir = await resolveAssetDir(provider, type, true);
  const filename = ensureExtension(safeName, '.md');
  const path = join(dir, filename);
  await writeFile(path, content, 'utf-8');
}

// Delete flat file asset (rules, agents)
async function deleteFlatFileAsset(
  provider: CliProvider,
  type: FlatFileType,
  name: string
) {
  const safeName = sanitizeAssetName(name);
  if (!safeName) {
    throw new Error('Invalid name');
  }
  const dir = await resolveAssetDir(provider, type, false);
  const filename = ensureExtension(safeName, '.md');
  const path = join(dir, filename);
  await unlink(path);
}

// Upsert skill asset - creates folder with SKILL.md
async function upsertSkillAsset(
  provider: CliProvider,
  name: string,
  content: string
) {
  const safeName = sanitizeAssetName(name);
  if (!safeName) {
    throw new Error('Invalid name');
  }
  const dir = await resolveAssetDir(provider, 'skill', true);
  const skillDir = join(dir, safeName);
  await mkdir(skillDir, { recursive: true });
  const skillPath = join(skillDir, 'SKILL.md');
  await writeFile(skillPath, content, 'utf-8');
}

// Delete skill asset - removes the whole folder
async function deleteSkillAsset(
  provider: CliProvider,
  name: string
) {
  const safeName = sanitizeAssetName(name);
  if (!safeName) {
    throw new Error('Invalid name');
  }
  const dir = await resolveAssetDir(provider, 'skill', false);
  const skillDir = join(dir, safeName);
  await rm(skillDir, { recursive: true, force: true });
}

async function upsertMcpAsset(provider: CliProvider, name: string, content: string) {
  const filePath = await resolveMcpFile(provider, true);
  const existingRaw = await readFile(filePath, 'utf-8').catch(() => '');
  const parsed = existingRaw ? tryParseJson(existingRaw) : null;

  if (name === 'raw') {
    await writeFile(filePath, content, 'utf-8');
    return;
  }

  const configValue = tryParseJson(content);
  if (configValue === null) {
    throw new Error('Invalid MCP server JSON');
  }

  let root: Record<string, unknown> = {};
  let key: 'mcpServers' | 'servers' = 'mcpServers';
  let servers: Record<string, unknown> = {};

  if (parsed) {
    const extracted = extractMcpServers(parsed);
    if (extracted) {
      root = extracted.root;
      key = extracted.key;
      servers = extracted.servers;
    } else {
      root = parsed as Record<string, unknown>;
    }
  }

  servers = { ...servers, [name]: configValue };
  root[key] = servers;

  await writeFile(filePath, `${JSON.stringify(root, null, 2)}\n`, 'utf-8');
}

async function deleteMcpAsset(provider: CliProvider, name: string) {
  const filePath = await resolveMcpFile(provider, false);
  if (name === 'raw') {
    await unlink(filePath);
    return;
  }
  const raw = await readFile(filePath, 'utf-8').catch(() => null);
  if (!raw) return;

  const parsed = tryParseJson(raw);
  const extracted = parsed ? extractMcpServers(parsed) : null;
  if (!extracted) {
    throw new Error('Unsupported MCP config format');
  }

  const nextServers = { ...extracted.servers };
  delete nextServers[name];
  extracted.root[extracted.key] = nextServers;
  await writeFile(filePath, `${JSON.stringify(extracted.root, null, 2)}\n`, 'utf-8');
}

export function registerCliAssetRoutes(app: Hono) {
  app.get('/cli-assets', async (c) => {
    try {
      const type = c.req.query('type') as CliAssetType | undefined;
      const provider = c.req.query('provider') as CliProvider | undefined;

      if (!type || !ASSET_TYPES.includes(type)) {
        return c.json({ error: 'type query parameter is required' }, 400);
      }

      if (provider && !PROVIDERS.includes(provider)) {
        return c.json({ error: 'Invalid provider' }, 400);
      }

      const providers = provider ? [provider] : PROVIDERS;
      const assets: CliAsset[] = [];

      for (const item of providers) {
        if (type === 'mcp') {
          assets.push(...await listMcpAssets(item));
        } else if (type === 'skill') {
          assets.push(...await listSkillAssets(item));
        } else {
          // rule or agent - flat file types
          assets.push(...await listFlatFileAssets(item, type));
        }
      }

      return c.json({ assets });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.post('/cli-assets', async (c) => {
    try {
      const payload = (await c.req.json()) as {
        provider?: CliProvider;
        type?: CliAssetType;
        name?: string;
        content?: string;
      };

      const provider = payload.provider;
      const type = payload.type;
      const name = typeof payload.name === 'string' ? payload.name : '';
      const content = typeof payload.content === 'string' ? payload.content : '';

      if (!provider || !type || !name) {
        return c.json({ error: 'provider, type, name required' }, 400);
      }

      if (!PROVIDERS.includes(provider)) {
        return c.json({ error: 'Invalid provider' }, 400);
      }

      if (!ASSET_TYPES.includes(type)) {
        return c.json({ error: 'Invalid type' }, 400);
      }

      if (type === 'mcp') {
        await upsertMcpAsset(provider, name, content);
      } else if (type === 'skill') {
        await upsertSkillAsset(provider, name, content);
      } else {
        // rule or agent - flat file types
        await upsertFlatFileAsset(provider, type, name, content);
      }

      return c.json({ ok: true });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.delete('/cli-assets', async (c) => {
    try {
      const payload = (await c.req.json()) as {
        provider?: CliProvider;
        type?: CliAssetType;
        name?: string;
      };

      const provider = payload.provider;
      const type = payload.type;
      const name = typeof payload.name === 'string' ? payload.name : '';

      if (!provider || !type || !name) {
        return c.json({ error: 'provider, type, name required' }, 400);
      }

      if (!PROVIDERS.includes(provider)) {
        return c.json({ error: 'Invalid provider' }, 400);
      }

      if (!ASSET_TYPES.includes(type)) {
        return c.json({ error: 'Invalid type' }, 400);
      }

      if (type === 'mcp') {
        await deleteMcpAsset(provider, name);
      } else if (type === 'skill') {
        await deleteSkillAsset(provider, name);
      } else {
        // rule or agent - flat file types
        await deleteFlatFileAsset(provider, type, name);
      }

      return c.json({ ok: true });
    } catch (err) {
      return jsonError(c, err);
    }
  });
}
