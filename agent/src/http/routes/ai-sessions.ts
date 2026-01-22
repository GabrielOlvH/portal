import type { Hono } from 'hono';
import { open, readdir, readFile, stat } from 'fs/promises';
import { basename, join } from 'path';
import { homedir } from 'os';
import { jsonError } from '../errors';

type AiProvider = 'claude' | 'codex' | 'opencode';

type AiSessionTokenUsage = {
  input: number;
  output: number;
  cached?: number;
};

type AiSession = {
  id: string;
  provider: AiProvider;
  directory: string;
  summary: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessage: string;
  modifiedFiles: string[];
  tokenUsage?: AiSessionTokenUsage;
  toolsUsed?: string[];
  gitBranch?: string;
};

type AiSessionMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: string[];
};

type AiSessionDetail = AiSession & {
  messages: AiSessionMessage[];
  fullHistory?: boolean;
};

type SessionCache = {
  sessions: Map<string, AiSession>;
  details: Map<string, AiSessionDetail>;
  lastRefresh: number;
  maxAgeDays?: number;
};

const cache: SessionCache = {
  sessions: new Map(),
  details: new Map(),
  lastRefresh: 0,
  maxAgeDays: undefined,
};

const CACHE_TTL_MS = 120000; // 2 minutes
const DEFAULT_MAX_AGE_DAYS = 30;

function isCacheValid(maxAgeDays: number): boolean {
  if (cache.maxAgeDays == null) return false;
  if (cache.maxAgeDays < maxAgeDays) return false;
  return Date.now() - cache.lastRefresh < CACHE_TTL_MS;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function safeReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

async function safeStat(path: string): Promise<Awaited<ReturnType<typeof stat>> | null> {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

async function safeReadDir(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

function parseJsonlLines<T>(content: string): T[] {
  const results: T[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      results.push(JSON.parse(trimmed) as T);
    } catch {
      // Skip malformed lines
    }
  }
  return results;
}

async function readFileChunk(path: string, maxBytes: number): Promise<string | null> {
  try {
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
      if (!bytesRead) return null;
      return buffer.slice(0, bytesRead).toString('utf-8');
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

// Claude Code Session Parsing

type ClaudeHistoryEntry = {
  display: string;
  timestamp: number;
  project: string;
  sessionId: string;
};

type ClaudeSessionIndex = {
  version: number;
  entries: Array<{
    sessionId: string;
    fullPath: string;
    fileMtime: number;
    firstPrompt: string;
    messageCount: number;
    created: string;
    modified: string;
    gitBranch?: string;
    projectPath: string;
  }>;
};

type ClaudeTranscriptEntry = {
  type: 'user' | 'assistant' | 'summary' | 'progress' | 'file-history-snapshot';
  message?: {
    role: string;
    content: string | Array<{ type: string; text?: string; name?: string; input?: { file_path?: string } }>;
  };
  uuid?: string;
  timestamp?: string;
  summary?: string;
};

// Max age for scanning sessions (30 days in ms)
async function parseClaudeSessions(maxAgeMs: number): Promise<AiSession[]> {
  const sessions: AiSession[] = [];
  const claudeDir = join(homedir(), '.claude');
  const projectsDir = join(claudeDir, 'projects');

  if (!(await fileExists(projectsDir))) return sessions;

  const projectDirs = await safeReadDir(projectsDir);
  const cutoffTime = Date.now() - maxAgeMs;

  for (const projectDirName of projectDirs) {
    const projectPath = join(projectsDir, projectDirName);
    const indexPath = join(projectPath, 'sessions-index.json');

    const indexContent = await safeReadFile(indexPath);
    if (!indexContent) continue;

    let index: ClaudeSessionIndex;
    try {
      index = JSON.parse(indexContent);
    } catch {
      continue;
    }

    for (const entry of index.entries || []) {
      // Skip sessions older than the requested window (use fileMtime which is in ms)
      if (entry.fileMtime && entry.fileMtime < cutoffTime) {
        continue;
      }
      const summary = entry.firstPrompt || 'Claude Code Session';
      const lastMessage = summary.slice(0, 200);

      // Decode project path from directory name
      const decodedPath = projectDirName.replace(/-/g, '/');

      sessions.push({
        id: entry.sessionId,
        provider: 'claude',
        directory: entry.projectPath || decodedPath,
        summary,
        createdAt: new Date(entry.created).getTime(),
        updatedAt: new Date(entry.modified).getTime(),
        messageCount: entry.messageCount || 0,
        lastMessage,
        modifiedFiles: [],
        toolsUsed: [],
        gitBranch: entry.gitBranch || undefined,
      });
    }
  }

  return sessions;
}

// Codex CLI Session Parsing

type CodexSessionMeta = {
  timestamp: string;
  type: 'session_meta';
  payload: {
    id: string;
    timestamp: string;
    cwd: string;
    cli_version?: string;
    git?: {
      branch?: string;
    };
  };
};

type CodexEventMsg = {
  timestamp: string;
  type: 'event_msg';
  payload: {
    type: string;
    message?: string;
    info?: {
      total_token_usage?: {
        input_tokens: number;
        output_tokens: number;
        cached_input_tokens?: number;
      };
    };
  };
};

type CodexResponseItem = {
  timestamp: string;
  type: 'response_item';
  payload: {
    type: string;
    role?: string;
    name?: string;
    content?: Array<{ type: string; text?: string }>;
    arguments?: string;
  };
};

type CodexLine = CodexSessionMeta | CodexEventMsg | CodexResponseItem | { type: string; timestamp?: string };

function extractCodexMeta(chunk: string): { id: string; cwd: string; gitBranch?: string } | null {
  const idMatch = chunk.match(/"id":"([^"]+)"/);
  const cwdMatch = chunk.match(/"cwd":"([^"]+)"/);
  if (!idMatch || !cwdMatch) return null;
  const gitMatch = chunk.match(/"git":\{"branch":"([^"]+)"/);
  return {
    id: idMatch[1],
    cwd: cwdMatch[1],
    gitBranch: gitMatch ? gitMatch[1] : undefined,
  };
}

function toDayTimestamp(year: string, month: string, day: string): number {
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getTime();
}

async function parseCodexSessions(maxAgeMs: number): Promise<AiSession[]> {
  const sessions: AiSession[] = [];
  const codexDir = join(homedir(), '.codex', 'sessions');

  if (!(await fileExists(codexDir))) return sessions;

  const cutoffTime = Date.now() - maxAgeMs;
  // Scan year/month/day directories
  const years = await safeReadDir(codexDir);

  for (const year of years.slice(-2)) { // Last 2 years
    const yearPath = join(codexDir, year);
    const months = await safeReadDir(yearPath);

    for (const month of months) {
      const monthPath = join(yearPath, month);
      const days = await safeReadDir(monthPath);

      for (const day of days) {
        const dayTimestamp = toDayTimestamp(year, month, day);
        if (dayTimestamp + (24 * 60 * 60 * 1000) < cutoffTime) {
          continue;
        }
        const dayPath = join(monthPath, day);
        const files = await safeReadDir(dayPath);
        const rolloutFiles = files.filter(f => f.startsWith('rollout-') && f.endsWith('.jsonl'));

        for (const rolloutFile of rolloutFiles) {
          const filePath = join(dayPath, rolloutFile);
          let chunk = await readFileChunk(filePath, 64 * 1024);
          if (!chunk) continue;

          let meta: CodexSessionMeta | null = null;
          const firstNewline = chunk.indexOf('\n');
          if (firstNewline !== -1) {
            try {
              const firstLine = chunk.slice(0, firstNewline).trim();
              const parsed = JSON.parse(firstLine) as CodexLine;
              if (parsed.type === 'session_meta') {
                meta = parsed as CodexSessionMeta;
              }
            } catch {
              // Fall back to regex below
            }
          }

          let extracted = meta
            ? { id: meta.payload.id, cwd: meta.payload.cwd, gitBranch: meta.payload.git?.branch }
            : extractCodexMeta(chunk);
          if (!extracted) {
            chunk = await readFileChunk(filePath, 256 * 1024);
            extracted = chunk ? extractCodexMeta(chunk) : null;
          }
          if (!extracted) continue;

          const stats = await safeStat(filePath);
          const updatedAt = stats?.mtimeMs ?? dayTimestamp;
          const createdAt = stats?.ctimeMs ?? updatedAt;

          const summary = extracted.cwd ? basename(extracted.cwd) : 'Codex CLI Session';
          sessions.push({
            id: extracted.id,
            provider: 'codex',
            directory: extracted.cwd,
            summary,
            createdAt,
            updatedAt,
            messageCount: 0,
            lastMessage: summary,
            modifiedFiles: [],
            toolsUsed: [],
            gitBranch: extracted.gitBranch,
          });
        }
      }
    }
  }

  return sessions;
}

// OpenCode Session Parsing

type OpenCodeSession = {
  id: string;
  slug?: string;
  version?: string;
  projectID: string;
  directory: string;
  title?: string;
  time: {
    created: number;
    updated: number;
  };
  summary?: {
    additions?: number;
    deletions?: number;
    files?: number;
  };
};

type OpenCodeMessage = {
  id: string;
  sessionID: string;
  role: string;
  time: {
    created: number;
    completed?: number;
  };
  modelID?: string;
  tokens?: {
    input: number;
    output: number;
    cache?: {
      read?: number;
      write?: number;
    };
  };
};

type OpenCodePart = {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  tool?: string;
  state?: {
    input?: Record<string, unknown>;
    output?: string;
  };
};

async function parseOpenCodeSessions(maxAgeMs: number): Promise<AiSession[]> {
  const sessions: AiSession[] = [];
  const openCodeDir = join(homedir(), '.local', 'share', 'opencode', 'storage');

  if (!(await fileExists(openCodeDir))) return sessions;

  const sessionDir = join(openCodeDir, 'session');
  const messageDir = join(openCodeDir, 'message');

  const projectDirs = await safeReadDir(sessionDir);

  const cutoffTime = Date.now() - maxAgeMs;

  for (const projectId of projectDirs) {
    if (projectId === 'global') continue;

    const projectPath = join(sessionDir, projectId);
    const sessionFiles = await safeReadDir(projectPath);

    for (const sessionFile of sessionFiles) {
      if (!sessionFile.endsWith('.json')) continue;

      const sessionPath = join(projectPath, sessionFile);
      const content = await safeReadFile(sessionPath);
      if (!content) continue;

      let session: OpenCodeSession;
      try {
        session = JSON.parse(content);
      } catch {
        continue;
      }

      if (session.time.updated < cutoffTime) continue;

      const sessionId = session.id;
      const messagesPath = join(messageDir, sessionId);
      const messageFiles = await safeReadDir(messagesPath);

      const messageCount = messageFiles.filter((file) => file.endsWith('.json')).length;

      sessions.push({
        id: sessionId,
        provider: 'opencode',
        directory: session.directory,
        summary: session.title || session.slug || 'OpenCode Session',
        createdAt: session.time.created,
        updatedAt: session.time.updated,
        messageCount,
        lastMessage: session.title || session.slug || 'OpenCode Session',
        modifiedFiles: [],
        toolsUsed: [],
      });
    }
  }

  return sessions;
}

// Combined parsing

async function getAllSessions(maxAgeDays: number, forceRefresh = false): Promise<AiSession[]> {
  if (!forceRefresh && isCacheValid(maxAgeDays) && cache.sessions.size > 0) {
    return Array.from(cache.sessions.values());
  }

  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const [claudeSessions, codexSessions, openCodeSessions] = await Promise.all([
    parseClaudeSessions(maxAgeMs).catch(() => [] as AiSession[]),
    parseCodexSessions(maxAgeMs).catch(() => [] as AiSession[]),
    parseOpenCodeSessions(maxAgeMs).catch(() => [] as AiSession[]),
  ]);

  const allSessions = [...claudeSessions, ...codexSessions, ...openCodeSessions];

  // Sort by updatedAt descending
  allSessions.sort((a, b) => b.updatedAt - a.updatedAt);

  // Update cache
  cache.sessions.clear();
  for (const session of allSessions) {
    cache.sessions.set(`${session.provider}:${session.id}`, session);
  }
  cache.lastRefresh = Date.now();
  cache.maxAgeDays = maxAgeDays;

  return allSessions;
}

async function getSessionDetail(provider: AiProvider, sessionId: string): Promise<AiSessionDetail | null> {
  const cacheKey = `${provider}:${sessionId}`;

  // Check cache first
  if (isCacheValid(cache.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) && cache.details.has(cacheKey)) {
    return cache.details.get(cacheKey)!;
  }

  // Get base session info
  await getAllSessions(cache.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS);
  const baseSession = cache.sessions.get(cacheKey);
  if (!baseSession) return null;

  const messages: AiSessionMessage[] = [];

  if (provider === 'claude') {
    // Find and parse the transcript file
    const claudeDir = join(homedir(), '.claude', 'projects');
    const projectDirs = await safeReadDir(claudeDir);

    for (const projectDirName of projectDirs) {
      const indexPath = join(claudeDir, projectDirName, 'sessions-index.json');
      const indexContent = await safeReadFile(indexPath);
      if (!indexContent) continue;

      let index: ClaudeSessionIndex;
      try {
        index = JSON.parse(indexContent);
      } catch {
        continue;
      }

      const entry = index.entries?.find(e => e.sessionId === sessionId);
      if (!entry) continue;

      const transcriptContent = await safeReadFile(entry.fullPath);
      if (!transcriptContent) continue;

      const lines = parseJsonlLines<ClaudeTranscriptEntry>(transcriptContent);

      for (const line of lines) {
        if (line.type === 'user' && line.message?.content && line.timestamp) {
          const content = typeof line.message.content === 'string'
            ? line.message.content
            : line.message.content.find(b => b.type === 'text')?.text || '';

          messages.push({
            role: 'user',
            content,
            timestamp: new Date(line.timestamp).getTime(),
          });
        }

        if (line.type === 'assistant' && line.message?.content && line.timestamp) {
          const content = Array.isArray(line.message.content)
            ? line.message.content.find(b => b.type === 'text')?.text || ''
            : '';
          const toolCalls = Array.isArray(line.message.content)
            ? line.message.content.filter(b => b.type === 'tool_use').map(b => b.name || 'unknown')
            : [];

          if (content || toolCalls.length > 0) {
            messages.push({
              role: 'assistant',
              content,
              timestamp: new Date(line.timestamp).getTime(),
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            });
          }
        }
      }

      break;
    }
  } else if (provider === 'codex') {
    // Parse codex rollout file
    const codexDir = join(homedir(), '.codex', 'sessions');
    const years = await safeReadDir(codexDir);

    outer: for (const year of years.slice(-2)) {
      const yearPath = join(codexDir, year);
      const months = await safeReadDir(yearPath);

      for (const month of months) {
        const monthPath = join(yearPath, month);
        const days = await safeReadDir(monthPath);

        for (const day of days) {
          const dayPath = join(monthPath, day);
          const files = await safeReadDir(dayPath);
          const rolloutFiles = files.filter(f => f.includes(sessionId) && f.endsWith('.jsonl'));

          for (const rolloutFile of rolloutFiles) {
            const filePath = join(dayPath, rolloutFile);
            const content = await safeReadFile(filePath);
            if (!content) continue;

            const lines = parseJsonlLines<CodexLine>(content);

            for (const line of lines) {
              const ts = line.timestamp ? new Date(line.timestamp).getTime() : 0;

              if (line.type === 'event_msg') {
                const event = line as CodexEventMsg;
                if (event.payload.type === 'user_message' && event.payload.message) {
                  messages.push({
                    role: 'user',
                    content: event.payload.message,
                    timestamp: ts,
                  });
                }
              }

              if (line.type === 'response_item') {
                const item = line as CodexResponseItem;
                if (item.payload.type === 'message' && item.payload.role === 'assistant' && item.payload.content) {
                  const text = item.payload.content.find(b => b.type === 'text')?.text || '';
                  if (text) {
                    messages.push({
                      role: 'assistant',
                      content: text,
                      timestamp: ts,
                    });
                  }
                }
              }
            }

            break outer;
          }
        }
      }
    }
  } else if (provider === 'opencode') {
    // Parse opencode messages
    const messageDir = join(homedir(), '.local', 'share', 'opencode', 'storage', 'message', sessionId);
    const partDir = join(homedir(), '.local', 'share', 'opencode', 'storage', 'part');
    const messageFiles = await safeReadDir(messageDir);

    for (const msgFile of messageFiles) {
      if (!msgFile.endsWith('.json')) continue;

      const msgPath = join(messageDir, msgFile);
      const msgContent = await safeReadFile(msgPath);
      if (!msgContent) continue;

      let msg: OpenCodeMessage;
      try {
        msg = JSON.parse(msgContent);
      } catch {
        continue;
      }

      // Get text content from parts
      const partsPath = join(partDir, msg.id);
      const partFiles = await safeReadDir(partsPath);
      let content = '';
      const toolCalls: string[] = [];

      for (const partFile of partFiles) {
        if (!partFile.endsWith('.json')) continue;

        const partPath = join(partsPath, partFile);
        const partContent = await safeReadFile(partPath);
        if (!partContent) continue;

        let part: OpenCodePart;
        try {
          part = JSON.parse(partContent);
        } catch {
          continue;
        }

        if (part.type === 'text' && part.state?.output) {
          content = part.state.output;
        }
        if (part.type === 'tool' && part.tool) {
          toolCalls.push(part.tool);
        }
      }

      if (content || toolCalls.length > 0) {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content,
          timestamp: msg.time.created,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        });
      }
    }

    // Sort by timestamp
    messages.sort((a, b) => a.timestamp - b.timestamp);
  }

  const detail: AiSessionDetail = {
    ...baseSession,
    messages: messages.slice(-50), // Last 50 messages
    fullHistory: messages.length <= 50,
  };

  cache.details.set(cacheKey, detail);
  return detail;
}

export function registerAiSessionRoutes(app: Hono) {
  app.get('/ai-sessions', async (c) => {
    try {
      const limit = Math.min(Number(c.req.query('limit') || '50'), 100);
      const offset = Number(c.req.query('offset') || '0');
      const provider = c.req.query('provider') as AiProvider | undefined;
      const directory = c.req.query('directory');
      const maxAgeDays = Number(c.req.query('maxAgeDays') || String(DEFAULT_MAX_AGE_DAYS));
      const refresh = c.req.query('refresh') === '1';

      let sessions = await getAllSessions(maxAgeDays, refresh);

      // Filter by max age (default 30 days)
      const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
      sessions = sessions.filter(s => s.updatedAt > cutoffTime);

      // Filter by provider
      if (provider) {
        sessions = sessions.filter(s => s.provider === provider);
      }

      // Filter by directory (prefix match)
      if (directory) {
        sessions = sessions.filter(s =>
          s.directory.startsWith(directory) ||
          directory.startsWith(s.directory)
        );
      }

      const total = sessions.length;
      const paginatedSessions = sessions.slice(offset, offset + limit);

      return c.json({
        sessions: paginatedSessions,
        total,
        hasMore: offset + limit < total,
      });
    } catch (err) {
      return jsonError(c, err);
    }
  });

  app.get('/ai-sessions/:provider/:id', async (c) => {
    try {
      const provider = c.req.param('provider') as AiProvider;
      const id = c.req.param('id');

      if (!['claude', 'codex', 'opencode'].includes(provider)) {
        return c.json({ error: 'Invalid provider' }, 400);
      }

      const detail = await getSessionDetail(provider, id);
      if (!detail) {
        return c.json({ error: 'Session not found' }, 404);
      }

      return c.json(detail);
    } catch (err) {
      return jsonError(c, err);
    }
  });
}
