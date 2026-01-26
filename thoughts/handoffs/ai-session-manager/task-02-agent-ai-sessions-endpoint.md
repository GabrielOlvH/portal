# Task 2 Handoff: Agent AI Sessions Endpoint

## Status: COMPLETE

## Task Summary
Created agent endpoint for reading and parsing AI session files from Claude Code, Codex CLI, and OpenCode.

## Files Created
- `/home/gabrielolv/Documents/Projects/ter/agent/src/http/routes/ai-sessions.ts`

## Files Modified
- `/home/gabrielolv/Documents/Projects/ter/agent/src/http/app.ts` - Added import and registration for AI session routes

## Implementation Details

### Endpoints Added

1. **GET `/ai-sessions`** - List all AI sessions
   - Query params:
     - `limit` (default: 50, max: 100)
     - `offset` (default: 0)
     - `provider` (filter by: claude, codex, opencode)
     - `refresh=1` (force cache refresh)
   - Returns: `{ sessions: AiSession[], total: number, hasMore: boolean }`

2. **GET `/ai-sessions/:provider/:id`** - Get session details with messages
   - Path params:
     - `provider`: claude | codex | opencode
     - `id`: session ID
   - Returns: `AiSessionDetail` (session info + last 50 messages)

### Parsing Implementation

#### Claude Code (`parseClaudeSessions`)
- Reads `~/.claude/projects/*/sessions-index.json` for session metadata
- Parses per-session `.jsonl` transcript files
- Extracts:
  - Summary from `type: summary` entries
  - User/assistant messages from `type: user/assistant`
  - Modified files from `tool_use` blocks with `name: "Edit"` or `name: "Write"`
  - Tools used from `tool_use` block names
  - Git branch from session index

#### Codex CLI (`parseCodexSessions`)
- Scans `~/.codex/sessions/<year>/<month>/<day>/rollout-*.jsonl`
- Parses session meta, events, and response items
- Extracts:
  - Session ID and CWD from `session_meta` type
  - User messages from `event_msg` with `type: user_message`
  - Token usage from `event_msg` with `type: token_count`
  - Tool calls from `response_item` with `type: function_call`
  - Git branch from session meta

#### OpenCode (`parseOpenCodeSessions`)
- Reads `~/.local/share/opencode/storage/session/<projectId>/<sessionId>.json`
- Reads associated message files from `storage/message/<sessionId>/`
- Reads part files from `storage/part/<messageId>/`
- Extracts:
  - Session title/slug from session JSON
  - Token usage from message metadata
  - Tool calls from parts with `type: tool`
  - Text content from parts with `type: text`
  - Modified files from tool input parameters

### Caching Strategy
- 30-second TTL cache for session list
- Separate cache for session details
- Force refresh available via `?refresh=1` query param
- Cache invalidated on TTL expiry

### Error Handling
- All file operations wrapped in try/catch
- Malformed JSON lines skipped silently
- Missing files handled gracefully (return empty arrays)
- Provider-level errors caught and logged

## Type Definitions
Types are defined locally in ai-sessions.ts to match the types from lib/types.ts:
- `AiProvider`
- `AiSessionTokenUsage`
- `AiSession`
- `AiSessionMessage`
- `AiSessionDetail`

## Verification
- TypeScript compilation: PASS (no errors in ai-sessions.ts)
- Pre-existing errors in notifications.ts and ws.ts are unrelated to this task

## Notes for Next Tasks
- The mobile app (Task 3) can consume these endpoints
- Consider adding WebSocket support for real-time session updates
- Token usage extraction from Claude Code is not fully implemented (would need to parse assistant message metadata)

## Dependencies for Task 3
- Endpoint paths: `/ai-sessions` and `/ai-sessions/:provider/:id`
- Response types match the types defined in lib/types.ts from Task 1
