# Debug Report: Session Launch Causes Temporary Desync
Generated: 2026-01-23

## Symptom
When launching a new session:
1. Terminal opens but user cannot interact with it
2. Scroll is stuck in a "half" position
3. Works only after force refreshing sessions on homepage

## Hypotheses Tested

1. **Race condition between navigation and WebSocket connection** - CONFIRMED - Evidence shows timing issues
2. **State sync issue between homepage sessions list and terminal view** - CONFIRMED - Critical dependency on live state
3. **Scroll position initialization race** - CONFIRMED - Pager scrollTo depends on sessions array timing

## Investigation Trail

| Step | Action | Finding |
|------|--------|---------|
| 1 | Read TerminalWebView.tsx | Simple WebView wrapper, no issues found |
| 2 | Read terminal.tsx launch flow | Found critical timing dependency on `useHostLive` sessions |
| 3 | Read live.tsx | Found WebSocket-based state that has async initialization |
| 4 | Traced session initialization | Found race between `sessions` array population and `currentSessionName` |
| 5 | Examined pager scroll logic | Found `scrollTo` depends on `sessions.findIndex` which can be -1 |
| 6 | Examined LaunchSheet.tsx | Creates session then immediately navigates |

## Evidence

### Finding 1: New Session Not in Live State Initially
- **Location:** `/home/gabrielolv/Documents/Projects/ter/app/session/[hostId]/[name]/terminal.tsx:153-156`
- **Observation:** 
  ```typescript
  const { state, refresh } = useHostLive(host, { sessions: true, enabled: isFocused });
  const sessions = state?.sessions ?? [];
  const sessionCount = sessions.length;
  const initialIndex = sessions.findIndex((session) => session.name === initialSessionName);
  ```
- **Relevance:** When navigating to a newly created session, `sessions` comes from WebSocket live state (`/events` endpoint). The newly created session may not yet be in this list because:
  1. The WebSocket hasn't received the updated snapshot yet
  2. The cache (`liveStateCache`) from the homepage doesn't include the new session

### Finding 2: currentSessionName Falls Back to Wrong Value
- **Location:** `/home/gabrielolv/Documents/Projects/ter/app/session/[hostId]/[name]/terminal.tsx:389-401`
- **Observation:**
  ```typescript
  useEffect(() => {
    if (sessions.length > 0) {
      hadSessionsRef.current = true;
    }
    if (sessions.length === 0 && hadSessionsRef.current) {
      router.back();
      return;
    }
    if (sessions.length === 0) return;
    if (currentSessionName && sessions.some((session) => session.name === currentSessionName)) return;
    setCurrentSessionName(sessions[0].name);  // Falls back to first session!
  }, [sessions, currentSessionName, router]);
  ```
- **Relevance:** If `initialSessionName` (the newly created session) is NOT in the `sessions` array yet, the code falls back to `sessions[0].name` - which could be a DIFFERENT existing session. This causes the pager to show the wrong terminal.

### Finding 3: Pager Scroll Position Race Condition
- **Location:** `/home/gabrielolv/Documents/Projects/ter/app/session/[hostId]/[name]/terminal.tsx:423-429`
- **Observation:**
  ```typescript
  useEffect(() => {
    if (!currentSessionName || sessions.length === 0) return;
    const index = sessions.findIndex((session) => session.name === currentSessionName);
    if (index < 0) return;  // Bails if session not found!
    const x = index * screenWidth;
    pagerRef.current?.scrollTo({ x, animated: false });
  }, [currentSessionName, sessions, screenWidth]);
  ```
- **Relevance:** When the session IS found but at the wrong index initially, or when `sessions` updates async, the scroll position may be set incorrectly and then never corrected.

### Finding 4: LaunchSheet Creates Session Before Navigation
- **Location:** `/home/gabrielolv/Documents/Projects/ter/components/LaunchSheet.tsx:809-832`
- **Observation:**
  ```typescript
  const handleLaunch = useCallback(async (command: Command) => {
    // ...
    await createSession(selectedHost, sessionName);
    await sendText(selectedHost, sessionName, `cd ${selectedProject.path}\n`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await sendText(selectedHost, sessionName, `${command.command}\n`);
    // ...
    router.push(`/session/${selectedHost.id}/${encodeURIComponent(sessionName)}/terminal`);
  }, [...]);
  ```
- **Relevance:** Session is created via HTTP API, but the terminal screen relies on WebSocket live state which may not have received the update yet. The 100ms delay is for sending commands, not for state propagation.

### Finding 5: Live State Cache Sharing Issue
- **Location:** `/home/gabrielolv/Documents/Projects/ter/lib/live.tsx:50`
- **Observation:**
  ```typescript
  const liveStateCache = new Map<string, HostLiveState>();
  ```
- **Relevance:** The homepage and terminal screen share this cache. When terminal mounts, it reads from cache which may have stale sessions list. The WebSocket reconnects but takes time to receive snapshot.

### Finding 6: Force Refresh Fixes It
- **Location:** `/home/gabrielolv/Documents/Projects/ter/app/(tabs)/index.tsx:436-440`
- **Observation:** Homepage pull-to-refresh calls `refreshAll()` which sends a `{ type: 'refresh' }` message via WebSocket, triggering an immediate snapshot response.
- **Relevance:** This explains why force refresh fixes the issue - it forces the server to send an updated session list.

## Root Cause

**Primary:** Race condition between session creation (HTTP API) and session list state propagation (WebSocket snapshot).

**Sequence of events causing the bug:**
1. LaunchSheet calls `createSession()` via HTTP API
2. LaunchSheet immediately navigates to terminal screen
3. Terminal screen mounts and calls `useHostLive()` 
4. `useHostLive()` reads from `liveStateCache` which has STALE data (doesn't include new session)
5. WebSocket may still be connecting or waiting for next snapshot
6. `sessions` array doesn't contain the new session
7. Effect at line 389-401 runs: `initialSessionName` not found, falls back to `sessions[0]`
8. Wrong session becomes `currentSessionName`
9. Pager scrolls to wrong position or stays at position 0
10. User sees wrong/stuck terminal
11. Eventually WebSocket receives snapshot with new session
12. But `currentSessionName` is already set to wrong value
13. Line 399 check passes: `sessions.some((session) => session.name === currentSessionName)` - true for OLD session
14. State never corrects itself

**Why force refresh works:** It triggers immediate WebSocket snapshot refresh, and if done from homepage before navigating again, the cache gets updated.

**Confidence:** High

## Recommended Fix

### Option A: Optimistic State Update (Best UX)
**Files to modify:**
- `/home/gabrielolv/Documents/Projects/ter/lib/live.tsx` (lines around 50-60)

**Steps:**
1. Export a function to optimistically add a session to the cache:
   ```typescript
   export function addSessionToCache(hostId: string, session: Session) {
     const cached = liveStateCache.get(hostId);
     if (cached) {
       const exists = cached.sessions.some(s => s.name === session.name);
       if (!exists) {
         liveStateCache.set(hostId, {
           ...cached,
           sessions: [...cached.sessions, session],
         });
       }
     }
   }
   ```

2. Call this from LaunchSheet before navigation:
   ```typescript
   addSessionToCache(selectedHost.id, { name: sessionName, createdAt: Date.now() });
   router.push(...);
   ```

### Option B: Force Refresh on Terminal Mount
**Files to modify:**
- `/home/gabrielolv/Documents/Projects/ter/app/session/[hostId]/[name]/terminal.tsx` (around line 153)

**Steps:**
1. Add immediate refresh call when terminal mounts:
   ```typescript
   const { state, refresh } = useHostLive(host, { sessions: true, enabled: isFocused });
   
   // Force refresh on mount to get latest sessions
   useEffect(() => {
     if (host && isFocused) {
       refresh();
     }
   }, [host?.id]); // Only on initial mount
   ```

### Option C: Wait for Session in List (Safest)
**Files to modify:**
- `/home/gabrielolv/Documents/Projects/ter/app/session/[hostId]/[name]/terminal.tsx` (lines 389-401)

**Steps:**
1. Don't fall back to `sessions[0]` if `initialSessionName` is not found. Instead, wait:
   ```typescript
   useEffect(() => {
     if (sessions.length > 0) {
       hadSessionsRef.current = true;
     }
     if (sessions.length === 0 && hadSessionsRef.current) {
       router.back();
       return;
     }
     if (sessions.length === 0) return;
     
     // Check if target session exists
     const targetExists = sessions.some((session) => session.name === initialSessionName);
     if (targetExists) {
       // Only set if not already set to this session
       if (currentSessionName !== initialSessionName) {
         setCurrentSessionName(initialSessionName);
       }
       return;
     }
     
     // Target session not found yet - wait for it instead of falling back
     // This handles the race condition where session was just created
     if (!currentSessionName) {
       // Show loading state or wait - don't set wrong session
       return;
     }
     
     // currentSessionName is set but not in list - session was killed
     if (!sessions.some((session) => session.name === currentSessionName)) {
       setCurrentSessionName(sessions[0]?.name ?? '');
     }
   }, [sessions, currentSessionName, initialSessionName, router]);
   ```

### Option D: Combine A + B (Recommended)
Implement both optimistic update AND force refresh for belt-and-suspenders reliability.

## Prevention

1. **Separate concerns:** Session creation should update local state before navigation, not rely solely on WebSocket propagation
2. **Add loading state:** Terminal screen should show loading until target session appears in sessions list
3. **Add retry logic:** If session not found after N seconds, show error with retry button
4. **Consider using React Query or similar:** Provides cache invalidation and optimistic updates out of the box
