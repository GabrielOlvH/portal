# Codebase Report: Ports Feature
Generated: 2026-01-19

## Summary
The ports feature allows users to view and manage listening network ports (range 3000-9999) on connected hosts. It includes a full-stack implementation with agent-side port scanning, REST API endpoints, and a React Native UI with multi-select capabilities.

## Project Structure

```
ter/
├── app/
│   └── ports/
│       └── index.tsx           # Main ports screen UI
├── agent/
│   └── src/
│       ├── ports.ts            # Port scanning logic
│       └── http/
│           └── routes/
│               └── ports.ts     # HTTP endpoints
├── components/
│   └── PortRow.tsx             # Individual port list item
└── lib/
    ├── api.ts                  # Client API functions
    └── types.ts                # TypeScript types
```

## Files and Descriptions

### 1. UI Layer

#### `/home/gabrielolv/Documents/Projects/ter/app/ports/index.tsx` (292 lines)
**Main ports management screen**

**Features:**
- Lists all listening ports on selected host
- Multi-host support with host selector chips
- Selection mode for bulk operations
- Individual and bulk process killing
- Auto-refresh with pull-to-refresh
- Empty states for no hosts/no ports
- Confirmation dialogs before killing processes

**Key Components:**
- Uses TanStack Query for data fetching and mutations
- FadeIn animations for list items
- Host selector with color-coded chips
- "Select" mode toggle for bulk operations
- Kill selected button when items are selected

**Dependencies:**
- `@tanstack/react-query` - data fetching/mutations
- `expo-router` - navigation
- Custom components: Screen, AppText, FadeIn, PortRow
- API functions: getPorts, killPorts

#### `/home/gabrielolv/Documents/Projects/ter/components/PortRow.tsx` (112 lines)
**Individual port row component**

**Features:**
- Displays port number, process name, PID
- Shows full command when available
- Selection checkbox in selection mode
- Individual kill button in normal mode
- Color-coded port badge with accent color

**Props:**
```typescript
{
  port: PortInfo;
  selected?: boolean;
  selectionMode?: boolean;
  onToggleSelect?: () => void;
  onKill?: () => void;
}
```

### 2. Agent Layer (Backend)

#### `/home/gabrielolv/Documents/Projects/ter/agent/src/ports.ts` (237 lines)
**Core port scanning and process management**

**Exports:**
- `listPorts(): Promise<PortInfo[]>` - Scan for listening ports
- `killProcesses(pids: number[]): Promise<{killed, failed}>` - Kill processes

**Implementation Details:**
- Scans ports 3000-9999 (dev range)
- Primary method: `lsof` (more reliable)
- Fallback method: `ss` (socket statistics)
- Enriches results with full command names via `ps`
- Smart command extraction (npm scripts, expo, python, node, etc.)
- SIGTERM for graceful process termination

**Port Detection:**
```bash
# Primary: lsof
lsof -i -P -n -sTCP:LISTEN

# Fallback: ss
ss -tlnp
```

**Command Extraction Patterns:**
- npm/npx/yarn/pnpm scripts
- expo commands
- Python scripts
- Node.js scripts
- tsx/ts-node executables

#### `/home/gabrielolv/Documents/Projects/ter/agent/src/http/routes/ports.ts` (35 lines)
**HTTP REST endpoints**

**Routes:**
1. `GET /ports` - List all listening ports
   - Response: `{ ports: PortInfo[] }`
   - Error handling via jsonError

2. `POST /ports/kill` - Kill processes by PID
   - Body: `{ pids: number[] }`
   - Validates PIDs (array, non-empty, valid numbers)
   - Response: `{ killed: number[], failed: {pid, error}[] }`

**Registration:**
```typescript
export function registerPortRoutes(app: Hono)
```

### 3. API Layer

#### `/home/gabrielolv/Documents/Projects/ter/lib/api.ts` (lines 264-276)
**Client-side API functions**

```typescript
export async function getPorts(host: Host): Promise<{ ports: PortInfo[] }>
export async function killPorts(
  host: Host, 
  pids: number[]
): Promise<{ killed: number[], failed: {pid, error}[] }>
```

Both use the generic `request()` helper with proper host routing.

### 4. Type Definitions

#### `/home/gabrielolv/Documents/Projects/ter/lib/types.ts` (lines 224-229)
**Shared type definition**

```typescript
export type PortInfo = {
  pid: number;        // Process ID
  port: number;       // Port number (3000-9999)
  process: string;    // Process name from lsof/ss
  command?: string;   // Full command (enriched via ps)
};
```

**Note:** This type is duplicated in `agent/src/ports.ts` (lines 4-8). Consider importing from a shared location.

### 5. Routing

#### `/home/gabrielolv/Documents/Projects/ter/app/_layout.tsx` (line 110)
**Screen registration**

```typescript
<Stack.Screen name="ports/index" />
```

Registered in the main app stack navigator.

## Architecture Map

```
[React Native UI]
    ↓
[TanStack Query] ← caching/state management
    ↓
[lib/api.ts] ← getPorts(), killPorts()
    ↓
[HTTP Request] → host:port/ports
    ↓
[agent/http/routes/ports.ts] ← REST endpoints
    ↓
[agent/ports.ts] ← listPorts(), killProcesses()
    ↓
[System Calls]
    ├─ lsof/ss → detect ports
    ├─ ps → get commands
    └─ kill → terminate processes
```

## Data Flow

### Listing Ports
1. User opens `/ports` screen
2. `useQuery` with key `['ports', hostId]` triggers
3. `getPorts(host)` calls `GET /ports` on agent
4. Agent runs `listPorts()`:
   - Executes `lsof -i -P -n -sTCP:LISTEN`
   - Parses output for ports 3000-9999
   - Enriches with `ps` commands
   - Returns sorted array
5. UI renders `PortRow` components with FadeIn animation

### Killing Processes
1. User clicks "Kill" or selects multiple + "Kill Selected"
2. Alert confirmation dialog shown
3. On confirm: `killMutation.mutate(pids)`
4. `killPorts(host, pids)` calls `POST /ports/kill`
5. Agent runs `killProcesses(pids)`:
   - Validates each PID
   - Executes `kill -15 <pid>` (SIGTERM)
   - Tracks success/failure
6. Returns `{killed, failed}` arrays
7. UI invalidates query cache to refresh
8. Shows error alert if any failures

## Features

| Feature | Status | Implementation |
|---------|--------|----------------|
| Port scanning | ✓ | lsof/ss dual approach |
| Multi-host support | ✓ | Host selector chips |
| Individual kill | ✓ | Confirmation dialog + SIGTERM |
| Bulk kill | ✓ | Selection mode + multi-select |
| Auto-refresh | ✓ | Pull-to-refresh + staleTime |
| Command enrichment | ✓ | ps parsing with smart extraction |
| Empty states | ✓ | No hosts / no ports messaging |
| Error handling | ✓ | jsonError + Alert dialogs |

## Key Implementation Details

### Port Range
- **Minimum:** 3000
- **Maximum:** 9999
- **Rationale:** Dev server range, avoids system ports

### Process Termination
- **Signal:** SIGTERM (-15)
- **Reason:** Graceful shutdown (not SIGKILL)
- **Timeout:** 5000ms per operation

### Caching Strategy
```typescript
{
  queryKey: ['ports', hostId],
  staleTime: 10_000,           // 10 seconds
  refetchOnWindowFocus: true,
}
```

### Deduplication
Ports are deduped by `${pid}:${port}` key to handle cases where a process listens on multiple interfaces (0.0.0.0, 127.0.0.1, etc.)

### Command Extraction Patterns
1. npm scripts: `npm run dev`, `npx expo start`
2. Python: `python server.py`, `python -m module`
3. Node: `node server.js`
4. TypeScript: `tsx app.ts`, `ts-node app.ts`
5. Fallback: Binary name or truncated command

## Open Questions
- Should port range be configurable per user/host?
- Add SIGKILL option for stubborn processes?
- Show network interface (0.0.0.0 vs 127.0.0.1)?
- Add port forwarding features?

## Related Files

### Documentation
- `/home/gabrielolv/Documents/Projects/ter/thoughts/handoffs/bridge-redesign/task-02-tab-navigation.md` - mentions ports in tab navigation
- `/home/gabrielolv/Documents/Projects/ter/.claude/cache/agents/scout/output-1768819842.md` - previous ports exploration

### Dependencies
- `lsof` - primary port scanner (must be installed)
- `ss` - fallback port scanner (iproute2 package)
- `ps` - command enrichment
- `kill` - process termination

## Testing Considerations
- Mock `lsof`/`ss` output for unit tests
- Test fallback from lsof → ss
- Test PID validation (negative, zero, non-integer)
- Test empty results handling
- Test concurrent kill operations
- Test error states (permission denied, process already dead)
