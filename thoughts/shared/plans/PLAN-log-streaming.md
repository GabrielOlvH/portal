# Plan: Log Streaming Feature

## Goal
Add real-time log streaming for Docker containers (and optionally systemd services), allowing users to view logs directly in the app without needing a full terminal session. This provides a read-only, lightweight alternative to `docker exec` for monitoring container output.

## Technical Choices
- **WebSocket for streaming**: Reuse existing WebSocket infrastructure (same pattern as `/docker/exec`)
- **Read-only xterm.js**: Use same WebView approach but disable input, optimize for log viewing
- **Agent-side spawning**: Use `docker logs -f` via node-pty for consistent streaming with flow control
- **No PTY needed for logs**: Use child_process spawn directly (logs don't need terminal emulation)

## Current State Analysis

### Existing Infrastructure:
- **WebSocket server**: `agent/src/http/ws.ts:189` - `attachWebSocketServers()` manages three endpoints
- **Docker exec pattern**: `agent/src/http/ws.ts:268-294` - spawns PTY for interactive shell
- **Docker routes**: `agent/src/http/routes/docker.ts` - container actions
- **Docker terminal UI**: `app/hosts/[id]/docker/[containerId]/terminal.tsx` - xterm.js WebView
- **Container detail UI**: `app/hosts/[id]/docker/[containerId]/index.tsx` - actions and info

### Key Patterns to Follow:
- WebSocket auth via `?token=` query param
- `enableLowLatencySocket()` for TCP_NODELAY
- Container ID passed via `?container=` param
- HTML source caching for WebView performance

### Key Files:
- `agent/src/http/ws.ts` - Add new `/docker/logs` WebSocket handler
- `agent/src/http/routes/docker.ts` - (optional) REST endpoint for log history
- `app/hosts/[id]/docker/[containerId]/logs.tsx` - New log viewer screen
- `app/hosts/[id]/docker/[containerId]/index.tsx` - Add "Logs" button

## Tasks

### Task 1: Add WebSocket Log Streaming Endpoint (Agent)
Add a new WebSocket endpoint `/docker/logs` that streams container logs.

- [ ] Add `logsWss` WebSocketServer in `attachWebSocketServers()`
- [ ] Register `/docker/logs` path in `wssByPath` Map
- [ ] Implement log streaming handler:
  - Parse `container`, `tail`, `follow`, `timestamps` query params
  - Spawn `docker logs` with appropriate flags
  - Stream stdout/stderr to WebSocket
  - Handle close/cleanup
- [ ] Support both follow mode (`-f`) and one-shot mode

**Files to modify:**
- `agent/src/http/ws.ts`

**Implementation details:**
```typescript
// New handler pattern (no PTY needed for logs)
logsWss.on('connection', (ws, req) => {
  const url = new URL(req.url, ...);
  const container = url.searchParams.get('container');
  const follow = url.searchParams.get('follow') !== '0';
  const tail = url.searchParams.get('tail') || '100';
  const timestamps = url.searchParams.get('timestamps') === '1';

  const args = ['logs'];
  if (follow) args.push('-f');
  if (timestamps) args.push('-t');
  args.push('--tail', tail, container);

  const proc = spawn('docker', args);
  proc.stdout.on('data', (data) => ws.send(data));
  proc.stderr.on('data', (data) => ws.send(data));
  // ... cleanup on close
});
```

### Task 2: Create Log Viewer Screen (Mobile)
Create a new screen for viewing container logs with a read-only terminal display.

- [ ] Create `app/hosts/[id]/docker/[containerId]/logs.tsx`
- [ ] Build log-specific WebSocket URL with params
- [ ] Create simplified xterm.js HTML (read-only, no input handling)
- [ ] Add header with container name and action buttons
- [ ] Add "Clear" button to clear visible output
- [ ] Add "Scroll to Bottom" floating button
- [ ] Style for log viewing (maybe different background to distinguish from terminal)

**Files to create:**
- `app/hosts/[id]/docker/[containerId]/logs.tsx`

**Key differences from terminal.tsx:**
- No input handling (read-only)
- No keyboard accessory
- Simpler message protocol (just receive data)
- Auto-scroll to bottom by default
- Optional timestamps display toggle

### Task 3: Add Logs Button to Container Detail Screen
Add navigation to logs from the container detail view.

- [ ] Add "Logs" button in control buttons section
- [ ] Use `FileText` or `ScrollText` icon from lucide-react-native
- [ ] Navigate to `/hosts/[id]/docker/[containerId]/logs`
- [ ] Only show for running containers (logs available for stopped too, but less useful)

**Files to modify:**
- `app/hosts/[id]/docker/[containerId]/index.tsx`

### Task 4: Add Log Settings/Options
Add controls for log viewing preferences.

- [ ] Tail lines selector (50, 100, 500, 1000, all)
- [ ] Follow toggle (auto-scroll as new logs arrive)
- [ ] Timestamps toggle
- [ ] Implement as bottom sheet or header dropdown

**Files to modify:**
- `app/hosts/[id]/docker/[containerId]/logs.tsx`

### Task 5: Handle Edge Cases
Ensure robust handling of various scenarios.

- [ ] Container not found → show error and navigate back
- [ ] Container stops while viewing → show "Container stopped" message, keep logs visible
- [ ] Large log volume → implement backpressure/throttling if needed
- [ ] Reconnection on network drop (like terminal does)
- [ ] Empty logs → show "No logs available" message

**Files to modify:**
- `agent/src/http/ws.ts`
- `app/hosts/[id]/docker/[containerId]/logs.tsx`

## Success Criteria

### Automated Verification:
- [ ] TypeScript compiles: `pnpm typecheck`
- [ ] Linting passes: `pnpm lint`
- [ ] Agent builds: `cd agent && pnpm build`

### Manual Verification:
- [ ] Can view logs of a running container
- [ ] Logs stream in real-time with follow mode
- [ ] Can view logs of a stopped container (historical)
- [ ] Timestamps toggle works
- [ ] Tail lines setting works
- [ ] Clear button clears visible logs
- [ ] Scroll to bottom works
- [ ] Network reconnection works
- [ ] Container stop during viewing handled gracefully

## Out of Scope
- **Systemd journal streaming** - Future enhancement, different API
- **Log search/filter** - Could add later with client-side filtering
- **Log download/export** - Could add later
- **Multi-container log aggregation** - Complex, out of scope
- **Log persistence/history on agent** - Just streams docker logs

## Risks (Pre-Mortem)

### Tigers:
- **High log volume causing WebSocket backpressure** (MEDIUM)
  - Mitigation: Implement throttling similar to terminal flow control, or use `--since` to limit initial load

### Elephants:
- **xterm.js overhead for read-only logs** (LOW)
  - Note: Could use simpler text view, but xterm.js handles ANSI colors which logs often have
