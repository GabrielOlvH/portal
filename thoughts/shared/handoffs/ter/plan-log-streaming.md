---
date: 2026-01-19
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-log-streaming.md
---

# Plan Handoff: Log Streaming Feature

## Summary
Created implementation plan for real-time Docker container log streaming. Reuses existing WebSocket infrastructure with a new `/docker/logs` endpoint and a read-only xterm.js viewer.

## Plan Created
`thoughts/shared/plans/PLAN-log-streaming.md`

## Key Technical Decisions
- **WebSocket (not REST)**: Enables real-time streaming with follow mode, consistent with terminal pattern
- **No PTY for logs**: Unlike docker exec, logs don't need terminal emulation - use spawn directly
- **xterm.js for display**: Handles ANSI color codes that logs often contain
- **Read-only viewer**: Simpler than terminal - no input handling, keyboard accessory, or bidirectional protocol

## Task Overview
1. **Add WebSocket endpoint** - New `/docker/logs` handler in ws.ts using child_process spawn
2. **Create log viewer screen** - Read-only xterm.js WebView at `/hosts/[id]/docker/[containerId]/logs`
3. **Add logs button** - Navigation from container detail screen
4. **Add log settings** - Tail lines, follow toggle, timestamps
5. **Handle edge cases** - Container stop, reconnection, empty logs

## Research Findings
- WebSocket server setup at `agent/src/http/ws.ts:189-221`
- Docker exec pattern at `agent/src/http/ws.ts:268-294` - similar but uses PTY
- Container detail UI at `app/hosts/[id]/docker/[containerId]/index.tsx` - has action buttons section
- Docker terminal at `app/hosts/[id]/docker/[containerId]/terminal.tsx` - template for log viewer
- Types defined in `lib/types.ts:70-90` - DockerContainer type

## Assumptions Made
- `docker logs` command available on agent hosts (standard Docker installation)
- Logs contain ANSI escape codes (xterm.js preferred over plain text)
- Users primarily want follow mode for running containers

## For Next Steps
- User should review plan at: `thoughts/shared/plans/PLAN-log-streaming.md`
- After approval, run `/implement_plan` with the plan path
- Estimated 5 tasks, moderate complexity
