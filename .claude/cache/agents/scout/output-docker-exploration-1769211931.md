# Codebase Report: Docker Functionality Exploration
Generated: 2026-01-23

## Summary

The app has comprehensive Docker container management functionality spread across multiple layers:
- **Backend Agent**: Docker API via HTTP routes + WebSocket endpoints for terminal/logs
- **Frontend UI**: Dedicated tab screen + per-container detail screens
- **Hooks/State**: Live data fetching and Docker-specific hooks
- **Navigation**: Multiple screens for container management

All Docker features are currently accessed via a dedicated `/docker` tab, but the functionality is structured to support per-host filtering.

---

## Project Structure (Docker-related files)

```
ter/
├── agent/src/
│   ├── docker.ts                          # Core Docker service (exec docker CLI)
│   └── http/
│       ├── routes/docker.ts               # REST API endpoints
│       └── ws.ts                          # WebSocket handlers (/docker/exec, /docker/logs)
├── app/
│   ├── (tabs)/docker.tsx                  # Main Docker tab screen (all containers)
│   └── hosts/[id]/docker/[containerId]/
│       ├── index.tsx                      # Container detail screen
│       ├── terminal.tsx                   # Interactive shell (docker exec)
│       └── logs.tsx                       # Log streaming
├── lib/
│   ├── docker-hooks.ts                    # React hooks for Docker data
│   ├── api.ts                             # dockerContainerAction() client function
│   ├── types.ts                           # DockerContainer, DockerSnapshot types
│   └── live.tsx                           # Live updates with docker: true option
└── components/
    └── HostCard.tsx                       # Shows Docker container count badge
```

---

## Backend Agent Implementation

### 1. Docker Service (`agent/src/docker.ts`)
**Lines:** 274 lines

**Core Functions:**
- `getDockerSnapshot()` - Fetches all Docker data (containers, images, volumes, networks)
- `runDockerContainerAction(containerId, action)` - Executes container actions (start/stop/restart/pause/unpause/kill)

**Implementation Details:**
```typescript
// Uses child_process.execFile to run Docker CLI commands
await execFileAsync('docker', ['ps', '-a', '--no-trunc', '--format', '{{json .}}']);
await execFileAsync('docker', ['stats', '--no-stream', '--no-trunc', '--format', '{{json .}}']);
await execFileAsync('docker', ['images', '--no-trunc', '--format', '{{json .}}']);
await execFileAsync('docker', ['volume', 'ls', '--format', '{{json .}}']);
await execFileAsync('docker', ['network', 'ls', '--format', '{{json .}}']);
```

**Data Enrichment:**
- Parses Docker compose labels (`com.docker.compose.project`, `com.docker.compose.service`)
- Combines `docker ps` with `docker stats` for CPU/memory metrics
- Parses memory usage strings into bytes
- 5-second cache with in-flight request deduplication

**Container Data Structure:**
```typescript
type DockerContainer = {
  id: string;
  name: string;
  image: string;
  status?: string;              // "Up 2 hours"
  state?: string;               // "running" | "exited"
  ports?: string;               // "0.0.0.0:8080->80/tcp"
  createdAt?: string;
  runningFor?: string;
  cpuPercent?: number;          // From docker stats
  memoryPercent?: number;
  memoryUsage?: string;         // "256MB / 2GB"
  memoryUsedBytes?: number;
  memoryLimitBytes?: number;
  netIO?: string;
  blockIO?: string;
  pids?: number;
  labels?: Record<string, string>;
  composeProject?: string;      // Extracted from labels
  composeService?: string;
};
```

### 2. HTTP Routes (`agent/src/http/routes/docker.ts`)
**Lines:** 30 lines

**Endpoints:**
| Method | Path | Purpose | Handler |
|--------|------|---------|---------|
| GET | `/docker` | Get all Docker data | `getDockerSnapshot()` |
| POST | `/docker/containers/:id/:action` | Execute container action | `runDockerContainerAction()` |

**Actions Supported:** `start`, `stop`, `restart`, `pause`, `unpause`, `kill`

### 3. WebSocket Endpoints (`agent/src/http/ws.ts`)
**Lines:** 421 lines total

**WebSocket Paths:**
| Path | Purpose | Implementation |
|------|---------|----------------|
| `/docker/exec` | Interactive shell in container | `docker exec -it <container> <shell>` via node-pty |
| `/docker/logs` | Stream container logs | `docker logs -f --tail N <container>` via child_process |

**Docker Exec Implementation (lines 271-297):**
```typescript
dockerWss.on('connection', (ws, req) => {
  const container = url.searchParams.get('container'); // Container ID/name
  const shell = url.searchParams.get('shell') || 'sh'; // bash, sh, zsh, etc.
  const cols = parseDimension(url.searchParams.get('cols'), 80);
  const rows = parseDimension(url.searchParams.get('rows'), 24);
  
  // Spawn interactive PTY
  const term = pty.spawn('docker', ['exec', '-it', container, shell], {
    name: 'xterm-256color',
    cols, rows,
    env: { TERM: 'xterm-256color', COLORTERM: 'truecolor' }
  });
  
  attachPtyBridge(ws, term, 'exec ended'); // Bidirectional data flow
});
```

**Docker Logs Implementation (lines 299-364):**
```typescript
logsWss.on('connection', (ws, req) => {
  const container = url.searchParams.get('container');
  const follow = url.searchParams.get('follow') !== '0'; // Default: true
  const tail = url.searchParams.get('tail') || '100';    // Default: 100 lines
  const timestamps = url.searchParams.get('timestamps') === '1';
  
  // Build docker logs command
  const args = ['logs'];
  if (follow) args.push('-f');
  if (timestamps) args.push('-t');
  args.push('--tail', tail, container);
  
  const proc = spawn('docker', args);
  proc.stdout.on('data', (data) => ws.send(data));
  proc.stderr.on('data', (data) => ws.send(data));
});
```

**Flow Control:**
- Uses high/low watermark buffering (128KB/64KB)
- PTY pause/resume for backpressure
- Client ACK messages to track in-flight bytes

---

## Frontend UI Screens

### 1. Docker Tab Screen (`app/(tabs)/docker.tsx`)
**Lines:** 561 lines
**Route:** `/(tabs)/docker`

**Features:**
- Lists ALL Docker containers across ALL hosts
- Groups containers by Docker Compose project
- Shows standalone containers separately
- Live data updates via `useHostsLive(hosts, { docker: true })`
- Pull-to-refresh support
- Summary stats (running/stopped/hosts count)

**Container Grouping Logic:**
```typescript
type ComposeGroup = {
  key: string;              // "{hostId}:project-name" or "{hostId}:standalone"
  title: string;            // Project name or "Standalone"
  hostName: string;
  hostColor: string;
  containers: ContainerWithHost[];
  running: number;
  stopped: number;
  isStandalone: boolean;
};

// Groups containers by compose project + host
// Sorts: compose projects first, then standalone
// Within groups: running containers first, then alphabetical
```

**Container Row Actions:**
- Tap container → Navigate to `/hosts/{hostId}/docker/{containerId}`
- Terminal button → Same navigation
- Start/Stop button → Inline action with confirmation alert

**UI States:**
- No hosts configured → "Add Host" CTA
- Loading → Skeleton cards
- No Docker available → "No Docker available" message
- Data loaded → Grouped container list

**Host Filtering:**
- Accepts `?hostId=` query param (not currently used in UI)
- Filters `composeGroups` if `params.hostId` is present

### 2. Container Detail Screen (`app/hosts/[id]/docker/[containerId]/index.tsx`)
**Lines:** 299 lines
**Route:** `/hosts/[hostId]/docker/[containerId]`

**Sections:**

**Header:**
- Back button
- Container name + image
- "Logs" button → Navigate to `logs.tsx`
- "Terminal" button → Navigate to `terminal.tsx`

**Status Card:**
- Status (running/exited) with color coding
- CPU usage percentage
- Memory usage (formatted)

**Controls Section:**
- Start/Stop button (conditional based on state)
- Restart button
- Pause/Unpause button (conditional)
- Kill button (red, destructive style)

**Details Section:**
- Container ID
- Image name
- Ports mapping
- Running time

**Live Updates:**
```typescript
const { state, refresh } = useHostLive(host, { docker: true, enabled: isFocused });
const docker = state?.docker;
const container = docker?.containers.find(c => c.id === containerId);
```

### 3. Container Terminal (`app/hosts/[id]/docker/[containerId]/terminal.tsx`)
**Route:** `/hosts/[hostId]/docker/[containerId]/terminal`

**Implementation:**
- Uses `TerminalWebView` component (xterm.js in WebView)
- Connects to WebSocket: `ws://{host}/docker/exec?container={id}&shell=bash`
- Full PTY support (resize, input, ANSI colors)
- Terminal profile: `"docker"` (affects font size, settings)

### 4. Container Logs (`app/hosts/[id]/docker/[containerId]/logs.tsx`)
**Route:** `/hosts/[hostId]/docker/[containerId]/logs`

**Implementation:**
- Uses `TerminalWebView` component (read-only xterm.js)
- Connects to WebSocket: `ws://{host}/docker/logs?container={id}&follow=1&tail=100`
- Read-only mode (no input)
- Terminal profile: `"logs"` (affects font size, settings)

---

## Frontend Hooks & State

### 1. Docker Hooks (`lib/docker-hooks.ts`)
**Lines:** 93 lines

**Main Hook: `useAllDocker(options?)`**

Returns:
```typescript
{
  containers: ContainerWithHost[];  // All containers with host info attached
  running: ContainerWithHost[];     // Filtered running containers
  stopped: ContainerWithHost[];     // Filtered stopped containers
  refreshAll: () => void;           // Refresh all hosts
  refreshHost: (hostId) => void;    // Refresh single host
  hosts: Host[];                    // All hosts
  isLoading: boolean;               // True if any host is checking
  hasDocker: boolean;               // True if any host has Docker available
}

type ContainerWithHost = DockerContainer & {
  host: Host;
  hostStatus: HostStatus;  // 'online' | 'offline' | 'checking'
};
```

**Implementation:**
```typescript
export function useAllDocker(options?: { enabled?: boolean }) {
  const { hosts } = useStore();
  const { stateMap, refreshAll, refreshHost } = useHostsLive(hosts, { 
    docker: true, 
    enabled: options?.enabled 
  });

  // Flatten all containers from all hosts
  const containers = useMemo(() => {
    const all: ContainerWithHost[] = [];
    hosts.forEach((host) => {
      const hostState = stateMap[host.id];
      const dockerContainers = hostState?.docker?.containers ?? [];
      dockerContainers.forEach((container) => {
        all.push({ ...container, host, hostStatus: hostState?.status ?? 'checking' });
      });
    });
    return all;
  }, [hosts, stateMap]);

  // ... running/stopped filters ...
}
```

**Utility Functions:**
- `isContainerRunning(container)` - Checks state/status fields
- `formatBytes(bytes)` - Converts bytes to human-readable (KB, MB, GB)

### 2. Live Updates Hook (`lib/live.tsx`)

**Docker Integration:**
```typescript
// Subscribe to Docker updates
useHostsLive(hosts, { docker: true, sessions: false, enabled: true });

// WebSocket /events endpoint sends:
{
  type: 'snapshot',
  payload: {
    status: 'online',
    docker: {
      available: true,
      containers: [...],
      images: [...],
      volumes: [...],
      networks: [...]
    }
  }
}
```

**Polling Behavior:**
- Initial snapshot on connection
- Updates every 3 seconds (configurable)
- Includes Docker data if `docker: true` option is set

### 3. API Client (`lib/api.ts`)

**Docker Function:**
```typescript
export async function dockerContainerAction(
  host: Host,
  containerId: string,
  action: string
): Promise<void> {
  return request(host, `/docker/containers/${encodeURIComponent(containerId)}/${action}`, {
    method: 'POST'
  });
}
```

---

## Navigation Flow

### Current Flow (Via Docker Tab)

```
(tabs)/docker
  └─ All containers grouped by compose project
     └─ Tap container
        └─ /hosts/[id]/docker/[containerId]
           ├─ Tap "Terminal" → /hosts/[id]/docker/[containerId]/terminal
           ├─ Tap "Logs" → /hosts/[id]/docker/[containerId]/logs
           └─ Action buttons (start/stop/restart/pause/kill)
```

### Potential Flow (Via Host Detail)

```
/hosts/[id]
  └─ Docker section (currently removed in task-09-host-detail.md)
     └─ "Docker" header button → /(tabs)/docker?hostId={id}
     
     OR (future):
     └─ Docker containers list → /hosts/[id]/docker/[containerId]
```

**Note:** According to `thoughts/handoffs/bridge-redesign/task-09-host-detail.md`:
- Docker preview section was removed from host detail screen
- "Docker" header button navigates to Docker tab with host filter
- Host detail no longer shows Docker container list inline

---

## Components Using Docker

### HostCard (`components/HostCard.tsx`)

**Docker Integration:**
```typescript
// Fetches Docker data
const { stateMap } = useHostsLive(hosts, { docker: true });

// Calculates container counts
const containerCounts = useMemo(() => {
  const counts: Record<string, { running: number; stopped: number }> = {};
  hosts.forEach((host) => {
    const state = stateMap[host.id];
    const containers = state?.docker?.containers ?? [];
    counts[host.id] = {
      running: containers.filter(c => isRunning(c)).length,
      stopped: containers.filter(c => !isRunning(c)).length
    };
  });
  return counts;
}, [hosts, stateMap]);
```

**UI Elements:**
- Docker icon badge (Box icon from lucide-react-native)
- Container count display
- Color: Blue when online, muted when offline
- Shows running + stopped counts

**Actions:**
- `onDocker` callback → Navigate to `/hosts/{hostId}/docker` (future route)
- Currently navigates to Docker tab with filter: `/(tabs)/docker?hostId={id}`

---

## Data Types (`lib/types.ts`)

```typescript
export type DockerContainer = {
  id: string;
  name: string;
  image: string;
  status?: string;              // "Up 2 hours"
  state?: string;               // "running" | "exited" | "paused"
  ports?: string;               // "0.0.0.0:8080->80/tcp"
  createdAt?: string;
  runningFor?: string;
  cpuPercent?: number;          // 0-100
  memoryPercent?: number;       // 0-100
  memoryUsage?: string;         // "256MB / 2GB"
  memoryUsedBytes?: number;
  memoryLimitBytes?: number;
  netIO?: string;               // "1.2MB / 3.4MB"
  blockIO?: string;             // "0B / 128KB"
  pids?: number;
  labels?: Record<string, string>;
  composeProject?: string;      // From label: com.docker.compose.project
  composeService?: string;      // From label: com.docker.compose.service
};

export type DockerImage = {
  id: string;
  repository: string;
  tag: string;
  size?: string;
  createdAt?: string;
  createdSince?: string;
};

export type DockerVolume = {
  name: string;
  driver?: string;
  scope?: string;
};

export type DockerNetwork = {
  id: string;
  name: string;
  driver?: string;
  scope?: string;
};

export type DockerSnapshot = {
  available: boolean;
  error?: string;               // "docker not installed" | "permission denied"
  containers: DockerContainer[];
  images: DockerImage[];
  volumes: DockerVolume[];
  networks: DockerNetwork[];
};
```

---

## Key Features to Move to Host Detail

Based on this exploration, here's what can be moved to host detail pages:

### 1. Container List Section
- **Current Location:** `app/(tabs)/docker.tsx` (aggregates all hosts)
- **Move To:** Host detail page as a dedicated section
- **Implementation:** Filter `useAllDocker()` by single hostId

### 2. Quick Actions
- **Current:** Available on docker tab + container detail screen
- **Move To:** Host detail inline actions
- **Actions:** Start/Stop containers directly from host detail

### 3. Docker Status Badge
- **Current:** Already on HostCard
- **Enhance:** Show more details in host detail (available/unavailable, version)

### 4. Navigation Pattern
- **Current:** Docker tab → Container detail → Terminal/Logs
- **New:** Host detail → Docker section → Container detail → Terminal/Logs
- **Keep:** Docker tab for cross-host overview

---

## Migration Strategy

### Option A: Duplicate Views
- Keep Docker tab for cross-host view
- Add Docker section to host detail for single-host view
- Share components between both screens

### Option B: Remove Docker Tab
- Move all Docker functionality to host detail pages
- Remove `app/(tabs)/docker.tsx`
- Lose cross-host overview

### Option C: Hybrid (Recommended)
- Host detail shows Docker containers for that host
- Docker tab remains for cross-host management
- Both use same hooks/components
- "View all Docker" button on host detail links to tab with filter

---

## File Locations Summary

| Component | Path | Lines | Purpose |
|-----------|------|-------|---------|
| **Agent Docker Service** | `/home/gabrielolv/Documents/Projects/ter/agent/src/docker.ts` | 274 | Execute docker CLI commands |
| **Agent HTTP Routes** | `/home/gabrielolv/Documents/Projects/ter/agent/src/http/routes/docker.ts` | 30 | REST endpoints |
| **Agent WebSocket** | `/home/gabrielolv/Documents/Projects/ter/agent/src/http/ws.ts` | 421 | /docker/exec + /docker/logs handlers |
| **Docker Tab Screen** | `/home/gabrielolv/Documents/Projects/ter/app/(tabs)/docker.tsx` | 561 | Main Docker UI (all hosts) |
| **Container Detail** | `/home/gabrielolv/Documents/Projects/ter/app/hosts/[id]/docker/[containerId]/index.tsx` | 299 | Container management UI |
| **Container Terminal** | `/home/gabrielolv/Documents/Projects/ter/app/hosts/[id]/docker/[containerId]/terminal.tsx` | - | Interactive shell (xterm.js) |
| **Container Logs** | `/home/gabrielolv/Documents/Projects/ter/app/hosts/[id]/docker/[containerId]/logs.tsx` | - | Log streaming (xterm.js) |
| **Docker Hooks** | `/home/gabrielolv/Documents/Projects/ter/lib/docker-hooks.ts` | 93 | React hooks for Docker data |
| **API Client** | `/home/gabrielolv/Documents/Projects/ter/lib/api.ts` | - | dockerContainerAction() |
| **Type Definitions** | `/home/gabrielolv/Documents/Projects/ter/lib/types.ts` | - | DockerContainer, DockerSnapshot |
| **Live Updates** | `/home/gabrielolv/Documents/Projects/ter/lib/live.tsx` | - | WebSocket /events integration |

---

## Open Questions

1. Should Docker tab remain after moving to host detail?
2. Should cross-host Docker management be preserved?
3. Should Docker compose groups be shown per-host or globally?
4. Should Docker images/volumes/networks be shown in host detail?
5. Should container actions (start/stop) be available inline on host detail?

---

## Next Steps

1. Review current host detail page structure
2. Design Docker section layout for host detail
3. Decide on navigation: keep tab vs. remove tab
4. Implement filtered Docker list component
5. Add inline actions to host detail
6. Update navigation flows
