# Plan: Improve Session Activity Detection to Reduce False Positives

## Goal

Reduce false positive "idle" detection for sessions where:
1. User is reading terminal output (2s is too aggressive)
2. Static UI tools (htop, less, vim) are running but screen isn't changing
3. Long-running commands with no output (builds, tests)

## Technical Choices

- **Idle threshold**: Increase from 2s to 5s - balance between responsiveness and fewer false positives
- **Activity signals**: Add multiple signals beyond screen hash (keystrokes, process state changes)
- **Process whitelist**: Never mark certain interactive processes as idle
- **Hysteresis**: Require sustained inactivity before transitioning to idle (debounce)

## Current State Analysis

The current implementation in `agent/src/agents.ts` uses a simple 3-factor model:

1. **Process check** (`hasActiveProcess`): Checks if non-shell process is running
2. **Screen hash** (`stablePreviewHash`): Strips ANSI, joins lines, compares
3. **Idle window** (`detectAgentState`): If screen unchanged > 2s → idle

**Problem**: Screen hash is the ONLY activity signal. If output doesn't change for 2 seconds, session is marked idle even if:
- User is actively reading
- Interactive TUI is running (htop, vim, less)
- Command is running but not producing output

### Key Files:
- `agent/src/agents.ts` - Core detection logic
- `agent/src/config.ts` - `IDLE_STOP_MS = 2000` (too aggressive)
- `agent/src/state.ts` - `sessionActivity` Map (hash + timestamp only)
- `agent/src/notifications/pause-monitor.ts` - Sends idle notifications

## Tasks

### Task 1: Increase Default Idle Threshold
Increase `IDLE_STOP_MS` from 2000ms to 5000ms (5 seconds).

- [ ] Update `agent/src/config.ts` default value
- [ ] Keep env var override for user customization

**Files to modify:**
- `agent/src/config.ts`

### Task 2: Add Interactive Process Detection
Detect when known interactive processes are running and never mark them idle.

- [ ] Create `INTERACTIVE_PROCESSES` set in `agent/src/config.ts`
- [ ] Include: `htop`, `top`, `vim`, `nvim`, `nano`, `less`, `more`, `man`, `watch`, `tail`
- [ ] Modify `detectAgentState` to check if current command is in whitelist
- [ ] If interactive process → always return 'running' (never idle)

**Files to modify:**
- `agent/src/config.ts`
- `agent/src/agents.ts`

### Task 3: Add Activity State with Hysteresis
Track multiple signals and require sustained inactivity before marking idle.

- [ ] Extend `sessionActivity` Map to track:
  - `hash`: current screen hash
  - `lastChangedAt`: last time hash changed
  - `idleConfirmedAt`: when we first considered it idle (null if not)
- [ ] Require 2 consecutive "would be idle" checks before transitioning to idle
- [ ] This prevents brief pauses from triggering idle

**Files to modify:**
- `agent/src/state.ts`
- `agent/src/agents.ts`

### Task 4: Consider Process State Changes as Activity
When process tree changes, reset the idle timer even if screen unchanged.

- [ ] Track previous child process list in state
- [ ] Compare current children to previous
- [ ] If children changed → count as activity, reset timer

**Files to modify:**
- `agent/src/agents.ts`
- `agent/src/state.ts`

### Task 5: Add Agent Type Awareness
Claude Code specifically shouldn't trigger idle when it's thinking (model call in progress).

- [ ] Check for Claude-specific patterns in screen output
- [ ] If we see thinking spinner or "Generating..." → running, not idle
- [ ] Pattern list: `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`, "Thinking...", "Generating...", etc.

**Files to modify:**
- `agent/src/agents.ts`

## Success Criteria

### Automated Verification:
- [ ] Type check: `pnpm typecheck`
- [ ] Lint: `pnpm lint`
- [ ] Agent builds: `cd agent && pnpm build`

### Manual Verification:
- [ ] Start session, open `htop` → stays "running" indefinitely
- [ ] Start session, read output without typing for 5s → stays "running"
- [ ] Start session, do nothing for 8s → becomes "idle" (not after 2s)
- [ ] Run `npm test` (output pauses during tests) → stays "running"
- [ ] Claude Code "thinking" → stays "running"

## Out of Scope

- Database persistence of activity state (not implemented currently, keep in-memory)
- User-configurable whitelist via app UI (can add later via env var)
- Cross-session coordination (unrelated to this fix)
- Tracking keyboard input directly (would require significant tmux changes)

## Implementation Order

1. Task 1 (threshold) - immediate improvement, low risk
2. Task 2 (interactive processes) - high value, medium complexity
3. Task 3 (hysteresis) - good UX, prevents edge cases
4. Task 4 (process tracking) - nice-to-have, can defer
5. Task 5 (agent awareness) - Claude-specific, can defer

## Risks (Pre-Mortem)

### Tigers:
- **Process whitelist too broad** (MEDIUM)
  - Mitigation: Start conservative, user can extend via env var
- **Hysteresis delay feels sluggish** (LOW)
  - Mitigation: 2 checks at 5s threshold, acceptable latency

### Elephants:
- **Users may want faster idle detection for some workflows** (MEDIUM)
  - Note: Keep env var `TMUX_AGENT_IDLE_STOP_MS` for power users
