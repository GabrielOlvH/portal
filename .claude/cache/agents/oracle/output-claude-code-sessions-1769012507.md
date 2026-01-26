# Research Report: Claude Code Session/History Storage

Generated: 2026-01-21

## Summary

Claude Code stores conversation history in JSONL (JSON Lines) files within the `~/.claude/` directory. Sessions are organized by project directory path (with slashes converted to hyphens) and identified by UUID. The system supports resuming sessions via CLI flags (`--continue`, `--resume`) and stores rich metadata including tool use, thinking content, file backups, and progress events.

## Questions Answered

### Q1: Where are sessions stored?
**Answer:** Sessions are stored in `~/.claude/projects/[encoded-path]/[session-uuid].jsonl`
**Source:** Local filesystem inspection + [Vincent Schmalbach blog](https://www.vincentschmalbach.com/migrate-claude-code-sessions-to-a-new-computer/)
**Confidence:** High (verified on local system)

Key locations:
- `~/.claude/history.jsonl` - Global session index (metadata only: display text, timestamp, project, sessionId)
- `~/.claude/projects/` - Full conversation transcripts organized by project path
- `~/.claude/session-env/[session-uuid]/` - Session environment data
- `~/.claude/todos/[session-uuid]-agent-*.json` - Todo lists per session/agent

### Q2: What is the file format?
**Answer:** JSONL (JSON Lines) - one JSON object per line
**Source:** [claude-code-log GitHub](https://github.com/daaain/claude-code-log), local file inspection
**Confidence:** High (verified)

### Q3: What is the schema/structure?
**Answer:** Each line is a JSON object with a `type` field determining the message structure
**Source:** Local file inspection
**Confidence:** High (verified)

### Q4: How to resume sessions programmatically?
**Answer:** Use `claude --resume [session-id]` or `claude --continue` for most recent
**Source:** [Claude Code docs](https://code.claude.com/docs/en/common-workflows), [ClaudeLog FAQ](https://claudelog.com/faqs/what-is-resume-flag-in-claude-code/)
**Confidence:** High

## Detailed Findings

### Finding 1: Directory Structure

**Source:** Local filesystem inspection at `~/.claude/`

```
~/.claude/
├── history.jsonl              # Global session index (metadata)
├── projects/                  # Full conversation transcripts
│   └── -home-user-project/    # Path encoded (slashes → hyphens)
│       ├── [uuid].jsonl       # Session transcript
│       └── [uuid]/            # Session artifacts (tool results, etc.)
├── session-env/               # Session environment snapshots
│   └── [uuid]/
├── todos/                     # Todo lists per session
│   └── [session-uuid]-agent-[agent-uuid].json
├── settings.json              # User configuration
├── .credentials.json          # Authentication
└── statsig/                   # Analytics
```

**Path Encoding:** Forward slashes in directory paths become hyphens:
- `/home/gabrielolv/Documents/Projects/ter` → `-home-gabrielolv-Documents-Projects-ter`

### Finding 2: history.jsonl Schema (Session Index)

**Source:** Local file: `~/.claude/history.jsonl`

```json
{
  "display": "User's message text",
  "pastedContents": {},
  "timestamp": 1764162353577,
  "project": "/home/gabrielolv",
  "sessionId": "1b86ec1b-168e-4e20-8227-9614535f894c"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `display` | string | User message preview |
| `pastedContents` | object | Pasted content metadata |
| `timestamp` | number | Unix timestamp (ms) |
| `project` | string | Original project path |
| `sessionId` | string | UUID of the session |

### Finding 3: Session JSONL Message Types

**Source:** Local file inspection

Each session JSONL file contains multiple message types:

#### Type: `user`
```json
{
  "parentUuid": "uuid",
  "isSidechain": false,
  "userType": "external",
  "cwd": "/path/to/project",
  "sessionId": "uuid",
  "version": "2.1.12",
  "gitBranch": "master",
  "type": "user",
  "message": {
    "role": "user",
    "content": "User message text"
  },
  "uuid": "uuid",
  "timestamp": "ISO8601"
}
```

#### Type: `assistant`
```json
{
  "parentUuid": "uuid",
  "type": "assistant",
  "message": {
    "model": "claude-opus-4-5-20251101",
    "id": "msg_xxx",
    "type": "message",
    "role": "assistant",
    "content": [
      {"type": "thinking", "thinking": "...", "signature": "..."},
      {"type": "text", "text": "..."},
      {"type": "tool_use", "id": "toolu_xxx", "name": "Glob", "input": {...}}
    ],
    "usage": {...}
  },
  "requestId": "req_xxx",
  "uuid": "uuid",
  "timestamp": "ISO8601"
}
```

#### Type: `progress`
```json
{
  "type": "progress",
  "data": {
    "type": "hook_progress",
    "hookEvent": "SessionStart",
    "hookName": "SessionStart:clear",
    "command": "bash script.sh"
  },
  "toolUseID": "uuid",
  "timestamp": "ISO8601"
}
```

#### Type: `summary`
```json
{
  "type": "summary",
  "summary": "Session summary text",
  "leafUuid": "uuid"
}
```

#### Type: `file-history-snapshot`
```json
{
  "type": "file-history-snapshot",
  "messageId": "uuid",
  "snapshot": {
    "messageId": "uuid",
    "trackedFileBackups": {
      "path/to/file.tsx": {
        "backupFileName": "hash@v1",
        "version": 1,
        "backupTime": "ISO8601"
      }
    },
    "timestamp": "ISO8601"
  },
  "isSnapshotUpdate": false
}
```

### Finding 4: Common Message Fields

| Field | Type | Description |
|-------|------|-------------|
| `parentUuid` | string/null | Links to parent message (tree structure) |
| `isSidechain` | boolean | Branch in conversation tree |
| `userType` | string | "external" for user-initiated |
| `cwd` | string | Working directory |
| `sessionId` | string | Session UUID |
| `version` | string | Claude Code version |
| `gitBranch` | string | Current git branch |
| `type` | string | Message type discriminator |
| `uuid` | string | Unique message ID |
| `timestamp` | string | ISO8601 timestamp |

### Finding 5: Resuming Sessions

**Source:** [Claude Code docs](https://code.claude.com/docs/en/common-workflows)

#### CLI Flags

```bash
# Continue most recent session in current directory
claude --continue

# Open session picker
claude --resume

# Resume specific session by ID
claude --resume 550e8400-e29b-41d4-a716-446655440000

# Print mode with resume (programmatic/non-interactive)
claude -p --resume session-id "your prompt"
```

#### From Within Claude Code

```
/resume    # Opens session picker
```

#### Programmatic Access

For programmatic use, you can:
1. Parse `~/.claude/history.jsonl` to get session IDs by project
2. Read session transcripts from `~/.claude/projects/[encoded-path]/[session-id].jsonl`
3. Invoke `claude --resume [session-id]` or use `claude -p --resume [session-id] "prompt"`

## Comparison Matrix: Session Resume Methods

| Method | Use Case | Interactive | Notes |
|--------|----------|-------------|-------|
| `--continue` | Quick resume | Yes | Most recent in current dir |
| `--resume` | Pick specific | Yes | Shows picker |
| `--resume [id]` | Specific session | Yes | Direct by UUID |
| `-p --resume [id]` | Automation | No | Print mode, no interaction |
| `/resume` | Switch session | Yes | From within active session |

## Recommendations

### For This Codebase

1. **Reading Sessions Programmatically:**
   ```javascript
   const fs = require('fs');
   const path = require('path');
   
   function encodePath(dir) {
     return dir.replace(/\//g, '-');
   }
   
   function getSessionPath(projectDir, sessionId) {
     const encoded = encodePath(projectDir);
     return path.join(
       process.env.HOME, 
       '.claude/projects', 
       encoded, 
       `${sessionId}.jsonl`
     );
   }
   
   function parseSession(filePath) {
     const lines = fs.readFileSync(filePath, 'utf8').split('\n');
     return lines.filter(Boolean).map(JSON.parse);
   }
   ```

2. **For automation**, use `claude -p --resume [id] "prompt"` for non-interactive execution.

### Implementation Notes

- Session files can be very large (100MB+) for long sessions
- Use streaming/line-by-line parsing for large files
- The `parentUuid` field creates a tree structure for branching conversations
- `summary` entries provide quick previews without parsing full content
- File backups are stored separately in subdirectories matching session UUID

## Sources

1. [Claude Code Docs - Common Workflows](https://code.claude.com/docs/en/common-workflows) - Official resume documentation
2. [Vincent Schmalbach - Migrate Claude Code Sessions](https://www.vincentschmalbach.com/migrate-claude-code-sessions-to-a-new-computer/) - Directory structure
3. [Kent Gigger - Claude Code's Hidden Conversation History](https://kentgigger.com/posts/claude-code-conversation-history) - History structure
4. [claude-code-log GitHub](https://github.com/daaain/claude-code-log) - JSONL to HTML converter
5. [claude-JSONL-browser GitHub](https://github.com/withLinda/claude-JSONL-browser) - JSONL viewer
6. [ClaudeLog - Resume Flag FAQ](https://claudelog.com/faqs/what-is-resume-flag-in-claude-code/) - Resume flag details
7. [Analyzing Claude Code Logs with DuckDB](https://liambx.com/blog/claude-code-log-analysis-with-duckdb) - Log analysis

## Open Questions

- No official API for programmatic session management (must parse files directly)
- No documented way to create sessions programmatically (only resume existing)
- Session retention/cleanup policy is not documented
