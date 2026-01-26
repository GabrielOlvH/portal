# Plan: AI Session Manager Feature

## Goal

Add a feature to Portal that can read, display, and manage AI coding assistant sessions from Claude Code, OpenAI Codex CLI, and OpenCode. Users will be able to:
- View all AI sessions across all three tools
- See rich session context: modified files, last message, token usage
- Resume sessions directly from the app
- Search/filter sessions by provider, directory, or content

## Technical Choices

- **Storage Format**: Read JSONL/JSON files directly from the agent's data directories (no intermediate database)
- **Architecture**: New tab or section in the More screen for "AI Sessions"
- **File Access**: Access via SSH through existing host agent (sessions live on remote hosts)
- **UI Pattern**: Follow existing session list patterns with grouped cards

## Current State Analysis

### Session Storage Locations (Research Findings)

**Claude Code:**
- Index: `~/.claude/history.jsonl`
- Transcripts: `~/.claude/projects/[encoded-path]/[session-uuid].jsonl`
- Path encoding: slashes → hyphens (e.g., `/home/user/project` → `-home-user-project`)
- Resume: `claude --resume <session-id>`

**OpenAI Codex CLI:**
- Sessions: `~/.codex/sessions/YYYY/MM/DD/rollout-{timestamp}-{SESSION_ID}.jsonl`
- History: `~/.codex/history.jsonl`
- Resume: `codex resume <SESSION_ID>` or `codex resume --last`

**OpenCode:**
- Sessions: `~/.local/share/opencode/storage/session/<project-hash>/<session-id>.json`
- Messages: `~/.local/share/opencode/storage/message/<session-id>/msg_<id>.json`
- Resume: `opencode --session <session_id>`

### JSONL Parsing Details

**Claude Code JSONL Schema:**
```jsonl
// User message
{"type":"user","message":{"role":"user","content":"..."},"uuid":"...","timestamp":"..."}

// Assistant with tool use (Edit = file modification)
{"type":"assistant","message":{"role":"assistant","content":[
  {"type":"text","text":"..."},
  {"type":"tool_use","name":"Edit","input":{"file_path":"/path/to/file.ts",...}}
]},"uuid":"..."}

// Session summary (title)
{"type":"summary","summary":"Session title here","leafUuid":"..."}
```

**Codex CLI JSONL Schema:**
```jsonl
{"type":"thread.started","thread_id":"uuid"}
{"type":"turn.started"}
{"type":"item.completed","item":{"type":"file_change","file_path":"..."}}
{"type":"item.completed","item":{"type":"agent_message","text":"..."}}
{"type":"turn.completed","usage":{"input_tokens":N,"output_tokens":N,"cached_input_tokens":N}}
```

**OpenCode JSON Schema:**
```json
// Session file
{"id":"ses_xxx","title":"...","directory":"...","createdAt":"...","updatedAt":"..."}

// Message parts (separate files)
{"type":"patch","file":"path/to/file","content":"..."}
{"type":"text","content":"..."}
```

### Key Files in Portal App

- `lib/types.ts` - Type definitions
- `lib/storage.ts` - AsyncStorage patterns for local data
- `lib/api.ts` - HTTP client for agent communication
- `lib/store.tsx` - React context for app state
- `app/(tabs)/index.tsx` - Sessions tab with grouped cards pattern
- `app/(tabs)/more.tsx` - Settings screen with menu items
- `agent/src/http/app.ts` - Agent HTTP routes

## Tasks

### Task 1: Define Types for AI Sessions

Add TypeScript types for the three AI assistant session formats with rich context data.

- [ ] Add `AiProvider` type union: `'claude' | 'codex' | 'opencode'`
- [ ] Add `AiSession` type with common fields:
  - `id: string`
  - `provider: AiProvider`
  - `directory: string`
  - `summary: string` - session title/summary from history
  - `createdAt: number`
  - `updatedAt: number`
  - `messageCount: number`
  - `lastMessage: string` - last user or assistant message (truncated)
  - `modifiedFiles: string[]` - files edited/created during session
  - `tokenUsage?: { input: number; output: number; cached?: number }`
  - `toolsUsed?: string[]` - tools invoked (Edit, Bash, etc.)
  - `gitBranch?: string` - branch if detected
- [ ] Add `AiSessionDetail` type for full session view (includes more messages)
- [ ] Add `AiSessionListResponse` type for API response

**Files to modify:**
- `lib/types.ts`

### Task 2: Add Agent Endpoint for AI Sessions

Create a new endpoint in the agent that reads and parses AI session files from the host filesystem, extracting rich context data.

- [ ] Create `agent/src/http/routes/ai-sessions.ts`
- [ ] Implement `parseClaudeSessions()`:
  - Read `~/.claude/history.jsonl` for session index
  - For each session, read transcript JSONL to extract:
    - Last N messages (user + assistant)
    - File edits from `tool_use` blocks with `name: "Edit"` or `name: "Write"`
    - Token usage from assistant message metadata
    - Tools used from `tool_use` content blocks
- [ ] Implement `parseCodexSessions()`:
  - Scan `~/.codex/sessions/` directories
  - Parse rollout JSONL for:
    - `item.completed` with `type: "file_change"` → modified files
    - `item.completed` with `type: "agent_message"` → last message
    - `turn.completed` → token usage
    - `item.completed` with `type: "command_execution"` → tools used
- [ ] Implement `parseOpenCodeSessions()`:
  - Read `~/.local/share/opencode/storage/session/` JSON files
  - Read associated message files for last message and file changes
  - Extract from `part` types: `file`, `patch`, `text`
- [ ] Add GET `/api/ai-sessions` endpoint that returns combined session list (limit 50 most recent)
- [ ] Add GET `/api/ai-sessions/:provider/:id` endpoint for full session details with more messages
- [ ] Wire up routes in `agent/src/http/app.ts`

**Parsing Strategy:**
- Read session files lazily (only parse what's needed for list view)
- Cache parsed sessions briefly to avoid re-parsing on detail view
- Handle missing/corrupted files gracefully

**Files to create:**
- `agent/src/http/routes/ai-sessions.ts`

**Files to modify:**
- `agent/src/http/app.ts`

### Task 3: Add API Client Functions

Add functions to fetch AI sessions from the agent.

- [ ] Add `getAiSessions(host: Host): Promise<AiSession[]>` function
- [ ] Add `getAiSessionDetail(host: Host, provider: AiProvider, id: string): Promise<AiSessionDetail>`
- [ ] Add `resumeAiSession(host: Host, provider: AiProvider, id: string): Promise<void>` - runs resume command in tmux

**Files to modify:**
- `lib/api.ts`

### Task 4: Create AI Sessions Screen

Create a new screen to display and manage AI sessions with rich context previews.

- [ ] Create `app/ai-sessions/index.tsx`
- [ ] Use TanStack Query or similar pattern from ports screen
- [ ] Group sessions by provider with collapsible sections
- [ ] Show for each session:
  - Provider icon + session summary/title
  - Directory path (truncated)
  - Last message preview (1-2 lines, truncated)
  - Modified files count badge (e.g., "5 files")
  - Relative time (e.g., "2h ago")
  - Token usage if available
- [ ] Add expandable row to show:
  - Full modified files list
  - Last few messages
  - Git branch if detected
- [ ] Add search/filter bar (by provider, by directory, by content)
- [ ] Add pull-to-refresh
- [ ] Add host selector if multiple hosts

**Files to create:**
- `app/ai-sessions/index.tsx`

### Task 5: Add Session Detail Screen

Create a screen to view session details and resume.

- [ ] Create `app/ai-sessions/[provider]/[id].tsx`
- [ ] Show session metadata
- [ ] Show recent messages preview
- [ ] Add "Resume Session" button that opens terminal with resume command
- [ ] Add "Copy Session ID" action

**Files to create:**
- `app/ai-sessions/[provider]/[id].tsx`

### Task 6: Add Navigation Entry Point

Add a way to access the AI Sessions feature.

- [ ] Add "AI Sessions" menu item in More tab
- [ ] Consider adding as a new bottom tab (evaluate UX)

**Files to modify:**
- `app/(tabs)/more.tsx`
- Potentially `app/(tabs)/_layout.tsx` if adding new tab

### Task 7: Create Session Row Component

Create a reusable component for displaying AI session rows with rich context.

- [ ] Create `components/AiSessionRow.tsx`
- [ ] Compact view (collapsed):
  - Provider icon (Claude/Codex/OpenCode)
  - Session title/summary
  - Directory path (truncated, monospace)
  - Relative time badge
  - Modified files count pill (e.g., "5 files" in muted tone)
  - Last message preview (1 line, ellipsis)
- [ ] Expanded view (on tap):
  - Full modified files list (scrollable if many)
  - Last 2-3 messages with role indicators
  - Token usage breakdown
  - Git branch pill if detected
  - "Resume" button
- [ ] Use SwipeableRow for quick actions (resume left, copy ID right)
- [ ] Follow existing SessionRow patterns from index.tsx

**Files to create:**
- `components/AiSessionRow.tsx`

## Success Criteria

### Automated Verification:
- [ ] Type check passes: `bun run typecheck`
- [ ] No lint errors: `bun run lint`
- [ ] Agent builds: `cd agent && bun run build`

### Manual Verification:
- [ ] Can view Claude Code sessions from a connected host
- [ ] Can view Codex sessions from a connected host
- [ ] Can view OpenCode sessions from a connected host
- [ ] Sessions show modified files list correctly
- [ ] Sessions show last message preview
- [ ] Sessions show token usage when available
- [ ] Can expand a session to see full details
- [ ] Can filter sessions by provider
- [ ] Can search sessions by directory name
- [ ] Can resume a session (opens terminal with correct command)
- [ ] Pull-to-refresh updates session list
- [ ] Empty state displays correctly when no sessions found
- [ ] Gracefully handles sessions with missing/partial data

## Out of Scope

- **Session deletion from app** - Too risky, users should delete via CLI
- **Session content editing** - Read-only for safety
- **Cross-host session sync** - Each host has its own sessions
- **Real-time session monitoring** - Polling on focus is sufficient
- **Full conversation viewer** - Show preview only, full view via resume in terminal

## Risks (Pre-Mortem)

### Tigers:
- **File permission issues on remote hosts** (MEDIUM)
  - Mitigation: Agent runs as user, should have read access to home directories
- **JSONL parsing failures** (LOW)
  - Mitigation: Graceful error handling, skip malformed entries
- **Session directory structure changes** (MEDIUM)
  - Mitigation: Version detection, document known formats

### Elephants:
- **Performance with thousands of sessions** (MEDIUM)
  - Note: May need pagination or limit results to recent N sessions
