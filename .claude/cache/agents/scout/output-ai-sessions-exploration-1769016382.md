# AI Sessions Feature Exploration Report
Generated: 2026-01-21 14:40:00

## Summary

The AI Sessions feature is a comprehensive session manager for three AI coding assistants:
- **Claude Code** - reads from `~/.claude/projects/`
- **Codex CLI** - reads from `~/.codex/sessions/`
- **OpenCode** - reads from `~/.local/share/opencode/storage/`

The feature parses local session files from these tools and displays them in a unified interface with resume capabilities.

**STATUS**: Feature is implemented but sessions may not show because the agent endpoint routes are registered but the parsing logic relies on finding session files in specific home directory locations.

---

## Project Structure

```
app/ai-sessions/
  index.tsx                          # Main AI Sessions list screen
  [provider]/[id].tsx                # Session detail screen

agent/src/http/routes/
  ai-sessions.ts                     # Backend route handlers (registered ✓)

lib/
  types.ts                          # Type definitions
  api.ts                            # API client functions

components/
  AiSessionRow.tsx                  # Session list item component
  SearchBar.tsx                     # Search component
```

---

## 1. AI Sessions Screens

### Main Screen: `/app/ai-sessions/index.tsx`

**Location:** `/home/gabrielolv/Documents/Projects/ter/app/ai-sessions/index.tsx`

**Purpose:** Lists all AI sessions grouped by provider with search/filter capabilities.

**Key Features:**
- Provider grouping (Claude/Codex/OpenCode) with collapsible sections
- Search by summary, directory, last message, or provider
- Filter by specific provider or "all"
- Host selector (multi-host support)
- Pull-to-refresh
- Resume session functionality
- Navigation to detail screen

**UI Components:**
- Provider headers with icons and session counts
- Expandable/collapsible provider groups
- Session rows via `AiSessionRow` component
- Empty state when no sessions found
- Host selector chips at top

**Data Flow:**
```typescript
useQuery(['ai-sessions', hostId, filterProvider]) 
  → getAiSessions(host, { provider })
  → GET /ai-sessions?provider=X
  → Backend parses local session files
  → Returns { sessions, total, hasMore }
```

### Detail Screen: `/app/ai-sessions/[provider]/[id].tsx`

**Location:** `/home/gabrielolv/Documents/Projects/ter/app/ai-sessions/[provider]/[id].tsx`

**Purpose:** Shows full session details including messages, files, and metadata.

**Key Features:**
- Session metadata (directory, timestamps, git branch)
- Token usage display
- Modified files list (truncated to show first 5, then "+X more")
- Tools used badges
- Message history (last 50 messages)
- Resume session button
- Copy session ID

**Sections:**
1. **Header** - Back button, session summary, copy ID action
2. **Meta card** - Created/updated times, directory, git branch, message count, file count
3. **Resume button** - Creates new tmux session with resume command
4. **Modified files** - List of files changed during session
5. **Tools used** - Grid of tool badges
6. **Messages** - Conversation history with role badges and timestamps

**Navigation:**
```typescript
router.push({
  pathname: '/ai-sessions/[provider]/[id]',
  params: { provider: 'claude', id: 'session-id' }
})
```

---

## 2. Types (lib/types.ts)

**Location:** `/home/gabrielolv/Documents/Projects/ter/lib/types.ts`

### Core Types

```typescript
export type AiProvider = 'claude' | 'codex' | 'opencode';

export type AiSessionTokenUsage = {
  input: number;
  output: number;
  cached?: number;
};

export type AiSession = {
  id: string;
  provider: AiProvider;
  directory: string;
  summary: string;
  createdAt: number;        // Unix timestamp
  updatedAt: number;        // Unix timestamp
  messageCount: number;
  lastMessage: string;
  modifiedFiles: string[];
  tokenUsage?: AiSessionTokenUsage;
  toolsUsed?: string[];
  gitBranch?: string;
};

export type AiSessionMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: string[];
};

export type AiSessionDetail = AiSession & {
  messages: AiSessionMessage[];
  fullHistory?: boolean;  // false if truncated to last 50
};

export type AiSessionListResponse = {
  sessions: AiSession[];
  total: number;
  hasMore: boolean;
};
```

---

## 3. API Functions (lib/api.ts)

**Location:** `/home/gabrielolv/Documents/Projects/ter/lib/api.ts`

### getAiSessions()

```typescript
export async function getAiSessions(
  host: Host,
  options?: AiSessionsOptions
): Promise<AiSessionListResponse>

type AiSessionsOptions = {
  provider?: AiProvider;    // Filter by provider
  limit?: number;           // Max results (default 50, max 100)
  offset?: number;          // Pagination offset
  refresh?: boolean;        // Force cache refresh
};
```

**Endpoint:** `GET /ai-sessions?provider=X&limit=50&offset=0&refresh=1`

**Returns:**
```typescript
{
  sessions: AiSession[],
  total: number,
  hasMore: boolean
}
```

### getAiSessionDetail()

```typescript
export async function getAiSessionDetail(
  host: Host,
  provider: AiProvider,
  id: string
): Promise<AiSessionDetail>
```

**Endpoint:** `GET /ai-sessions/:provider/:id`

**Returns:** Full session with messages array (last 50).

### resumeAiSession()

```typescript
export async function resumeAiSession(
  host: Host,
  provider: AiProvider,
  id: string
): Promise<void>
```

**What it does:** Creates a new tmux session running the resume command for the provider:

```typescript
const resumeCommands: Record<AiProvider, string> = {
  claude: `claude --resume ${id}`,
  codex: `codex --resume ${id}`,
  opencode: `opencode --resume ${id}`,
};

// Creates tmux session named: `${provider}-${id.slice(0, 8)}`
await createSession(host, sessionName, command);
```

---

## 4. Agent Endpoint (agent/src/http/routes/ai-sessions.ts)

**Location:** `/home/gabrielolv/Documents/Projects/ter/agent/src/http/routes/ai-sessions.ts`

**Routes Registered:** ✓ YES (in `agent/src/http/app.ts` via `registerAiSessionRoutes(app)`)

### Routes

#### `GET /ai-sessions`

**Query params:**
- `limit` - Max results (default 50, max 100)
- `offset` - Pagination offset
- `provider` - Filter by provider
- `refresh` - Force cache bypass (refresh=1)

**Returns:** `AiSessionListResponse`

**Caching:**
```typescript
const CACHE_TTL_MS = 30000; // 30 seconds
cache.sessions.clear() when refresh=1 or cache expired
```

**Processing:**
1. Calls `getAllSessions(forceRefresh)`
2. Filters by provider if specified
3. Paginates results
4. Returns `{ sessions, total, hasMore }`

#### `GET /ai-sessions/:provider/:id`

**Returns:** `AiSessionDetail` with full message history (last 50)

**Validates:** Provider must be 'claude', 'codex', or 'opencode'

**Returns 404** if session not found.

### Session Parsing Logic

The backend scans local filesystem directories for each provider and parses their session files.

#### Claude Code Parser

**Source:** `~/.claude/projects/`

**Files:**
- `sessions-index.json` - Index of all sessions for a project
- Session transcripts in JSONL format

**Parsing:**
```typescript
// Read index
const index: ClaudeSessionIndex = JSON.parse(indexContent);

// For each session entry
for (const entry of index.entries) {
  // Read transcript JSONL
  const lines = parseJsonlLines<ClaudeTranscriptEntry>(transcriptContent);
  
  // Extract data
  - summary: from type='summary' line or entry.firstPrompt
  - lastMessage: from type='user' or type='assistant' content
  - modifiedFiles: from tool_use blocks (Edit/Write tools)
  - toolsUsed: from tool_use blocks
  - gitBranch: from index entry
  - timestamps: from line.timestamp
}
```

**Directory structure:**
```
~/.claude/projects/
  {project-dir-name}/
    sessions-index.json
    sessions/
      {session-id}.jsonl
```

#### Codex CLI Parser

**Source:** `~/.codex/sessions/{year}/{month}/{day}/`

**Files:** `rollout-*.jsonl` files

**Parsing:**
```typescript
// Scan last 2 years
for (const year of years.slice(-2)) {
  // Scan all months/days
  const rolloutFiles = files.filter(f => 
    f.startsWith('rollout-') && f.endsWith('.jsonl')
  );
  
  // Parse JSONL
  - type='session_meta': id, cwd, git branch
  - type='event_msg': user messages, token counts
  - type='response_item': assistant messages, tool calls
}
```

**Directory structure:**
```
~/.codex/sessions/
  2025/
    01/
      21/
        rollout-{timestamp}-{id}.jsonl
```

#### OpenCode Parser

**Source:** `~/.local/share/opencode/storage/`

**Files:**
- `session/{projectId}/{sessionId}.json` - Session metadata
- `message/{sessionId}/*.json` - Messages
- `part/{messageId}/*.json` - Message parts (text, tools)

**Parsing:**
```typescript
// Read session metadata
const session: OpenCodeSession = JSON.parse(sessionContent);

// Read messages
for (const msgFile of messageFiles) {
  const msg: OpenCodeMessage = JSON.parse(msgContent);
  
  // Read message parts
  for (const partFile of partFiles) {
    const part: OpenCodePart = JSON.parse(partContent);
    
    - type='text': content text
    - type='tool': tool name, input/output
    - Extract file_path from tool inputs
  }
}
```

**Directory structure:**
```
~/.local/share/opencode/storage/
  session/{projectId}/{sessionId}.json
  message/{sessionId}/{messageId}.json
  part/{messageId}/{partId}.json
```

---

## 5. Navigation to AI Sessions

**From More Tab:** `/app/(tabs)/more.tsx`

**Location:** Line 215-221

```typescript
<MenuItem
  title="AI Sessions"
  subtitle="Claude, Codex, and OpenCode sessions"
  onPress={() => router.push('/ai-sessions')}
  styles={styles}
  chevronColor={colors.textSecondary}
/>
```

**Navigation Flow:**
```
More Tab (more.tsx)
  → MenuItem "AI Sessions"
  → router.push('/ai-sessions')
  → app/ai-sessions/index.tsx
  
  From list:
  → Click session row
  → router.push('/ai-sessions/[provider]/[id]')
  → app/ai-sessions/[provider]/[id].tsx
```

---

## 6. Why Sessions Might Not Show

### Diagnostic Checklist

**✓ VERIFIED:** Routes are registered in agent app
**✓ VERIFIED:** UI screens exist and are linked from More tab
**✓ VERIFIED:** API functions are implemented
**✓ VERIFIED:** Types are defined

**? UNCERTAIN:** Do session files exist in expected locations?

Let me check what was found:

```bash
# Claude sessions found
ls ~/.claude/projects/
→ Multiple project directories exist ✓

# Codex sessions found  
ls ~/.codex/sessions/
→ 2025/ and 2026/ directories exist ✓

# OpenCode sessions found
ls ~/.local/share/opencode/storage/session/
→ Multiple session directories exist ✓
```

**All three providers have session data!**

### Potential Issues

1. **Parsing errors** - JSONL files might be malformed
2. **Permission issues** - Agent might not have read access to home directory
3. **Path issues** - Agent running as different user (check `homedir()`)
4. **Cache issues** - Try with `?refresh=1` query param
5. **Empty sessions** - Files exist but have no valid content

### Debug Steps

1. **Test the endpoint directly:**
```bash
curl http://localhost:PORT/ai-sessions?refresh=1
```

2. **Check agent logs** - Look for parsing errors

3. **Verify agent user:**
```bash
# Agent might be running as different user than the one with sessions
whoami  # vs process.env.USER in agent
```

4. **Check file permissions:**
```bash
ls -la ~/.claude/projects/
ls -la ~/.codex/sessions/
ls -la ~/.local/share/opencode/storage/
```

5. **Test with specific provider:**
```bash
curl http://localhost:PORT/ai-sessions?provider=claude&refresh=1
curl http://localhost:PORT/ai-sessions?provider=codex&refresh=1
curl http://localhost:PORT/ai-sessions?provider=opencode&refresh=1
```

### Common Fixes

**If no sessions showing:**

1. Add refresh button to force cache clear
2. Add error display in UI (check network tab for errors)
3. Add loading state indicator
4. Check if agent is actually running
5. Verify host connection is active

**Quick test in React Query DevTools:**
```typescript
// Check query state
queryClient.getQueryData(['ai-sessions', hostId, provider])
```

---

## Key Files Reference

| File | Purpose | Absolute Path |
|------|---------|---------------|
| AI Sessions List | Main screen | `/home/gabrielolv/Documents/Projects/ter/app/ai-sessions/index.tsx` |
| Session Detail | Detail screen | `/home/gabrielolv/Documents/Projects/ter/app/ai-sessions/[provider]/[id].tsx` |
| Types | Type definitions | `/home/gabrielolv/Documents/Projects/ter/lib/types.ts` |
| API Client | HTTP functions | `/home/gabrielolv/Documents/Projects/ter/lib/api.ts` |
| Backend Route | Session parsing | `/home/gabrielolv/Documents/Projects/ter/agent/src/http/routes/ai-sessions.ts` |
| App Registration | Route setup | `/home/gabrielolv/Documents/Projects/ter/agent/src/http/app.ts` |
| Session Row Component | List item UI | `/home/gabrielolv/Documents/Projects/ter/components/AiSessionRow.tsx` |
| More Tab | Navigation entry | `/home/gabrielolv/Documents/Projects/ter/app/(tabs)/more.tsx` |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Mobile App                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  app/ai-sessions/index.tsx                                 │
│    ↓ useQuery(['ai-sessions'])                             │
│    ↓ getAiSessions(host, { provider })                     │
│    ↓                                                        │
│  lib/api.ts                                                │
│    ↓ GET /ai-sessions                                      │
│    ↓                                                        │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                      Agent (Backend)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  agent/src/http/app.ts                                     │
│    ↓ registerAiSessionRoutes(app)                          │
│    ↓                                                        │
│  agent/src/http/routes/ai-sessions.ts                      │
│    ↓ GET /ai-sessions → getAllSessions()                   │
│    ↓                                                        │
│    ├── parseClaudeSessions()                               │
│    │     ↓ reads ~/.claude/projects/                       │
│    │     ↓ parses sessions-index.json                      │
│    │     ↓ parses JSONL transcripts                        │
│    │                                                        │
│    ├── parseCodexSessions()                                │
│    │     ↓ reads ~/.codex/sessions/                        │
│    │     ↓ scans year/month/day dirs                       │
│    │     ↓ parses rollout-*.jsonl                          │
│    │                                                        │
│    └── parseOpenCodeSessions()                             │
│          ↓ reads ~/.local/share/opencode/storage/          │
│          ↓ parses session/*.json                           │
│          ↓ parses message/*.json                           │
│          ↓ parses part/*.json                              │
│                                                             │
│    ↓ Returns { sessions, total, hasMore }                  │
└─────────────────────────────────────────────────────────────┘
                         │
                         ↓ File System
┌─────────────────────────────────────────────────────────────┐
│                   Local Session Files                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ~/.claude/projects/{project}/sessions-index.json          │
│  ~/.codex/sessions/2025/01/21/rollout-*.jsonl             │
│  ~/.local/share/opencode/storage/session/{id}.json        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Feature Completeness

| Component | Status | Notes |
|-----------|--------|-------|
| UI Screens | ✓ Complete | List + Detail screens |
| Types | ✓ Complete | All types defined |
| API Client | ✓ Complete | All functions implemented |
| Backend Routes | ✓ Registered | Routes added to app |
| Claude Parser | ✓ Implemented | Parses sessions-index.json + JSONL |
| Codex Parser | ✓ Implemented | Parses rollout-*.jsonl |
| OpenCode Parser | ✓ Implemented | Parses JSON storage |
| Navigation | ✓ Wired | From More tab → List → Detail |
| Resume Session | ✓ Implemented | Creates tmux session |
| Search | ✓ Implemented | Search by text |
| Filter | ✓ Implemented | Filter by provider |
| Caching | ✓ Implemented | 30s TTL |
| Pagination | ✓ Implemented | limit/offset params |

**Overall Status:** Feature is 100% implemented. If sessions don't show, it's likely a runtime/data issue, not missing code.

---

## Next Steps for Debugging

1. **Add error handling UI** - Display backend errors in the UI
2. **Add debug endpoint** - Create `/ai-sessions/debug` that shows:
   - Which directories were scanned
   - How many files found
   - Any parsing errors
3. **Test each parser independently** - Isolate which provider fails
4. **Check agent logs** - Look for file read errors or exceptions
5. **Verify permissions** - Ensure agent user matches session file owner

