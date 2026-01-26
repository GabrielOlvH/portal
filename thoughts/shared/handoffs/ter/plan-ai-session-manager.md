---
date: 2026-01-21T12:00:00Z
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-ai-session-manager.md
---

# Plan Handoff: AI Session Manager Feature

## Summary

Created a comprehensive plan to add AI session management to Portal, enabling users to view and resume sessions from Claude Code, OpenAI Codex CLI, and OpenCode with rich context including modified files, last messages, and token usage.

## Plan Created

`thoughts/shared/plans/PLAN-ai-session-manager.md`

## Key Technical Decisions

- **Rich context parsing**: Parse JSONL/JSON deeply to extract modified files, messages, token usage
- **Read-only approach**: Sessions are read from native file locations, no intermediate database
- **Agent-based file access**: Agent reads session files via SSH, returns JSON to app
- **Unified type system**: Common `AiSession` type maps all three providers' formats with rich fields
- **Expandable rows**: Compact list view with expandable details for full context
- **Resume via terminal**: Resuming opens tmux session with appropriate CLI command

## Research Findings: Session Storage

| Provider | Location | Format | Resume Command |
|----------|----------|--------|----------------|
| Claude Code | `~/.claude/projects/[path]/[uuid].jsonl` | JSONL | `claude --resume <id>` |
| Codex CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | JSONL | `codex resume <id>` |
| OpenCode | `~/.local/share/opencode/storage/session/` | JSON | `opencode -s <id>` |

## Task Overview

1. **Define Types** - Add rich `AiSession` type with modifiedFiles, lastMessage, tokenUsage
2. **Add Agent Endpoint** - Parse JSONL/JSON to extract files, messages, usage from all 3 providers
3. **Add API Client** - Functions to fetch sessions with rich context and resume
4. **Create Sessions Screen** - List view with expandable rows showing full context
5. **Create Detail Screen** - Full session details with message history
6. **Add Navigation** - Entry point in More tab
7. **Create Row Component** - Compact + expanded views with modified files, last message

## Assumptions Made

- Agent runs as user with read access to `~/.claude/`, `~/.codex/`, `~/.local/share/opencode/`
- All three tools use their default storage locations (not customized via env vars)
- Session files are valid JSONL/JSON (malformed entries will be skipped)

## For Next Steps

- User should review plan at: `thoughts/shared/plans/PLAN-ai-session-manager.md`
- After approval, run `/implement_plan` with the plan path
- Consider starting with Task 1-3 (backend) before UI tasks
