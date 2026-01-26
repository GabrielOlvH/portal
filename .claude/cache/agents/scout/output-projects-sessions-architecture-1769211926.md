# Codebase Report: Projects & Sessions Architecture
Generated: 2026-01-23

## Summary

The application has a **dual-session architecture**: traditional tmux sessions for terminal management and AI coding sessions (Claude Code, Codex CLI, OpenCode) for tracking AI-assisted coding work. Projects serve as organizational units that bridge both types of sessions.

## Project Structure

```
app/
  (tabs)/
    index.tsx                           # Home: tmux sessions list (grouped by host)
  projects/
    index.tsx                           # Projects list (grouped by host)
    new.tsx                             # Add new project
  ai-sessions/
    index.tsx                           # AI sessions list (Claude/Codex/OpenCode)
  session/
    [hostId]/[name]/
      index.tsx                         # Session detail (rename, kill)
      terminal.tsx                      # Terminal viewer with xterm.js

lib/
  projects-store.tsx                    # Projects context & AsyncStorage persistence
  types.ts                              # Project, Session, AiSession types
  api.ts                                # API client (sessions, AI sessions)
  live.tsx                              # useHostLive, useHostsLive (WebSocket)

components/
  SessionCard.tsx                       # Tmux session card (shows agent state, git branch)
  LaunchSheet.tsx                       # Project launcher with command picker

agent/src/http/routes/
  sessions.ts                           # Tmux session CRUD (create, rename, kill, keys, resize, capture)
  ai-sessions.ts                        # AI session parser (Claude/Codex/OpenCode local storage)
```

## Data Models

### Project

**File:** `lib/types.ts`
**Storage:** AsyncStorage (`tmux.projects.v1`)

```typescript
type Project = {
  id: string;            // createId('project')
  hostId: string;        // Which host the project lives on
  name: string;          // Display name
  path: string;          // Absolute path on host
}
```

**Provider:** `lib/projects-store.tsx` (React Context)
- `projects: Project[]`
- `addProject(draft: Omit<Project, 'id'>): Promise<Project>`
- `updateProject(id: string, updates: Partial<Project>): Promise<void>`
- `removeProject(id: string): Promise<void>`
- `getProjectsByHost(hostId: string): Project[]`

### Tmux Session

**File:** `lib/types.ts`
**Source:** Backend API `/sessions` (tmux list-sessions)

```typescript
type Session = {
  name: string;
  windows: number;
  attached: boolean;
  createdAt?: number;
  lastAttached?: number;
  preview?: string[];     // Terminal output preview
  insights?: SessionInsights; // Agent state, git branch, usage stats
}

type SessionInsights = {
  codex?: ProviderUsage;
  claude?: ProviderUsage;
  copilot?: ProviderUsage;
  cursor?: ProviderUsage;
  git?: GitStatus;
  meta?: {
    lastPolled?: number;
    activeAgent?: 'codex' | 'claude' | null;
    agentState?: 'running' | 'idle' | 'stopped';
    agentCommand?: string | null;
  };
}
```

**Live Updates:** `lib/live.tsx` provides `useHostLive(host, { sessions: true })` which:
- Opens WebSocket to `/ws/live`
- Subscribes to session list changes
- Returns `{ state: { sessions: Session[], status: 'online' | 'offline' }, refresh }`

### AI Session

**File:** `lib/types.ts`
**Source:** Backend API `/ai-sessions` (parses local storage of AI tools)

```typescript
type AiSession = {
  id: string;
  provider: 'claude' | 'codex' | 'opencode';
  directory: string;       // Project directory where session ran
  summary: string;         // First prompt or session title
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessage: string;
  modifiedFiles: string[];
  tokenUsage?: {
    input: number;
    output: number;
    cached?: number;
  };
  toolsUsed?: string[];
  gitBranch?: string;
}
```

**Detail View:**
```typescript
type AiSessionDetail = AiSession & {
  messages: AiSessionMessage[];  // Last 50 messages
  fullHistory?: boolean;
}

type AiSessionMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: string[];
}
```

### Recent Launch

**File:** `lib/types.ts`
**Storage:** AsyncStorage (`tmux.recent-launches.v1`)

```typescript
type RecentLaunch = {
  id: string;
  hostId: string;
  projectId: string;
  projectName: string;
  hostName: string;
  command: Command;      // { id, label, command, icon }
  timestamp: number;
}
```

Stored in `projects-store` with max 10 entries, used by LaunchSheet to show recent launches.

## Screen Flow

### Home Screen (Portal)
**File:** `app/(tabs)/index.tsx`

**Data Sources:**
- `useHostsLive(hosts, { sessions: true, insights: true, host: true })`
- Returns `stateMap: Record<hostId, { sessions: Session[], status, hostInfo }>`

**Display:**
- Usage cards (Claude, Codex, Copilot) aggregated from all sessions
- Tmux sessions grouped by host
- Each session shows:
  - Agent state (running/idle/stopped) with colored dot
  - Git branch badge
  - Current command
  - Swipe actions: rename (left), kill (right)

**Actions:**
- Tap session → `/session/[hostId]/[name]/terminal`
- "Launch" button → Opens LaunchSheet

### Projects Screen
**File:** `app/projects/index.tsx`

**Data Sources:**
- `useProjects()` → local projects from AsyncStorage
- `getAiSessions(host, { limit: 100, maxAgeDays: 30 })` → AI sessions for all hosts
- Calculates session counts per project by matching `session.directory` with `project.path`

**Display:**
- Projects grouped by host
- Each project shows:
  - Name
  - Path
  - Badge with AI session count (if > 0, tapping navigates to `/ai-sessions?directory=<path>`)

**Actions:**
- "+" button → `/projects/new`
- Tap AI badge → `/ai-sessions?directory=<projectPath>`

### New Project Screen
**File:** `app/projects/new.tsx`

**Flow:**
1. Select host (radio list)
2. Enter name (text input)
3. Enter/browse path (DirectoryBrowser modal)
4. `addProject({ hostId, name, path })` → saves to AsyncStorage
5. Navigate back

### AI Sessions Screen
**File:** `app/ai-sessions/index.tsx`

**Data Sources:**
- `getAiSessions(host, { directory?, maxAgeDays: 30 })` from selected host
- Filters by directory if `?directory=<path>` in URL params

**Display:**
- Collapsible cards with:
  - Provider badge (Claude/Codex/OpenCode)
  - Summary/title
  - Directory (last 2 path segments)
  - Git branch, time ago
  - Stats: message count, modified files, token usage
  - Expanded: file list, tools used, "Resume Session" button

**Actions:**
- Tap to expand/collapse (LayoutAnimation)
- "Resume Session" → `resumeAiSession(host, provider, id)` → creates tmux session and navigates to terminal
- Host tabs to switch between hosts
- Search by summary, directory, files, provider

### Session Detail Screen
**File:** `app/session/[hostId]/[name]/index.tsx`

**Data Sources:**
- `useHostLive(host, { sessions: true })` → finds session by name
- Shows status (online/offline), windows count, attached state

**Actions:**
- Rename (Alert.prompt → `renameSession` → redirects to new URL)
- Kill (Alert.alert confirmation → `killSession` → navigate back)
- "Terminal" button → `/session/[hostId]/[name]/terminal`

### Terminal Screen
**File:** `app/session/[hostId]/[name]/terminal.tsx`

**Tech:**
- WebView with xterm.js
- WebSocket for terminal I/O
- Live resize support
- Keyboard accessory for special keys

## LaunchSheet Component
**File:** `components/LaunchSheet.tsx`

**Context Provider:** Bottom sheet modal for launching new sessions

**Flow:**
1. Select host
2. Select project (shows session counts per project)
3. View project commands (package.json scripts + custom commands)
4. Launch modes:
   - **Quick launch:** Pick command → creates session → `cd <project.path>` → runs command → navigate to terminal
   - **Blank session:** Creates empty session → navigate to terminal
   - **Snippet:** Pick snippet → creates session → runs snippet command → navigate to terminal
   - **Browse sessions:** Navigate to `/ai-sessions?directory=<project.path>`

**Data:**
- `projects` from projects-store
- `getAiSessions(host)` for session counts
- `getPackageJsonScripts(host, project.path)` for commands

**Recent Launches:**
- Stored via `addRecentLaunch({ hostId, projectId, projectName, hostName, command })`
- Max 10 entries
- Deduplicated by (projectId, command)

## Backend API Routes

### Sessions (Tmux)
**File:** `agent/src/http/routes/sessions.ts`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/sessions` | GET | List tmux sessions with preview & insights |
| `/sessions` | POST | Create new session (`tmux new-session -d`) |
| `/sessions/:name/rename` | POST | Rename session (`tmux rename-session`) |
| `/sessions/:name/kill` | POST | Kill session (`tmux kill-session`) |
| `/sessions/:name/keys` | POST | Send keys/text (`tmux send-keys`) |
| `/sessions/:name/resize` | POST | Resize window (`tmux resize-window`) |
| `/sessions/:name/capture` | GET | Capture pane output |
| `/sessions/:name/insights` | GET | Get session insights (agent state, git, usage) |

**Session Insights:**
- Parses terminal preview to detect:
  - Claude Code / Codex CLI running
  - Git branch (`git status` output)
  - Agent state (running/idle/stopped)

### AI Sessions
**File:** `agent/src/http/routes/ai-sessions.ts`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/ai-sessions` | GET | List AI sessions from local storage |
| `/ai-sessions/:provider/:id` | GET | Get session detail with messages |

**Query Params:**
- `limit` (default 50, max 100)
- `offset` (default 0)
- `provider` ('claude' | 'codex' | 'opencode')
- `directory` (prefix match filter)
- `maxAgeDays` (default 30)
- `refresh` ('1' to bypass cache)

**Caching:**
- In-memory cache with 2-minute TTL
- Separate caches for session list and details
- Cache key: `${provider}:${sessionId}`

**Data Sources:**

**Claude Code:**
- `~/.claude/projects/<encoded-path>/sessions-index.json`
- Transcript files (JSONL): `user`, `assistant`, `summary` entries
- Extracts: firstPrompt, messageCount, gitBranch, projectPath

**Codex CLI:**
- `~/.codex/sessions/YYYY/MM/DD/rollout-<id>.jsonl`
- First line has `session_meta` with id, cwd, git branch
- Parses `event_msg` (user messages), `response_item` (assistant messages)

**OpenCode:**
- `~/.local/share/opencode/storage/session/<projectId>/<sessionId>.json`
- `~/.local/share/opencode/storage/message/<sessionId>/<messageId>.json`
- `~/.local/share/opencode/storage/part/<messageId>/<partId>.json`

## Session Management Patterns

### Creating Sessions

**From LaunchSheet (with project):**
```typescript
const sessionName = `${project.name}-${timestamp}`;
await createSession(host, sessionName);
await sendText(host, sessionName, `cd ${project.path}\n`);
await sendText(host, sessionName, `${command.command}\n`);
router.push(`/session/${host.id}/${sessionName}/terminal`);
```

**Blank session:**
```typescript
const sessionName = `session-${Date.now().toString(36)}`;
await createSession(host, sessionName);
router.push(`/session/${host.id}/${sessionName}/terminal`);
```

**Resume AI session:**
```typescript
await resumeAiSession(host, provider, sessionId);
const sessionName = `${provider}-${sessionId.slice(0, 8)}`;
router.push(`/session/${host.id}/${sessionName}/terminal`);
```

### Listing Sessions

**Live updates:**
```typescript
const { state, refresh } = useHostLive(host, { sessions: true, insights: true });
// state.sessions: Session[]
// state.status: 'online' | 'offline' | 'checking'
```

**Manual fetch:**
```typescript
const sessions = await getSessions(host, { preview: true, insights: true });
```

### Session Insights

Insights are **lazily loaded** via:
1. WebSocket subscription (live updates when focused)
2. HTTP polling fallback
3. Captures last 4 lines of terminal output
4. Parses for:
   - Claude Code prompt (`claude`)
   - Codex CLI prompt (`codex`)
   - Git branch from `git status` output
   - Agent state (running if prompt visible, idle if command running, stopped otherwise)

## Project-Session Association

**In Projects screen:**
```typescript
const sessionCounts = useMemo(() => {
  const counts = new Map<string, number>();
  for (const project of projects) {
    const count = aiSessions.filter((session) =>
      session.directory.startsWith(project.path) ||
      project.path.startsWith(session.directory)
    ).length;
    if (count > 0) {
      counts.set(project.id, count);
    }
  }
  return counts;
}, [projects, aiSessions]);
```

**In LaunchSheet:**
```typescript
const sessionCount = allHostSessions.filter((session) =>
  session.directory.startsWith(project.path) ||
  project.path.startsWith(session.directory)
).length;
```

**Bidirectional prefix matching** allows flexibility:
- Project: `/home/user/myapp`
- Session: `/home/user/myapp/backend` → counts
- Session: `/home/user/other` → doesn't count

## Storage Locations

| Data | Storage | Sync |
|------|---------|------|
| Projects | AsyncStorage (`tmux.projects.v1`) | No (local to device) |
| Recent Launches | AsyncStorage (`tmux.recent-launches.v1`) | No (local to device) |
| Tmux Sessions | Backend (tmux CLI) | No (per-host) |
| AI Sessions | Backend (local file parsing) | No (per-host) |
| Session Insights | Backend (terminal parsing) | No (ephemeral) |

**Note:** Projects and recent launches are **device-local** via AsyncStorage. If using the app on multiple devices, projects must be re-added on each device.

## Architecture Insights

### Dual Session Model

The app manages **two types of sessions** with different lifecycles:

**Tmux Sessions (Active):**
- Created and destroyed on-demand
- Live terminal I/O
- WebSocket for real-time updates
- Grouped by host in UI

**AI Sessions (Historical):**
- Passive log parsing from local storage
- Read-only historical record
- HTTP polling (no live updates)
- Grouped by provider/directory in UI

### Project as Bridge

Projects serve as the **organizational layer** that bridges:
1. **Tmux sessions:** Launch new sessions with project context (path, commands)
2. **AI sessions:** Filter historical AI work by project directory
3. **Commands:** Discover package.json scripts from project path

### State Management

**Global State:**
- Hosts: `lib/store.tsx` (Zustand + AsyncStorage)
- Projects: `lib/projects-store.tsx` (Context + AsyncStorage)

**Server State (TanStack Query):**
- AI sessions: `['ai-sessions', hostId, directory]`
- Package scripts: `['package-scripts', hostId, path]`
- Usage stats: `['usage', hostId]`

**Live State (WebSocket):**
- Session list: `useHostLive(host, { sessions: true })`
- Session insights: `useHostLive(host, { insights: true })`
- Host info: `useHostLive(host, { host: true })`

### Navigation Patterns

**Launch flows:**
```
LaunchSheet → Create Session → Terminal Screen
Projects → AI Sessions (filtered) → Resume → Terminal Screen
Home → Session Detail → Terminal Screen
Home → LaunchSheet → Terminal Screen
```

**Discovery flows:**
```
Projects → AI Sessions (filtered by directory)
Home → Usage Cards (aggregated from all sessions)
```

## Key Files Reference

| File | Purpose | Entry Points |
|------|---------|--------------|
| `app/(tabs)/index.tsx` | Home screen | Session list, usage cards, launch button |
| `app/projects/index.tsx` | Projects list | Projects grouped by host, AI session counts |
| `app/ai-sessions/index.tsx` | AI sessions | Historical AI work, resume capability |
| `components/LaunchSheet.tsx` | Project launcher | Command picker, quick launch, browse sessions |
| `lib/projects-store.tsx` | Projects store | CRUD operations, AsyncStorage persistence |
| `lib/live.tsx` | WebSocket hooks | `useHostLive`, `useHostsLive` for real-time data |
| `lib/api.ts` | API client | `getSessions`, `getAiSessions`, `createSession`, etc. |
| `agent/src/http/routes/sessions.ts` | Backend sessions | Tmux CRUD operations |
| `agent/src/http/routes/ai-sessions.ts` | Backend AI sessions | Local storage parsing (Claude/Codex/OpenCode) |

## Open Questions

1. **Project sync:** Should projects sync across devices via backend storage?
2. **AI session refresh:** Cache TTL is 2 minutes - is this appropriate for historical data?
3. **Session-project linking:** Currently inferred by path prefix - should there be explicit linking?
4. **Recent launches:** Should these be per-project or global?
