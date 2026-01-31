# Codebase Report: Session Activity Detection & Heartbeat Mechanisms
Generated: 2026-01-30

## Summary

This system uses **in-memory activity tracking** (not database heartbeats) to detect if tmux sessions are active. Activity is determined by:
1. **Process inspection** - checking if non-shell processes are running
2. **Screen content hashing** - detecting when terminal output changes
3. **Idle window detection** - comparing hash timestamps against a 2-second threshold

**No PostgreSQL cross-terminal coordination exists in this codebase.** The `.claude/rules/cross-terminal-db.md` reference is not implemented here.

## Project Structure

```
agent/src/
  sessions.ts           # Lists tmux sessions
  tmux.ts              # Parses tmux session metadata
  agents.ts            # Core activity detection logic
  state.ts             # In-memory sessionActivity Map
  config.ts            # IDLE_STOP_MS threshold (default: 2000ms)
  http/
    sessions.ts        # HTTP endpoint for session list
    live.ts            # WebSocket snapshot caching
    ws.ts              # WebSocket /events endpoint
  notifications/
    pause-monitor.ts   # Detects idle sessions for notifications
    reset-monitor.ts   # Detects usage limit resets
```

## Questions Answered

### Q1: How are sessions detected as "active"?

**Location:** `/home/gabriel/Projects/Personal/portal/agent/src/agents.ts`

**Detection Method:** Multi-factor analysis combining:

1. **Process Activity** (`hasActiveProcess`, line 58)
   - Checks if current command is a non-shell command
   - Inspects child processes via `pgrep -P <pid>`
   - Shell commands (`bash`, `zsh`, `fish`, etc.) = inactive
   - Any other process = active

2. **Screen Change Detection** (`detectAgentState`, line 139)
   - Captures terminal preview lines
   - Strips ANSI codes and hashes content
   - Compares hash to previous state
   - Hash change = activity detected
   - No hash change = check elapsed time

3. **Idle Threshold** (line 153)
   - If screen unchanged for > IDLE_STOP_MS (2000ms default)
   - State transitions: `running` → `idle`
   - If no active process: `stopped`

**State Machine:**
```
stopped (no process)
  ↓
running (process active + screen changing OR elapsed < 2000ms)
  ↓
idle (process active BUT screen unchanged for > 2000ms)
```

**Entry Point:**
```typescript
export async function getSessionInsights(name: string, preview?: string[])
```

### Q2: What triggers heartbeats?

**There are NO traditional heartbeats.** Instead:

**Polling Mechanisms:**

1. **WebSocket `/events` Endpoint** (`agent/src/http/ws.ts`, line 419)
   - Clients subscribe via WebSocket
   - Server sends snapshots on interval (default: 5000ms, configurable)
   - Client can send `{ type: 'refresh' }` or `{ type: 'ping' }` to request immediate snapshot
   - Snapshots include all session data + activity states

2. **HTTP `/sessions` Endpoint** (`agent/src/http/routes/sessions.ts`)
   - One-time fetch of session list with optional preview/insights
   - No persistent connection

3. **Notification Monitors** (run on intervals):
   - `pause-monitor.ts` - polls every 15s (NOTIFICATION_POLL_INTERVAL)
   - `reset-monitor.ts` - polls every 60s (RESET_MONITOR_INTERVAL)

**Snapshot Flow:**
```
1. Client connects WebSocket to /events?sessions=1&insights=1&interval=5000
2. Server sends initial snapshot immediately
3. Server sets interval to send snapshots every 5000ms
4. Each snapshot calls:
   - fetchSessions() 
   → getSessionInsights()
   → detectAgentState()
   → checks sessionActivity Map
5. Client receives { type: 'snapshot', sessions: [...] }
```

### Q3: How might false positives occur (stale sessions, orphaned processes)?

**Potential False Positive Scenarios:**

#### Scenario 1: Zombie Process Detection
**Location:** `agent/src/agents.ts:39-56` (`getChildCommands`)

**Issue:** If a process exits but child processes remain, `pgrep -P` may return orphaned PIDs
```typescript
const { stdout } = await execFileAsync('pgrep', ['-P', String(pid)], { timeout: 2000 });
```

**Impact:** Session marked as active when parent died but child lingered

**Probability:** Low (tmux process management is robust)

#### Scenario 2: Screen Hash Collision
**Location:** `agent/src/agents.ts:134-137` (`stablePreviewHash`)

```typescript
function stablePreviewHash(lines: string[] | null | undefined): string {
  if (!lines || lines.length === 0) return '';
  return lines.map((line) => stripAnsi(line)).join('\n').trim();
}
```

**Issue:** Hash is just stripped text concatenation (not cryptographic)
- Different screens with same text = same hash
- Static output (e.g., `htop` paused, log tail with no new lines) = unchanged hash

**Impact:** Session marked idle when actually running static UI

**Probability:** Medium for monitoring tools (htop, watch, tail -f on quiet logs)

#### Scenario 3: Short Idle Window
**Location:** `agent/src/config.ts:11`

```typescript
export const IDLE_STOP_MS = Number(process.env.TMUX_AGENT_IDLE_STOP_MS || 2000);
```

**Issue:** 2-second threshold is VERY aggressive
- User reading output without typing = marked idle after 2s
- Long-running command with no output = marked idle

**Impact:** False idle detection for legitimate pauses

**Probability:** High for read-heavy workflows

#### Scenario 4: In-Memory State Loss
**Location:** `agent/src/state.ts:116`

```typescript
export const sessionActivity: Map<string, { hash: string; lastChangedAt: number }> = new Map();
```

**Issue:** State is in-memory only (no persistence)
- Agent restart = all sessions reset to "running" on first poll
- No history across restarts

**Impact:** False "running" state after restart until first idle period

**Probability:** Guaranteed on every agent restart

#### Scenario 5: Race Condition on Session Creation
**Location:** Previous sleuth report `/home/gabriel/Projects/Personal/portal/.claude/cache/agents/sleuth/output-session-desync-1769200000.md`

**Issue:** Documented race between:
1. HTTP API creates session
2. WebSocket cache updates with new session
3. Navigation expects session to exist in live state

**Impact:** New sessions may not appear in live snapshots immediately

**Probability:** High (documented bug)

#### Scenario 6: Tmux Session Detachment
**Location:** `agent/src/tmux.ts:33-47` (`parseSessions`)

```typescript
'#{session_name}||#{session_windows}||#{session_created}||#{session_attached}||#{session_last_attached}'
```

**Issue:** System tracks `attached` status but doesn't use it for activity detection
- Detached session with running process = still marked active
- Attached session with no process = marked stopped

**Impact:** No false positive, but could optimize by checking attachment

**Probability:** N/A (design choice, not a bug)

### Q4: Timeout or threshold configurations

**All Timeouts (from `agent/src/config.ts`):**

| Configuration | Default | Purpose | Impact |
|--------------|---------|---------|---------|
| `IDLE_STOP_MS` | 2000ms | Screen unchanged threshold | ⚠️ Very aggressive |
| `USAGE_POLL_INTERVAL` | 60000ms | Usage API polling | Conservative |
| `TOKEN_POLL_INTERVAL` | 180000ms | Token file scanning | Conservative |
| `NOTIFICATION_POLL_INTERVAL` | 15000ms | Pause notifications | Reasonable |
| `RESET_MONITOR_INTERVAL` | 60000ms | Usage reset detection | Conservative |
| `RESET_NOTIFY_THRESHOLD` | 50 | Min % before reset notify | User-facing |

**WebSocket Intervals (from `agent/src/http/live.ts:24-25`):**
```typescript
const LIVE_CACHE_MIN_TTL_MS = 1000;
const LIVE_CACHE_MAX_TTL_MS = 4000;
```

**Pause Monitor Thresholds (from `agent/src/notifications/pause-monitor.ts:57`):**
```typescript
const durationMs = startedAt ? Date.now() - startedAt : 0;
if (previous === 'running' && durationMs >= 30000) {
  // Notify: session ran for 30s then went idle
}
```

**Reset Monitor Cooldown (from `agent/src/notifications/reset-monitor.ts:20`):**
```typescript
const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours between notifications
```

## Architecture Map

```
[Mobile App] 
    ↓ WebSocket /events
[agent/src/http/ws.ts] 
    ↓ setInterval(config.intervalMs)
[agent/src/http/live.ts] getLiveSnapshot()
    ↓ fetchSessions({ insights: true })
[agent/src/http/sessions.ts]
    ↓ getSessionInsights(sessionName)
[agent/src/agents.ts]
    ↓ queries tmux + ps
    ↓ updates sessionActivity Map
[agent/src/state.ts] (in-memory)
```

**Parallel Notification Flow:**
```
[Interval Timer] → pause-monitor.ts → getSessionInsights() → sendExpoPushMessages()
[Interval Timer] → reset-monitor.ts → getUsageSnapshot() → sendExpoPushMessages()
```

## Key Files

| File | Purpose | Entry Points | Critical Logic |
|------|---------|--------------|----------------|
| `agents.ts` | Activity detection | `getSessionInsights(name)` | `detectAgentState()` state machine |
| `tmux.ts` | Session parsing | `listSessions()`, `parseSessions()` | Parses tmux format strings |
| `state.ts` | In-memory state | `sessionActivity` Map | Hash + timestamp storage |
| `config.ts` | Configuration | Exports constants | `IDLE_STOP_MS = 2000` |
| `http/ws.ts` | WebSocket server | `/events` endpoint | Snapshot polling loop |
| `http/live.ts` | Snapshot builder | `getLiveSnapshot(config)` | Cache TTL logic |
| `notifications/pause-monitor.ts` | Idle notifications | `startPauseMonitor()` | Tracks `running` → `idle` transitions |

## False Positive Risk Assessment

| Risk | Likelihood | Severity | Mitigation |
|------|-----------|----------|------------|
| Static UI tools (htop) marked idle | High | Low | Increase IDLE_STOP_MS or add process whitelist |
| User reading output marked idle | High | Low | Increase IDLE_STOP_MS to 5-10s |
| Orphaned child processes | Low | Medium | Add PID validation |
| Agent restart resets state | Guaranteed | Low | Accept as design trade-off |
| Session creation race | High | Medium | Implement optimistic cache update (documented) |
| Hash collision | Very Low | Low | Accept (benign collision) |

## Recommendations

### 1. Increase Idle Threshold
**Current:** 2000ms is too aggressive for human workflows
**Suggested:** 5000-10000ms (5-10 seconds)
```bash
export TMUX_AGENT_IDLE_STOP_MS=10000
```

### 2. Add Process Whitelist
Certain commands should never be marked idle:
- `htop`, `top`, `watch`
- `tail -f`, `less`, `vim`
- Long-running servers

### 3. Implement Graceful Degradation
On agent restart, mark all sessions as "unknown" instead of "running" until first activity check completes.

### 4. Add Observability
Export metrics:
- Session state transition counts
- False positive rate (user-reported)
- Average idle detection time

### 5. Consider Tmux Hooks
Tmux supports activity hooks (`monitor-activity`) which could supplement screen hashing.

## Open Questions

1. **Why no database persistence?** Design choice for simplicity, or unimplemented feature?
2. **Why 2-second idle threshold?** Seems arbitrary - was this tuned for specific workload?
3. **Should detached sessions be treated differently?** Currently they're processed identically to attached sessions.

## No Cross-Terminal Database

**Finding:** Despite `.claude/rules/cross-terminal-db.md` documenting PostgreSQL coordination tables (`sessions`, `file_claims`), this codebase contains:
- No database imports
- No `DATABASE_URL` references in agent code
- No session registration or heartbeat UPDATE queries

**Conclusion:** The cross-terminal coordination described in the rules is either:
- In a different repository (possibly `opc/` directory)
- Not implemented in this tmux agent service
- Documentation for a planned feature

The tmux agent operates independently using local tmux state and in-memory tracking only.
