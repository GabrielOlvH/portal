# Codebase Report: Push Notification Implementation Discovery
Generated: 2026-01-25

## Summary

**VERIFIED:** A complete push notification system exists with both client and server components. The system uses:
- **expo-notifications** (v0.32.16) for iOS/Android push tokens
- **@notifee/react-native** (v9.1.8) for Android ongoing notifications
- **Expo Push Notification Service** for delivery
- **Background polling** (15s interval) for agent state monitoring

## Project Structure

```
ter/
├── lib/
│   ├── notifications.ts           # Client: Push token registration
│   └── ongoing-notifications.ts   # Client: Android ongoing notifications
├── agent/
│   └── src/
│       └── notifications/
│           ├── push.ts            # Server: Expo push sender
│           ├── registry.ts        # Server: Device registry
│           ├── pause-monitor.ts   # Server: Agent state monitor
│           └── routes/
│               └── notifications.ts # Server: HTTP API routes
└── app/
    ├── _layout.tsx               # App: Registration on launch
    └── (tabs)/more.tsx           # App: Settings UI
```

## Questions Answered

### Q1: What notification packages are installed?

**VERIFIED (package.json:20,39):**

| Package | Version | Purpose |
|---------|---------|---------|
| `expo-notifications` | ~0.32.16 | Push token generation, iOS/Android notifications |
| `@notifee/react-native` | ^9.1.8 | Android-only ongoing notifications |

**App Configuration (app.json:39-40):**
- Plugin: `expo-notifications` (enabled)
- Plugin: `expo-live-activity` (enabled, iOS only)

### Q2: How does the notification system work?

**Client Side (lib/notifications.ts):**

```typescript
// Main registration flow
setupNotifications()
  → ensureNotificationHandler()     // Set up expo-notifications handler
  → ensureAndroidChannel()          // Create "task-updates" channel
  → getProjectId()                  // Get Expo project ID
  → getOrCreateDeviceId()           // Generate/retrieve device UUID
  → Returns: { pushToken, deviceId }

registerNotificationsForHosts(hosts: Host[])
  → setupNotifications()
  → For each host: POST /notifications/register
     - Sends: { deviceId, expoPushToken, platform }
  → Stores registration status in AsyncStorage
```

**Server Side (agent/src/notifications/):**

```
HTTP Routes (notifications/routes/notifications.ts):
├── POST /notifications/register    # Register device
├── DELETE /notifications/register  # Unregister device
├── GET /notifications/register     # List devices
└── POST /notifications/test        # Send test notification

Device Registry (notifications/registry.ts):
├── Storage: ~/.tmux-agent/notifications/devices.json
├── upsertNotificationDevice()     # Add/update device
├── removeNotificationDevice()     # Remove device
└── listNotificationDevices()      # List all devices

Push Sender (notifications/push.ts):
├── URL: https://exp.host/--/api/v2/push/send
├── Batching: 100 messages per batch
└── sendExpoPushMessages()         # Send to Expo service

State Monitor (notifications/pause-monitor.ts):
├── Polls: Every 15 seconds (NOTIFICATION_POLL_INTERVAL)
├── Detects: Agent state transitions (running → idle)
├── Minimum runtime: 30 seconds before notifying
└── Sends: "Task paused" notification
```

### Q3: What background/scheduled tasks exist?

**VERIFIED (agent/src/index.ts:12-43):**

| Task | Interval | Environment Variable | Default |
|------|----------|---------------------|---------|
| Usage refresh | 60s | TMUX_AGENT_USAGE_POLL_MS | 60000ms |
| Token refresh | 180s | TMUX_AGENT_TOKEN_POLL_MS | 180000ms |
| Notification monitor | 15s | TMUX_AGENT_NOTIFICATION_POLL_MS | 15000ms |

**Implementation:**
```typescript
// agent/src/index.ts:38-43
if (NOTIFICATION_POLL_INTERVAL > 0) {
  startPauseMonitor();              // Initial poll
  setInterval(() => {
    startPauseMonitor();            // Repeat every 15s
  }, NOTIFICATION_POLL_INTERVAL);
}
```

**State Detection Logic (agent/src/notifications/pause-monitor.ts:31-75):**

1. Poll tmux sessions every 15s
2. Get agent insights for each session
3. Track state transitions in memory:
   - `lastStates`: Map<sessionName, AgentState>
   - `runningSince`: Map<sessionName, timestamp>
4. Detect `running → idle` transition
5. Only notify if session was running for 30+ seconds
6. Send push notification to all registered devices

### Q4: How does notification registration work?

**Client Registration Flow (app/_layout.tsx:67-72):**

```typescript
useEffect(() => {
  if (preferences.notifications.pushEnabled) {
    void registerNotificationsForHosts(hosts);
  } else {
    void unregisterNotificationsForHosts(hosts);
  }
}, [hosts, preferences.notifications.pushEnabled]);
```

**Registration Process:**

1. App launches → _layout.tsx effect runs
2. Check `preferences.notifications.pushEnabled` (default: true)
3. If enabled:
   - Call `setupNotifications()` to get push token
   - For each host, POST to `/notifications/register`
   - Save registration status to AsyncStorage
4. If disabled:
   - For each host, DELETE to `/notifications/register`

**Server Storage:**
- Location: `~/.tmux-agent/notifications/devices.json`
- Format:
```json
{
  "device-uuid-1": {
    "deviceId": "device-uuid-1",
    "expoPushToken": "ExponentPushToken[xxxxxx]",
    "platform": "android",
    "updatedAt": 1737849600000
  }
}
```

## Notification Types

### 1. Push Notifications (expo-notifications)

**Location:** `lib/notifications.ts`
**Platform:** iOS + Android
**Use Case:** Remote notifications when app is backgrounded

**Features:**
- Push token generation
- Device registration with server
- Test notifications via `/notifications/test` endpoint

**Limitations (nohup.out:22-23):**
```
WARN: Android Push notifications (remote notifications) functionality 
provided by expo-notifications was removed from Expo Go with the release 
of SDK 53. Use a development build instead of Expo Go.
```

### 2. Ongoing Notifications (@notifee/react-native)

**Location:** `lib/ongoing-notifications.ts`
**Platform:** Android only
**Use Case:** Persistent "task in progress" notifications

**API:**
```typescript
updateOngoingNotification(title: string, body: string)
  → Creates/updates notification ID "task-ongoing"
  → Channel: "task-updates"
  → Properties: ongoing=true, onlyAlertOnce=true

clearOngoingNotification()
  → Cancels notification ID "task-ongoing"
```

**Implementation Details:**
- Lazy loads @notifee module (graceful fail if not available)
- Creates channel on first use
- Uses high importance for visibility
- Reuses same notification ID (updates in place)

## Key Files

| File | Purpose | Entry Points |
|------|---------|--------------|
| `lib/notifications.ts` | Client push token setup | `registerNotificationsForHosts()`, `setupNotifications()` |
| `lib/ongoing-notifications.ts` | Android ongoing notifications | `updateOngoingNotification()`, `clearOngoingNotification()` |
| `agent/src/notifications/pause-monitor.ts` | Agent state monitoring | `startPauseMonitor()` (called every 15s) |
| `agent/src/notifications/push.ts` | Expo push sender | `sendExpoPushMessages()` |
| `agent/src/notifications/registry.ts` | Device storage | `upsertNotificationDevice()`, `listNotificationDevices()` |
| `agent/src/http/routes/notifications.ts` | HTTP API | POST/GET/DELETE `/notifications/register`, POST `/notifications/test` |

## Architecture Diagram

```
[Mobile App (React Native)]
         |
         | 1. App launches
         v
  setupNotifications()
         |
         | 2. Get Expo push token
         v
  registerNotificationsForHosts()
         |
         | 3. POST /notifications/register
         v
[Agent Server (Node.js)]
         |
         | 4. Store in devices.json
         v
   Device Registry
   ~/.tmux-agent/notifications/devices.json
         ^
         | 5. Every 15s
         |
  startPauseMonitor()
         |
         | 6. Check tmux sessions
         v
   Detect: running → idle (30s+)
         |
         | 7. Build push message
         v
  sendExpoPushMessages()
         |
         | 8. POST to Expo
         v
[Expo Push Service]
         |
         | 9. Deliver notification
         v
   [Mobile Device]
```

## Conventions Discovered

### Notification Configuration

**Channel ID:** `'task-updates'` (consistent across all notification types)

**Notification Structure:**
```typescript
{
  title: string,
  body: string,
  sound: 'default',
  channelId: 'task-updates',
  data: {
    type: 'task-paused' | 'test-push',
    sessionName?: string,
    host?: string
  }
}
```

### State Tracking

**Agent States:**
- `'running'` - Agent actively processing
- `'idle'` - Agent waiting for input
- `'stopped'` - Session inactive

**Transition Logic:**
- Only notify on `running → idle` after 30+ seconds of runtime
- Ignore quick runs (< 30s)
- Reset tracking when session disappears

### Periodic Tasks Pattern

**Standard Pattern (agent/src/index.ts):**
```typescript
if (POLL_INTERVAL > 0) {
  startTask();                    // Run immediately
  setInterval(() => {
    startTask();                  // Repeat periodically
  }, POLL_INTERVAL);
}
```

**Applied to:**
1. Usage refresh (60s)
2. Token refresh (180s)
3. Notification monitoring (15s)

## Configuration

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| TMUX_AGENT_NOTIFICATION_POLL_MS | 15000 | How often to check agent state |
| TMUX_AGENT_USAGE_POLL_MS | 60000 | How often to refresh system usage |
| TMUX_AGENT_TOKEN_POLL_MS | 180000 | How often to check API tokens |

### User Preferences (lib/defaults.ts:24)

```typescript
notifications: {
  pushEnabled: boolean,    // Enable/disable push notifications
  liveEnabled: boolean     // Enable/disable live activities (iOS)
}
```

**UI Location:** Settings tab (`app/(tabs)/more.tsx`)

## Testing Capabilities

**Test Endpoint:** POST `/notifications/test`

**Payload:**
```json
{
  "title": "Test Title",
  "body": "Test message"
}
```

**Behavior:**
- Retrieves all registered devices
- Sends push notification to each
- Returns count of messages sent

**Usage in UI:** Settings tab has "Send Test Notification" button

## Platform Differences

### Android
- Uses both expo-notifications AND @notifee/react-native
- Ongoing notifications for persistent task status
- Notification channels required (task-updates)
- Works in Expo Go for local only

### iOS
- Uses expo-notifications only
- expo-live-activity plugin for Dynamic Island
- Push notifications require development build (not Expo Go)

## Known Issues

**Expo Go Limitation (SDK 53+):**
```
WARN: Android Push notifications (remote notifications) functionality 
provided by expo-notifications was removed from Expo Go with the release 
of SDK 53. Use a development build instead of Expo Go.
```

**Impact:** Remote push notifications require development build, but local notifications still work.

## Implementation Status

**FULLY IMPLEMENTED:**
- ✓ Push token generation
- ✓ Device registration API
- ✓ Agent state monitoring (15s polling)
- ✓ Push message sending via Expo service
- ✓ User preferences for enable/disable
- ✓ Test notification functionality
- ✓ Android ongoing notifications
- ✓ Multi-device support

**NOT IMPLEMENTED:**
- Background fetch when app suspended (iOS/Android limitations)
- Custom notification sounds
- Notification history/log
- Per-session notification preferences
- Notification action buttons

## Code Quality Notes

### Good Patterns
- Graceful degradation (notifee lazy loads, fails silently)
- Batching (100 messages per Expo API call)
- Duplicate prevention (onlyAlertOnce on Android)
- Memory cleanup (removes dead sessions from tracking)
- Minimum runtime filter (30s) prevents notification spam

### Potential Improvements
- No retry logic for failed push sends
- No receipt checking (Expo returns receipt tickets)
- Device registry has no expiration/cleanup
- No rate limiting on test endpoint
- Hardcoded 30s minimum runtime threshold

## Integration Points

**Entry Points:**
1. **App launch** → `app/_layout.tsx:68` → `registerNotificationsForHosts()`
2. **Settings toggle** → `app/(tabs)/more.tsx:445` → Re-register/unregister
3. **Agent startup** → `agent/src/index.ts:39-42` → `startPauseMonitor()` loop
4. **API calls** → `agent/src/http/routes/notifications.ts` → Device CRUD + test

**Data Flow:**
```
User enables notifications
  → App gets push token
  → Registers with each host
  → Host stores device in JSON
  → Host polls tmux every 15s
  → Detects state change
  → Sends push via Expo
  → User receives notification
```

## Related Plans

**Original Plan:** `/home/gabrielolv/Documents/Projects/ter/thoughts/shared/plans/PLAN-agent-notifications.md`

**Status:** Implemented and extended beyond original plan
- Original: Local notifications only
- Actual: Full push notification system with server monitoring

**Additional handoff:** `thoughts/shared/handoffs/ter/2026-01-17_plan-agent-notifications.md`

## Open Questions

1. **Device cleanup:** No TTL on device registry entries - devices never expire
2. **Error handling:** Failed push sends are caught but not logged/retried
3. **Notification history:** No record of what notifications were sent
4. **iOS Live Activities:** expo-live-activity plugin configured but usage not found
5. **Background permissions:** No BackgroundFetch or TaskManager usage found

## Recommendations

For extending notification functionality:

1. **Add receipt checking:** Expo returns receipt tickets to verify delivery
2. **Implement retry logic:** Queue failed sends for retry
3. **Add device expiration:** Clean up devices not seen in 30+ days
4. **Log notification events:** Track what was sent and delivery status
5. **Add notification preferences:** Per-session or per-host notification settings
