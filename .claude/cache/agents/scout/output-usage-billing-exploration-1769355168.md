# Codebase Report: Usage Limits, Quotas, and Billing
Generated: 2026-01-25

## Summary

This React Native/Expo app tracks AI provider usage (Claude, Codex, Copilot, Cursor) across remote hosts. Usage data is polled from a backend agent service, displayed in UI cards, and can trigger push notifications when tasks pause. No local background tasks or scheduling exist currently - monitoring happens server-side.

## Project Structure

```
ter/
├── agent/src/                    # Backend Node.js service (runs on remote hosts)
│   ├── usage.ts                  # Main usage aggregation logic
│   ├── claude.ts                 # Claude OAuth usage API
│   ├── codex.ts                  # Codex usage API
│   ├── copilot.ts                # Copilot usage API
│   ├── cursor.ts                 # Cursor usage API
│   ├── state.ts                  # Usage cache and types
│   ├── config.ts                 # Polling intervals
│   ├── notifications/
│   │   ├── push.ts               # Expo push notification sender
│   │   ├── registry.ts           # Device registration storage
│   │   └── pause-monitor.ts      # Task pause detection & alerts
│   └── http/routes/
│       ├── core.ts               # GET /usage endpoint
│       ├── sessions.ts           # GET /sessions/:name/insights
│       └── notifications.ts      # Device registration endpoints
│
├── lib/                          # React Native app shared libs
│   ├── api.ts                    # API client (getUsage, getSessionInsights)
│   ├── notifications.ts          # Push notification setup & registration
│   ├── types.ts                  # SessionInsights, ProviderUsage types
│   ├── defaults.ts               # Default preferences (pushEnabled: true)
│   └── store.tsx                 # Global state (usageCards visibility)
│
└── app/(tabs)/
    ├── index.tsx                 # Home tab - shows CompactUsageCard components
    └── more.tsx                  # Settings tab - usage card toggles
```

## Questions Answered

### Q1: How are limits checked and tracked?

**Backend Polling (Agent Service):**
- **File:** `/home/gabrielolv/Documents/Projects/ter/agent/src/usage.ts`
- **Function:** `buildUsageSnapshot()` - fetches from 4 providers in parallel
- **Cache:** 30-second TTL in `usageCache` (state.ts:70-82)
- **Polling:** `USAGE_POLL_INTERVAL = 60000ms` (config.ts:8)
- **Token polling:** `TOKEN_POLL_INTERVAL = 180000ms` (config.ts:10)

**Data Sources:**
1. **Claude OAuth:** `fetchClaudeOAuthUsage()` in `claude.ts:79-108`
   - Endpoint: `https://api.anthropic.com/api/oauth/usage`
   - Returns: session limits, weekly limits, token usage

2. **Codex:** `getCodexStatus()` in `codex.ts`
   - Parses CLI output for session/weekly percentages
   - Token usage from log files

3. **Copilot:** `getCopilotStatus()` in `copilot.ts`
   - Polls GitHub API for usage data

4. **Cursor:** `fetchCursorUsage()` in `cursor.ts:40-66`
   - Endpoint: `https://cursor.com/api/usage-summary`
   - Returns: billing cycle, plan usage percentage

**Usage Structure:**
```typescript
// lib/types.ts:171-178
export type SessionInsights = {
  codex?: ProviderUsage;
  claude?: ProviderUsage;
  copilot?: ProviderUsage;
  cursor?: ProviderUsage;
  git?: GitStatus;
  meta?: InsightsMeta;
};

// agent/src/state.ts:21-29
export type ProviderUsage = {
  session?: UsageWindow;      // percentLeft, reset time, windowMinutes
  weekly?: UsageWindow;
  opus?: UsageWindow;
  tokens?: TokenUsage;         // input, output, cached, total
  source?: string;
  error?: string;
  credits?: number;
};
```

**API Endpoints:**
- **GET /usage** (http/routes/core.ts:34) - aggregated snapshot
- **GET /sessions/:name/insights** (http/routes/sessions.ts:135) - per-session insights

### Q2: Notification Setup

**Client-side (React Native):**
- **File:** `/home/gabrielolv/Documents/Projects/ter/lib/notifications.ts`
- **Setup:** `setupNotifications()` - requests permissions, gets Expo push token
- **Registration:** `registerNotificationsForHosts()` - registers device with each host
- **Storage:** AsyncStorage tracks registry (REGISTRY_KEY: 'tmux.notifications.registry.v1')
- **Channel:** 'task-updates' (Android notification channel)

**Server-side (Agent):**
- **Registry:** `/home/gabrielolv/Documents/Projects/ter/agent/src/notifications/registry.ts`
  - Storage: `~/.tmux-agent/notifications/devices.json`
  - Type: `{ deviceId, expoPushToken, platform, updatedAt }`

**Pause Monitoring:**
- **File:** `/home/gabrielolv/Documents/Projects/ter/agent/src/notifications/pause-monitor.ts`
- **Function:** `startPauseMonitor()` - polls session states
- **Trigger:** Agent running → idle for 30+ seconds
- **Poll Interval:** `NOTIFICATION_POLL_INTERVAL = 15000ms` (config.ts:12)
- **Message:** "Task paused - {sessionName} on {host} is idle"

**Workflow:**
1. App calls `registerNotificationsForHosts()` (app/_layout.tsx:68)
2. Gets Expo push token via `Notifications.getExpoPushTokenAsync()`
3. POSTs to each host's `/notifications/register` endpoint
4. Agent stores device in `~/.tmux-agent/notifications/devices.json`
5. Agent's pause-monitor polls sessions every 15s
6. On pause event, sends push via Expo API

### Q3: API Calls Related to Usage/Billing

**Client → Agent API:**
- **lib/api.ts:189-191**
  ```typescript
  export async function getUsage(host: Host): Promise<SessionInsights> {
    return request(host, '/usage', { method: 'GET' }, 12000);
  }
  ```

- **lib/api.ts:251-256**
  ```typescript
  export async function getSessionInsights(host: Host, name: string): Promise<SessionInsights> {
    return request(host, `/sessions/${name}/insights`, { method: 'GET' }, 12000);
  }
  ```

**Agent → External APIs:**
1. **Claude OAuth API:**
   - File: `agent/src/claude.ts:83`
   - URL: `https://api.anthropic.com/api/oauth/usage`
   - Headers: `Authorization: Bearer {accessToken}`

2. **Cursor API:**
   - File: `agent/src/cursor.ts:44`
   - URL: `https://cursor.com/api/usage-summary`
   - Auth: Cookie-based

3. **Codex:** Parses local CLI output (no external API)

4. **Copilot:** GitHub API (specific endpoint not shown in search)

**Usage in UI:**
- **app/(tabs)/index.tsx:206** - `useState<Record<string, SessionInsights>>()` stores per-host usage
- **app/(tabs)/index.tsx:65** - `CompactUsageCard` component displays usage bars

### Q4: Background Task / Scheduling Code

**NO CLIENT-SIDE BACKGROUND TASKS FOUND**
- No `expo-task-manager` or `BackgroundFetch` usage detected
- App relies entirely on server-side polling

**Server-side Scheduling:**
1. **Usage Polling:**
   - Triggered by HTTP requests (no automatic timer)
   - 30s cache prevents excessive polling
   - Agent checks cache age, refreshes if stale

2. **Pause Monitor:**
   - File: `agent/src/notifications/pause-monitor.ts:77-84`
   - Function: `startPauseMonitor()` - single poll execution
   - **Not a recurring interval** - must be called externally
   - Likely triggered by a timer in the main agent service (not shown in search)

3. **Token Refresh:**
   - Triggered on-demand when cache expires (180s TTL)
   - Function: `ensureTokenRefresh()` in usage.ts:12-28

## Conventions Discovered

### Naming
- API clients: `get{Provider}Status()` pattern
- Cache structures: `{provider}Cache` (oauthCache, usageCache, tokenCache)
- Config constants: SCREAMING_SNAKE_CASE
- Types: PascalCase with descriptive names

### Patterns
| Pattern | Usage | Example |
|---------|-------|---------|
| Cache TTL | 30-180s in-memory | `usageCache.ts` check |
| Parallel fetching | `Promise.allSettled()` | `buildUsageSnapshot()` |
| OAuth cache | 60s TTL per provider | `oauthCache.claude.ts` |
| Error handling | Return `{ error: string }` | All provider status functions |

### Configuration
- **Polling intervals:** Env vars with defaults (config.ts)
- **Notification poll:** 15 seconds (NOTIFICATION_POLL_INTERVAL)
- **Usage poll:** 60 seconds (USAGE_POLL_INTERVAL)
- **Token poll:** 180 seconds (TOKEN_POLL_INTERVAL)
- **Cache TTL:** 30 seconds for usage snapshot

## Architecture Map

```
[React Native App] <--HTTP--> [Agent Service (per host)]
        |                              |
        |                              +--[Usage Poller]
        |                              |    ├─> Claude OAuth API
        |                              |    ├─> Cursor API
        |                              |    ├─> Codex CLI
        |                              |    └─> Copilot API
        |                              |
        |                              +--[Pause Monitor]
        |                              |    └─> Expo Push API
        |                              |
        v                              v
[AsyncStorage]                  [~/.tmux-agent/]
  - device registry                - notification devices
  - preferences                    - session states
```

## Key Files

| File | Purpose | Entry Points |
|------|---------|--------------|
| `agent/src/usage.ts` | Usage aggregation | `getUsageSnapshot()`, `startUsageRefresh()` |
| `agent/src/claude.ts` | Claude OAuth polling | `getClaudeStatus()`, `fetchClaudeOAuthUsage()` |
| `agent/src/cursor.ts` | Cursor API polling | `getCursorStatus()`, `fetchCursorUsage()` |
| `agent/src/state.ts` | Cache definitions | `usageCache`, `tokenCache`, `oauthCache` |
| `agent/src/notifications/pause-monitor.ts` | Task pause alerts | `startPauseMonitor()` |
| `lib/api.ts` | Client API methods | `getUsage()`, `getSessionInsights()` |
| `lib/notifications.ts` | Push setup | `setupNotifications()`, `registerNotificationsForHosts()` |
| `app/(tabs)/index.tsx` | Usage UI display | `CompactUsageCard` component |

## Usage Limit Detection Logic

**Percentages:**
- `ProviderUsage.session.percentLeft` - remaining % in current session
- `ProviderUsage.weekly.percentLeft` - remaining % in billing week

**Calculation Example (Cursor):**
```typescript
// cursor.ts:88-89
const planUsed = Number(summary.individualUsage?.plan?.totalPercentUsed ?? 0);
const planPercentLeft = Math.max(0, Math.round(100 - planUsed));
```

**UI Display:**
```typescript
// app/(tabs)/index.tsx:65-120
function CompactUsageCard({ provider, usage }: CompactUsageCardProps) {
  const sessionLeft = usage.session?.percentLeft;
  const weeklyLeft = usage.weekly?.percentLeft;
  // Renders horizontal bars showing remaining capacity
}
```

## Open Questions

1. **Limit Notifications:** No code found for notifying when usage limits are reached (only task pause notifications exist)
2. **Main Polling Loop:** The timer/interval that calls `startPauseMonitor()` is not visible in the search results
3. **Background Refresh:** No React Native background task to refresh usage when app is backgrounded
4. **Notification Scheduling:** Could use `expo-task-manager` to poll usage in background and send local notifications when limits approached

## Recommendations for Adding Usage Limit Notifications

**Option 1: Server-side monitoring (current architecture)**
- Add limit threshold check to `pause-monitor.ts` or new `usage-monitor.ts`
- Send push notification when `percentLeft < 10`
- Requires: Modify agent service, no app changes

**Option 2: Client-side periodic background task**
- Use `expo-task-manager` + `BackgroundFetch`
- Register task to call `getUsage()` every 15-30 minutes
- Schedule local notification if limit approaching
- Requires: New `lib/background-tasks.ts`, app.json config

**Option 3: Hybrid (recommended)**
- Server sends push when limit critical (<5%)
- Client checks on app launch and shows in-app alert
- Minimizes background battery drain
