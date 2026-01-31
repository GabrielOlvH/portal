---
root_span_id: 60cb8bd3-ec4e-4a70-adc0-5d0f59d4abdd
turn_span_id: ff2d9b49-2fde-4b09-a0a2-416d1b02d507
session_id: 60cb8bd3-ec4e-4a70-adc0-5d0f59d4abdd
date: 2026-01-30T10:30:00Z
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-ssh-migration.md
---

# Plan Handoff: Migrate Agent to Pure SSH Commands

## Summary
Created a comprehensive plan to remove the Bridge agent requirement and replace all functionality with pure SSH command execution, allowing the app to work with any SSH-accessible machine without pre-installed software.

## Plan Created
`thoughts/shared/plans/PLAN-ssh-migration.md`

## Key Technical Decisions

1. **SSH Library**: Will need to research React Native SSH options. Likely `react-native-ssh-sftp` or a custom native module. Expo limitations mean a custom dev client or bare workflow is required.

2. **Terminal over SSH**: Replace WebSocket-based terminal with SSH PTY sessions. The SSH library must support pseudo-terminal allocation.

3. **Tunnels via SSH**: Replace application-level TCP proxying with SSH `-L`/`-R` port forwarding, which is more standard and secure.

4. **Notifications removed**: Without a persistent agent, push notifications can't work the same way. Recommend removing initially and potentially adding back a pull-based approach later.

5. **Connection pooling**: SSH has higher overhead than HTTP, so connection reuse is critical for performance.

## Task Overview
1. Add SSH connectivity layer - Create `lib/ssh.ts` with connection pool, auth, PTY support
2. Update Host model - Change from HTTP-based to SSH-based credentials
3. Replace API layer - Rewrite `lib/api.ts` to execute SSH commands
4. Implement SSH terminal - Replace WebSocket with SSH PTY
5. SSH port forwarding - Replace TCP proxy with SSH forwarding
6. SSH-based live updates - Replace WebSocket events with polling
7. Migrate AI session parsing - Read session files via SSH/SFTP
8. System metrics via SSH - Parse system command output
9. Remove notifications - Clean break, may add back later
10. Update discovery - Parse `~/.ssh/config` for known hosts
11. Remove agent code - Archive/delete `agent/` directory
12. Update documentation - New SSH-based setup docs

## Research Findings

### Current Agent Endpoints (to be replaced):
- `GET /health` → `ssh user@host echo ok`
- `GET /sessions` → `ssh user@host tmux list-sessions -F "..."`
- `POST /sessions` → `ssh user@host tmux new-session -d -s name`
- `WebSocket /ws` → SSH PTY session
- `GET /docker` → `ssh user@host docker ps --format json`
- `GET /ports` → `ssh user@host ss -tulnp`
- `POST /tunnels` → SSH `-L localPort:host:remotePort`
- `GET /ai-sessions` → SSH + parse ~/.claude/projects/*/sessions-index.json

### Expo Limitation:
Expo Go cannot run native modules. Options:
1. EAS Build with custom dev client (recommended)
2. Eject to bare React Native (more control, more maintenance)

## Assumptions Made
- Users are comfortable with SSH key management
- Target hosts have SSH enabled (standard on Linux/macOS servers)
- Direct SSH connectivity (no jump hosts initially)
- Battery usage tradeoff is acceptable to users

## For Next Steps
- User should review plan at: `thoughts/shared/plans/PLAN-ssh-migration.md`
- Critical decision: Which SSH library/approach for React Native?
- After approval, start with Task 1 (SSH layer) to validate the approach
- Consider creating a proof-of-concept with just terminal functionality first
