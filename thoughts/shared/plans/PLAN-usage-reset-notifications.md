# Plan: Usage Limit Reset Push Notifications

## Goal

Add push notifications that alert users when their AI provider usage limits reset, so they know when they can resume using the service at full capacity.

## Technical Choices

- **Server-side monitoring**: Extend existing pause-monitor pattern - agent server polls usage and detects resets
- **Expo Push Service**: Reuse existing push infrastructure (`agent/src/notifications/push.ts`)
- **Per-provider tracking**: Track reset times separately for each provider (Claude, Cursor, Codex, Copilot)
- **Smart notification timing**: Only notify when usage was above a threshold before reset (avoid spam)

## Current State Analysis

### Existing Infrastructure (✓ VERIFIED):

1. **Usage Tracking** (`agent/src/usage.ts`):
   - Polls 4 providers every 60s: Claude, Codex, Copilot, Cursor
   - Each provider returns `session` and `weekly` windows with:
     - `percentLeft: number` (0-100)
     - `reset?: string` (ISO timestamp or relative time like "5h 30m")

2. **Push Notifications** (`agent/src/notifications/`):
   - `push.ts`: `sendExpoPushMessages()` - sends to Expo Push Service
   - `pause-monitor.ts`: Polls every 15s, detects state transitions
   - `registry.ts`: Stores registered devices with `expoPushToken`

3. **Data Flow**:
   ```
   Provider APIs → usage.ts → usageCache → pause-monitor pattern
                                        ↓
                            Detect reset transition
                                        ↓
                            sendExpoPushMessages()
   ```

### Key Files:
- `agent/src/usage.ts` - Usage aggregation, `getUsageSnapshot()`
- `agent/src/state.ts` - `UsageWindow`, `ProviderUsage` types with `reset` field
- `agent/src/notifications/pause-monitor.ts` - Pattern to follow for monitoring
- `agent/src/notifications/push.ts` - Expo push sending
- `agent/src/index.ts` - Background task scheduler (line 38-43)
- `agent/src/config.ts` - Poll intervals

### Reset Time Format:
From `agent/src/claude.ts`:
- OAuth returns `resets_at` as ISO timestamp
- CLI returns relative times like "5h 30m", "2d"

## Tasks

### Task 1: Create Reset Monitor Module

Create `agent/src/notifications/reset-monitor.ts` that tracks usage resets.

- [x] Import types from `../state`
- [x] Import `getUsageSnapshot` from `../usage`
- [x] Import `listNotificationDevices` from `./registry`
- [x] Import `sendExpoPushMessages` from `./push`
- [x] Track last known reset times per provider/window: `Map<string, string>`
- [x] Track last known percentLeft per provider/window: `Map<string, number>`
- [x] Define notification threshold (e.g., notify if was below 50% before reset)

```typescript
type ResetKey = `${string}:${'session' | 'weekly'}`;
const lastResets = new Map<ResetKey, string>();
const lastPercents = new Map<ResetKey, number>();
const NOTIFY_THRESHOLD = 50; // Only notify if was below 50%
```

- [x] Create `detectResets()` function:
  ```typescript
  async function detectResets(): Promise<ResetEvent[]> {
    const snapshot = await getUsageSnapshot();
    const events: ResetEvent[] = [];

    for (const [provider, usage] of Object.entries(snapshot)) {
      if (provider === 'meta') continue;
      // Check session and weekly windows
      // Compare current reset time to last known
      // If reset time changed AND percent jumped up, it's a reset
    }

    return events;
  }
  ```

- [x] Create `buildResetMessages()` function for notification content
- [x] Create `startResetMonitor()` exported function (follows pause-monitor pattern)
- [x] Add inflight guard to prevent concurrent polls

### Task 2: Define Reset Detection Logic

The tricky part: detecting when a reset actually happened vs. just a different reset time.

- [x] Parse reset times into comparable format:
  - ISO timestamps: `new Date(reset).getTime()`
  - Relative times: Compare as strings (they decrease over time)

- [x] Reset detection heuristics:
  1. Reset time changed (new cycle started)
  2. percentLeft increased significantly (jumped from low to high)
  3. Both conditions suggest a reset just happened

- [x] Handle edge cases:
  - First poll (no previous data) - don't notify
  - Provider errors - skip that provider
  - Missing reset field - skip that window

### Task 3: Integrate with Server Startup

Modify `agent/src/index.ts` to start the reset monitor.

- [x] Import `startResetMonitor` from `./notifications/reset-monitor`
- [x] Add new interval constant `RESET_MONITOR_INTERVAL` (default: 60s, same as usage poll)
- [x] Start monitor on server init (after usage refresh starts)
- [x] Use same pattern as pause-monitor:
  ```typescript
  if (RESET_MONITOR_INTERVAL > 0) {
    startResetMonitor();
    setInterval(() => {
      startResetMonitor();
    }, RESET_MONITOR_INTERVAL);
  }
  ```

### Task 4: Add Configuration

Update `agent/src/config.ts`:

- [x] Add `RESET_MONITOR_INTERVAL` (env: `TMUX_AGENT_RESET_MONITOR_MS`, default: 60000)
- [x] Add `RESET_NOTIFY_THRESHOLD` (env: `TMUX_AGENT_RESET_THRESHOLD`, default: 50)

### Task 5: Create Notification Channel (Optional Enhancement)

Add a dedicated notification channel for reset alerts.

- [ ] In mobile app `lib/notifications.ts`, add new channel:
  ```typescript
  const RESET_CHANNEL_ID = 'usage-resets';

  async function ensureResetChannel() {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync(RESET_CHANNEL_ID, {
      name: 'Usage resets',
      importance: Notifications.AndroidImportance.DEFAULT,
      // ... config
    });
  }
  ```

- [ ] Update `setupNotifications()` to create both channels

### Task 6: Add Unit Tests

Create `agent/src/notifications/__tests__/reset-monitor.test.ts`:

- [ ] Test reset detection logic (SKIPPED: No test framework configured)
- [ ] Test that resets only notify when threshold crossed (SKIPPED)
- [ ] Test message formatting (SKIPPED)
- [ ] Mock `getUsageSnapshot` and `sendExpoPushMessages` (SKIPPED)

Note: `_testing` exports are available in reset-monitor.ts for future tests when a test framework is added.

## Success Criteria

### Automated Verification:
- [x] TypeScript compiles: Module loads successfully with tsx
- [ ] Tests pass: `cd agent && npm test` (no test framework configured)
- [ ] No lint errors: `cd agent && npm run lint` (no lint script configured)

### Manual Verification:
- [ ] Start agent with low usage, wait for actual reset
- [ ] Verify notification received when limit resets
- [ ] Verify NO notification when usage was already high (above threshold)
- [ ] Test with multiple providers

## Notification Message Examples

**Title:** "Usage Reset"
**Body:** "Claude session limit reset - you now have 100% capacity"

**Title:** "Weekly Limit Reset"
**Body:** "Your Cursor weekly limit has reset"

## Out of Scope

- User preferences for which providers to notify about (future enhancement)
- Scheduled notifications before reset (would need cron-style scheduling)
- In-app notification center (mobile app UI changes)
- Notification history/persistence

## Risks (Pre-Mortem)

### Tigers:
- **Reset time parsing variability** (MEDIUM)
  - Different providers return different formats
  - Mitigation: Robust parsing with fallbacks, log unparseable formats

- **False positive notifications** (MEDIUM)
  - Could spam users if detection is too aggressive
  - Mitigation: Require BOTH reset time change AND percent increase

### Elephants:
- **Timing synchronization** (LOW)
  - If usage poll happens right at reset moment, might miss the transition
  - Note: 60s polling should catch resets within reasonable window
