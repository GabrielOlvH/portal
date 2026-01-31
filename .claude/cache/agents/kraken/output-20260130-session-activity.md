# Implementation Report: Session Activity Detection Improvements
Generated: 2026-01-30

## Task
Implement session activity detection improvements to reduce false positive idle detection for tmux agent sessions.

## Summary

Implemented Tasks 1-3 from the plan at `/home/gabriel/Projects/Personal/portal/thoughts/shared/plans/PLAN-session-activity-detection.md`:

1. **Task 1: Increased Default Idle Threshold** - Changed from 2s to 5s
2. **Task 2: Added Interactive Process Detection** - Sessions running htop, vim, etc. never marked idle
3. **Task 3: Added Hysteresis (Debounce)** - Requires 2 consecutive "would be idle" checks before transitioning to idle

## Changes Made

### 1. `/home/gabriel/Projects/Personal/portal/agent/src/config.ts`

**Change 1:** Updated IDLE_STOP_MS default from 2000ms to 5000ms
```typescript
// Before
export const IDLE_STOP_MS = Number(process.env.TMUX_AGENT_IDLE_STOP_MS || 2000);

// After
export const IDLE_STOP_MS = Number(process.env.TMUX_AGENT_IDLE_STOP_MS || 5000);
```

**Change 2:** Added INTERACTIVE_PROCESSES set
```typescript
export const INTERACTIVE_PROCESSES = new Set([
  'htop', 'top', 'btop', 'vim', 'nvim', 'nano', 'less', 'more', 'man', 'watch', 'tail'
]);
```

### 2. `/home/gabriel/Projects/Personal/portal/agent/src/state.ts`

**Change:** Extended sessionActivity Map type to include idleConfirmedAt for hysteresis
```typescript
// Before
export const sessionActivity: Map<string, { hash: string; lastChangedAt: number }> = new Map();

// After
export const sessionActivity: Map<string, { hash: string; lastChangedAt: number; idleConfirmedAt: number | null }> = new Map();
```

### 3. `/home/gabriel/Projects/Personal/portal/agent/src/agents.ts`

**Change 1:** Import INTERACTIVE_PROCESSES from config
```typescript
import { IDLE_STOP_MS, INTERACTIVE_PROCESSES } from './config';
```

**Change 2:** Modified detectAgentState function signature to accept command parameter
```typescript
export function detectAgentState(
  sessionName: string,
  lines: string[] | null | undefined,
  processActive: boolean,
  command: string | null = null,  // NEW
  idleWindowMs: number = IDLE_STOP_MS
): 'running' | 'idle' | 'stopped'
```

**Change 3:** Added interactive process check - sessions with interactive processes never become idle
```typescript
if (command) {
  const baseCommand = command.split(/\s+/)[0].toLowerCase();
  if (INTERACTIVE_PROCESSES.has(baseCommand)) {
    return 'running';
  }
}
```

**Change 4:** Added hysteresis logic - requires 2 consecutive "would be idle" checks
```typescript
// When hash changes, reset idleConfirmedAt
sessionActivity.set(sessionName, { hash, lastChangedAt: now, idleConfirmedAt: null });

// First time we'd be idle, just mark the timestamp but return 'running'
if (previous.idleConfirmedAt === null) {
  sessionActivity.set(sessionName, { ...previous, idleConfirmedAt: now });
  return 'running';
}

// Only return 'idle' if enough time has passed since idleConfirmedAt
const idleElapsed = now - previous.idleConfirmedAt;
return idleElapsed > idleWindowMs ? 'idle' : 'running';
```

**Change 5:** Updated getSessionInsights to pass command to detectAgentState
```typescript
const agentState = detectAgentState(name, previewLines, agentInfo.processActive, agentInfo.command);
```

## Verification Results

### Type Check
- No errors in modified files (agents.ts, config.ts, state.ts)
- Pre-existing errors in other files (ai-sessions.ts, notifications.ts, ws.ts) unrelated to this change

### Lint
- No errors (0 errors found)
- Pre-existing warnings in other files unrelated to this change

### Import Test
- All modified modules import successfully via tsx

## Behavior Changes

| Scenario | Before | After |
|----------|--------|-------|
| User reading output (no typing) | Idle after 2s | Running for at least 10s (5s threshold + 5s hysteresis) |
| htop/vim/less running | Could become idle after 2s | Always 'running' |
| Brief pause in output | Idle after 2s | Running (hysteresis prevents brief pauses from triggering) |
| Actual idle session | Idle after 2s | Idle after ~10s (2 consecutive 5s checks) |

## Files Modified
- `/home/gabriel/Projects/Personal/portal/agent/src/config.ts`
- `/home/gabriel/Projects/Personal/portal/agent/src/state.ts`
- `/home/gabriel/Projects/Personal/portal/agent/src/agents.ts`

## Notes
- Tasks 4 and 5 (process tree tracking and Claude thinking detection) were skipped as optional per task instructions
- The env var `TMUX_AGENT_IDLE_STOP_MS` still works for user customization
- The hysteresis effectively doubles the idle time (threshold + confirmation window)
