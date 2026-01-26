# Codebase Report: Ports Implementation Analysis
Generated: 2026-01-19

## Summary
The ports feature is a **complete end-to-end implementation** for listing and managing listening TCP ports in the dev range (3000-9999). It includes a React Native UI with selection mode, an agent backend with dual implementation (lsof/ss), REST API endpoints, and proper data flow through React Query. The architecture follows established patterns in the codebase with clear separation between UI components, API layer, and agent logic.

## Project Structure

```
ter/
├── app/
│   └── ports/
│       └── index.tsx              # Main ports screen (React Native)
├── components/
│   └── PortRow.tsx                # Individual port row component
├── agent/src/
│   ├── ports.ts                   # Port scanning logic (lsof/ss)
│   └── http/
│       ├── routes/ports.ts        # REST API routes
│       ├── ws.ts                  # WebSocket servers (terminal, docker, events)
│       └── live.ts                # Live snapshot mechanism for streaming
└── lib/
    ├── types.ts                   # TypeScript type definitions
    └── api.ts                     # Client-side API functions
```

## Questions Answered

### Q1: What does PortInfo currently contain?

**Location:** `/home/gabrielolv/Documents/Projects/ter/lib/types.ts:175-180`

```typescript
export type PortInfo = {
  pid: number;
  port: number;
  process: string;
  command?: string;
};
```

**Fields:**
- `pid` - Process ID (required)
- `port` - Port number (required)
- `process` - Short process name from lsof/ss (required)
- `command` - Friendly command name from ps (optional)

### Q2: How are ports fetched and displayed?

**Data Flow:**

```
[UI Layer] app/ports/index.tsx
     ↓ (calls)
[API Layer] lib/api.ts::getPorts()
     ↓ (HTTP GET)
[Backend] agent/src/http/routes/ports.ts::GET /ports
     ↓ (calls)
[Logic] agent/src/ports.ts::listPorts()
     ↓ (executes)
[System] lsof -i -P -n -sTCP:LISTEN (or ss -tlnp as fallback)
```

**Key Implementation Details:**

1. **Backend Scanning** (`agent/src/ports.ts:17-24`):
   - Tries `lsof` first (more reliable)
   - Falls back to `ss` if lsof unavailable
   - Filters to dev range: 3000-9999
   - Enriches with full commands from `ps`

2. **API Routes** (`agent/src/http/routes/ports.ts:6-13`):
   - `GET /ports` - List all ports
   - `POST /ports/kill` - Kill processes by PIDs

3. **Client API** (`lib/api.ts:193-195`):
   ```typescript
   export async function getPorts(host: Host): Promise<{ ports: PortInfo[] }> {
     return request(host, '/ports', { method: 'GET' });
   }
   ```

4. **React Query Integration** (`app/ports/index.tsx:36-46`):
   ```typescript
   const { data: portsData, isFetching: refreshing, refetch } = useQuery({
     queryKey: ['ports', currentHost?.id],
     queryFn: async () => {
       if (!currentHost) return { ports: [] };
       return getPorts(currentHost);
     },
     enabled: ready && !!currentHost,
     staleTime: 10_000,
     refetchOnWindowFocus: true,
   });
   ```

### Q3: What UI patterns exist?

**UI Components:**

1. **PortRow** (`components/PortRow.tsx`):
   - Props: `port`, `selected`, `selectionMode`, `onToggleSelect`, `onKill`
   - Layout: Checkbox → Port badge → Info (process/PID) → Kill button
   - Theming: Uses `useTheme()` for dynamic colors

2. **Ports Screen** (`app/ports/index.tsx`):
   - Multi-host selector (horizontal scroll chips)
   - Selection mode toggle (Select/Done button)
   - Bulk kill selected (red button when selection active)
   - Pull-to-refresh
   - Empty states (no hosts / no ports)
   - FadeIn animations with staggered delays

**Patterns to Follow:**
- `Screen` wrapper for layout
- `Card` for list items
- `FadeIn` for staggered animations
- `useMemo` for styles with `createStyles(colors)` pattern
- React Query for data fetching with `queryKey: ['resource', hostId]`
- `useMutation` for state-changing operations with `queryClient.invalidateQueries`

### Q4: Existing Architecture for Live Updates?

**WebSocket Infrastructure** (`agent/src/http/ws.ts`):

The agent has a **complete WebSocket infrastructure** with 4 endpoints:

| Endpoint | Purpose | Implementation |
|----------|---------|----------------|
| `/ws` | Terminal PTY sessions | Bidirectional terminal I/O with flow control |
| `/docker/exec` | Docker container shell | PTY bridge to `docker exec -it` |
| `/docker/logs` | Container logs | Streaming `docker logs -f` |
| `/events` | **Live snapshot streaming** | Periodic snapshots with caching |

**Live Snapshot Mechanism** (`agent/src/http/live.ts`):

```typescript
export type LiveConfig = {
  sessions: boolean;      // Include tmux sessions
  preview: boolean;       // Include preview lines
  previewLines: number;   // Number of preview lines
  insights: boolean;      // Include usage insights
  host: boolean;          // Include host info
  docker: boolean;        // Include docker snapshot
  intervalMs: number;     // Refresh interval
};
```

**How it works:**

1. Client connects to `ws://host/events?sessions=1&host=1&interval=5000`
2. Server parses config from URL params (`parseLiveConfig`)
3. Server builds snapshot from requested sources (`buildLiveSnapshot`)
4. Snapshots cached with TTL (1-4s based on interval)
5. Server sends JSON on interval + on `{type: "refresh"}` messages
6. Client can trigger immediate refresh via WebSocket message

**Current Sources:**
- Sessions (from `fetchSessions`)
- Host info (from `getHostInfo`)
- Docker (from `getDockerSnapshot`)

### Q5: How to extend for ports streaming?

**Pattern to follow:**

1. Add `ports: boolean` to `LiveConfig` in `agent/src/http/live.ts`
2. Import `listPorts` from `../ports`
3. Add to `buildLiveSnapshot`:
   ```typescript
   if (config.ports) {
     snapshot.ports = await listPorts();
   }
   ```
4. Client-side: Connect WebSocket with `?ports=1`
5. Parse incoming `{type: 'snapshot', ports: [...]}`

**Benefit:** Reuses existing caching, flow control, and interval logic.

## Architecture Map

```
┌─────────────────────────────────────────────────────────────┐
│                        React Native UI                       │
│  ┌────────────────┐          ┌──────────────────────────┐  │
│  │ app/ports/     │          │ components/PortRow.tsx   │  │
│  │   index.tsx    │────────> │                          │  │
│  │                │          │ (Rendered for each port) │  │
│  └────────────────┘          └──────────────────────────┘  │
│         │ useQuery(['ports', hostId])                       │
└─────────┼─────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                        API Layer                            │
│  ┌────────────────────────────────────────────────────────┐│
│  │ lib/api.ts::getPorts(host)                             ││
│  │   → request(host, '/ports', {method: 'GET'})           ││
│  └────────────────────────────────────────────────────────┘│
│         │ HTTP GET                                           │
└─────────┼─────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                     Agent Backend                            │
│  ┌────────────────────────────────────────────────────────┐│
│  │ agent/src/http/routes/ports.ts                         ││
│  │   GET /ports   → listPorts()                           ││
│  │   POST /ports/kill → killProcesses(pids)               ││
│  └────────────────────────────────────────────────────────┘│
│         │                                                     │
│         ▼                                                     │
│  ┌────────────────────────────────────────────────────────┐│
│  │ agent/src/ports.ts                                     ││
│  │   listPorts()      → lsof → ps (enrich commands)       ││
│  │   killProcesses()  → kill -15 <pids>                   ││
│  └────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
          │
          ▼
     System (lsof/ss/ps/kill)
```

**Alternative: WebSocket Streaming**

```
┌─────────────────────────────────────────────────────────────┐
│                        React Native UI                       │
│  ┌────────────────────────────────────────────────────────┐│
│  │ useWebSocket(ws://host/events?ports=1&interval=3000)   ││
│  │   → Receives: {type: 'snapshot', ports: [...]}         ││
│  └────────────────────────────────────────────────────────┘│
└─────────┼─────────────────────────────────────────────────┘
          │ WebSocket
          ▼
┌─────────────────────────────────────────────────────────────┐
│                     Agent Backend                            │
│  ┌────────────────────────────────────────────────────────┐│
│  │ agent/src/http/ws.ts                                   ││
│  │   eventsWss → getLiveSnapshot(config)                  ││
│  └────────────────────────────────────────────────────────┘│
│         │                                                     │
│         ▼                                                     │
│  ┌────────────────────────────────────────────────────────┐│
│  │ agent/src/http/live.ts                                 ││
│  │   buildLiveSnapshot(config)                            ││
│  │     if (config.ports) snapshot.ports = listPorts()     ││
│  └────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Key Files Reference

| File | Purpose | Entry Points | Lines |
|------|---------|--------------|-------|
| `app/ports/index.tsx` | Ports screen UI | `PortsScreen()` | 320 |
| `components/PortRow.tsx` | Port row component | `PortRow({port, ...})` | 122 |
| `lib/api.ts` | API client | `getPorts(host)`, `killPorts(host, pids)` | 193-204 |
| `lib/types.ts` | Type definitions | `PortInfo` | 175-180 |
| `agent/src/ports.ts` | Scanning logic | `listPorts()`, `killProcesses(pids)` | 195 |
| `agent/src/http/routes/ports.ts` | API routes | `registerPortRoutes(app)` | 34 |
| `agent/src/http/ws.ts` | WebSocket servers | `attachWebSocketServers(server)` | 404 |
| `agent/src/http/live.ts` | Live snapshots | `buildLiveSnapshot(config)` | 99 |

## Conventions Discovered

### Naming
- **Files:** kebab-case (`port-row.tsx`, `use-theme.ts`)
- **Components:** PascalCase (`PortRow`, `Screen`)
- **Functions:** camelCase (`getPorts`, `listPorts`)
- **Types:** PascalCase (`PortInfo`, `Host`)

### Component Patterns
- **Props types:** `ComponentNameProps` interface
- **Styles:** `createStyles(colors: ThemeColors)` function returning `StyleSheet.create({})`
- **Theme hook:** `const { colors } = useTheme()`
- **Memoization:** `const styles = useMemo(() => createStyles(colors), [colors])`

### API Patterns
- **Request wrapper:** All API calls go through `request<T>(host, path, options, timeout)`
- **Error handling:** `jsonError(c, err)` helper in routes
- **Types:** Request/response types in `lib/types.ts`, separate from backend types

### Backend Patterns
- **Route registration:** `export function registerXRoutes(app: Hono)`
- **Async handlers:** `app.get('/path', async (c) => { ... })`
- **Validation:** Manual validation with explicit error messages
- **Child processes:** `execFileAsync` promisified from `node:child_process`

### React Query Patterns
- **Query keys:** `['resource', contextId]` (e.g., `['ports', hostId]`)
- **Enabled gates:** `enabled: ready && !!currentHost`
- **Mutations:** `useMutation` with `onSuccess: () => queryClient.invalidateQueries(...)`
- **Stale time:** 10 seconds for mostly-static data

### Testing
- No test files found in the ports implementation
- Recommended: Add tests in `tests/` or `__tests__/` directories

## Open Questions & Recommendations

### For Port Metadata Enhancement

**Q: Should we add more fields to PortInfo?**

Potential additions:
- `protocol: 'tcp' | 'udp'` - Currently hardcoded to TCP
- `address: string` - Binding address (0.0.0.0, 127.0.0.1, etc.)
- `state: string` - Connection state (LISTEN, ESTABLISHED, etc.)
- `user: string` - Process owner (from lsof USER column)

**Backend impact:** Extract from existing lsof/ss output
**UI impact:** Display in PortRow (expand on tap?)

### For SSH Tunnel Support

**Q: How to integrate SSH tunnels into ports list?**

Current `listPorts()` only shows **listening** ports. SSH tunnels are:
- **Local forwarding:** `-L 8080:remote:80` → Shows as listening on 8080
- **Remote forwarding:** `-R 8080:local:80` → No local listener
- **Dynamic (SOCKS):** `-D 1080` → Shows as listening on 1080

**Recommendation:**
1. Parse `ps` output for ssh processes with `-L/-R/-D` flags
2. Create separate `SshTunnelInfo` type
3. Add `GET /tunnels` endpoint
4. Merge or separate UI tabs (Ports vs Tunnels)

### For Live Streaming

**Q: Should ports use WebSocket streaming or stick with pull-to-refresh?**

**Option A: WebSocket (like sessions/docker)**
- Pros: Real-time, no manual refresh, detect new processes immediately
- Cons: More complex client code, battery drain, overkill for ports?

**Option B: Pull-to-refresh + auto-interval**
- Pros: Simple, user-controlled, familiar pattern
- Cons: Not real-time, requires manual refresh

**Recommendation:**
- Start with **pull-to-refresh** (existing implementation)
- Add **optional WebSocket** as enhancement
- Use existing `/events` endpoint with `?ports=1` param
- Let user choose in settings (live updates toggle)

### For Error Handling

**Current:** Basic try/catch with fallback (lsof → ss)

**Missing:**
- Permission errors (lsof requires privileges on some systems)
- Timeout handling (already has 5s timeout)
- Partial failure (some PIDs killed, others failed) - **Already handled!** ✓

**Good news:** `killProcesses()` already returns `{killed: [], failed: []}` structure.

## Summary of Findings

### Strengths
1. **Complete implementation** - UI, API, backend all working
2. **Dual fallback** - lsof → ss for cross-platform compatibility
3. **Command enrichment** - Smart extraction of friendly names from ps
4. **Proper React patterns** - Query keys, mutations, invalidation
5. **Bulk operations** - Selection mode + multi-kill
6. **Error handling** - Partial failure tracking, user feedback

### Potential Improvements
1. **Add WebSocket streaming** for real-time updates
2. **SSH tunnel detection** for comprehensive port mapping
3. **Port metadata** (protocol, address, user)
4. **Tests** - Unit tests for parsing logic
5. **Accessibility** - ARIA labels, keyboard navigation

### Architecture Quality
- **Separation of concerns:** Clear UI/API/Backend layers
- **Type safety:** Comprehensive TypeScript types
- **Reusability:** PortRow component, request wrapper
- **Performance:** Caching in live.ts, debouncing in flow control
- **Scalability:** WebSocket infrastructure ready for extension

---

**Next Steps:**
1. Decide on scope: Metadata enhancement vs SSH tunnels vs both
2. Choose update mechanism: Poll-based vs WebSocket streaming
3. Review plan for approval before implementation
4. Consider adding tests for new features
