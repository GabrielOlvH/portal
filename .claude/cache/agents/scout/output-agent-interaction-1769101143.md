# Codebase Report: Agent-App Interaction & Update Mechanisms
Generated: 2026-01-22

## Summary

The mobile app (React Native) communicates with a Node.js agent server using both HTTP REST APIs and WebSocket connections. The app includes a built-in update mechanism that checks for agent updates via git and can trigger remote updates. The architecture is clean and well-separated.

## Project Structure

```
ter/
├── app/                      # React Native mobile app (Expo)
│   ├── (tabs)/
│   │   ├── hosts.tsx        # Main hosts screen with update UI
│   │   └── index.tsx        # Home/dashboard
│   ├── hosts/[id]/          # Host detail screens
│   └── session/[hostId]/    # Terminal screens
├── lib/                      # Shared app logic
│   ├── api.ts               # HTTP API client
│   ├── live.tsx             # WebSocket state management
│   ├── store.tsx            # App-level state (hosts, preferences)
│   └── types.ts             # Shared types
├── components/
│   └── HostCard.tsx         # Host card with update status display
└── agent/                   # Node.js backend server
    └── src/
        ├── http/
        │   ├── app.ts       # Hono HTTP app setup
        │   ├── ws.ts        # WebSocket handlers
        │   └── routes/
        │       ├── core.ts          # /health, /ping, /host, /usage
        │       ├── update.ts        # /update/check, /update/apply
        │       ├── sessions.ts      # Tmux session management
        │       ├── docker.ts        # Docker endpoints
        │       ├── ports.ts         # Port forwarding
        │       ├── tunnels.ts       # SSH tunnel management
        │       ├── ai-sessions.ts   # AI session management
        │       ├── cli-assets.ts    # CLI binary distribution
        │       ├── copilot.ts       # GitHub Copilot integration
        │       ├── files.ts         # File operations
        │       └── notifications.ts # Push notification registration
        ├── config.ts        # Environment configuration
        └── server.ts        # Server initialization
```

## Questions Answered

### Q1: How does the app connect to the agent?

**Connection Methods:** Dual protocol - HTTP REST + WebSocket

#### HTTP REST API
**Location:** `/home/gabrielolv/Documents/Projects/ter/lib/api.ts`

**Base Pattern:**
```typescript
async function request<T>(
  host: Host,
  path: string,
  options?: { method?: string; body?: string },
  timeout = 10000
): Promise<T> {
  const baseUrl = normalizeBaseUrl(host.baseUrl); // e.g., "http://192.168.1.10:4020"
  const url = `${baseUrl}${path}`;
  
  const response = await fetch(url, {
    method: options?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(host.authToken && { 'x-api-key': host.authToken }),
    },
    body: options?.body,
    signal: AbortSignal.timeout(timeout),
  });
  
  return response.json();
}
```

**Host Definition:**
```typescript
// lib/types.ts
export type Host = {
  id: string;              // UUID
  name: string;            // User-friendly name
  baseUrl: string;         // e.g., "http://192.168.1.10:4020"
  authToken?: string;      // Optional bearer token
  color?: ColorValue;      // UI accent color
  lastSeen?: number;       // Timestamp
};
```

**Authentication:**
- Token-based via `x-api-key` header (optional)
- Agent checks `TMUX_AGENT_TOKEN` env var
- If set, all requests must include matching token

#### WebSocket Connections

**Location:** `/home/gabrielolv/Documents/Projects/ter/lib/live.tsx`

**Three WebSocket Endpoints:**

| Path | Purpose | Message Format |
|------|---------|----------------|
| `/events` | Live host state updates | JSON snapshots (sessions, docker, host info) |
| `/ws` | Tmux terminal I/O | Binary PTY data |
| `/docker/exec` | Docker container shell | Binary PTY data |

**Events WebSocket (Live Updates):**
```typescript
// Build WebSocket URL from host
function buildEventsUrl(host: Host, options: LiveOptions): string {
  const base = new URL(host.baseUrl);
  const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams();
  
  if (options.sessions) params.set('sessions', '1');
  if (options.preview) params.set('preview', '1');
  if (options.insights) params.set('insights', '1');
  if (options.host) params.set('host', '1');
  if (options.docker) params.set('docker', '1');
  if (host.authToken) params.set('token', host.authToken);
  
  return `${protocol}//${base.host}/events?${params}`;
}

// Connection management
const socket = new WebSocket(url);

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'snapshot') {
    // Update local state with sessions, docker, host info
    updateState(hostId, (prev) => ({
      ...prev,
      status: 'online',
      sessions: message.sessions ?? prev.sessions,
      hostInfo: message.host ?? prev.hostInfo,
      docker: message.docker ?? prev.docker,
      lastUpdate: Date.now(),
    }));
  }
};
```

**Terminal WebSocket:**
- Embedded in WebView with xterm.js
- Binary protocol (raw PTY bytes)
- Bidirectional: keyboard input → PTY, PTY output → terminal
- See `/home/gabrielolv/Documents/Projects/ter/lib/terminal-html.ts`

---

### Q2: Any existing update mechanisms or version checking?

**YES - Full git-based update system**

**Location:** `/home/gabrielolv/Documents/Projects/ter/agent/src/http/routes/update.ts`

#### Update Check Endpoint

**Route:** `GET /update/check`

**Implementation:**
```typescript
app.get('/update/check', async (c) => {
  const installDir = resolveInstallDir(); // Finds .git directory
  
  // Fetch latest from remote
  execSync('git fetch origin main --quiet 2>/dev/null || git fetch origin master --quiet 2>/dev/null', {
    cwd: installDir,
  });
  
  // Compare local vs remote
  const local = execSync('git rev-parse HEAD', { cwd: installDir }).trim();
  const remote = execSync('git rev-parse --verify origin/main 2>/dev/null || git rev-parse --verify origin/master', {
    cwd: installDir,
  }).trim();
  
  const updateAvailable = local !== remote;
  
  let changes: string[] = [];
  if (updateAvailable) {
    const diff = execSync(`git log --oneline ${local}..${remote}`, {
      cwd: installDir,
    }).trim();
    changes = diff.split('\n').filter(Boolean);
  }
  
  return c.json({
    updateAvailable,
    currentVersion: local.slice(0, 7),    // Short commit hash
    latestVersion: remote.slice(0, 7),
    changes,                               // Array of commit messages
  });
});
```

**Response Type:**
```typescript
export type UpdateStatus = {
  updateAvailable: boolean;
  currentVersion: string;    // e.g., "53ce3f5"
  latestVersion: string;     // e.g., "48f797c"
  changes: string[];         // ["commit msg 1", "commit msg 2"]
  error?: string;
};
```

#### Update Apply Endpoint

**Route:** `POST /update/apply`

**Implementation:**
```typescript
app.post('/update/apply', async (c) => {
  const installDir = resolveInstallDir();
  const updateScript = path.join(installDir, 'agent', 'update.sh');
  
  if (!existsSync(updateScript)) {
    throw new Error(`Update script not found at ${updateScript}`);
  }
  
  // Run update script in background (it will restart the service)
  const child = spawn('bash', [updateScript, installDir], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  
  return c.json({ 
    success: true, 
    message: 'Update started. Service will restart.' 
  });
});
```

**Update Script:** `/home/gabrielolv/Documents/Projects/ter/agent/update.sh`
- Pulls latest code with `git pull`
- Runs `npm install` if needed
- Restarts the agent service
- Handles stashing local changes

---

### Q3: How does the app use the update mechanism?

**Location:** `/home/gabrielolv/Documents/Projects/ter/app/(tabs)/hosts.tsx`

#### Periodic Update Checks

```typescript
// Check for updates every 60 seconds for online hosts
useEffect(() => {
  if (onlineHosts.length === 0) {
    setUpdateStatusMap({});
    return;
  }
  
  const checkUpdates = async () => {
    const next: Record<string, UpdateStatus> = {};
    await Promise.all(
      onlineHosts.map(async (host) => {
        try {
          const status = await checkForUpdate(host);
          if (status.updateAvailable) {
            next[host.id] = status;
          }
        } catch {
          // Ignore errors, host might not support updates
        }
      })
    );
    setUpdateStatusMap(next);
  };
  
  checkUpdates();
  const interval = setInterval(checkUpdates, 60000); // Every 60s
  return () => clearInterval(interval);
}, [onlineHosts, isFocused]);
```

#### Update Trigger

```typescript
const handleUpdate = useCallback(
  async (hostId: string) => {
    const host = hosts.find((item) => item.id === hostId);
    if (!host || updatingHosts[hostId]) return;
    
    setUpdatingHosts((prev) => ({ ...prev, [hostId]: true }));
    
    try {
      await applyUpdate(host);  // POST /update/apply
      Alert.alert('Update Started', 'The agent is updating and will restart.');
      
      // Remove from update status map
      setUpdateStatusMap((prev) => {
        const next = { ...prev };
        delete next[hostId];
        return next;
      });
    } catch (err) {
      Alert.alert('Update Failed', err instanceof Error ? err.message : 'Could not apply update');
    } finally {
      setUpdatingHosts((prev) => ({ ...prev, [hostId]: false }));
    }
  },
  [hosts, updatingHosts]
);
```

#### UI Display

**Location:** `/home/gabrielolv/Documents/Projects/ter/components/HostCard.tsx`

```typescript
// Update status props
updateStatus?: UpdateStatus;
isUpdating?: boolean;

// Determine if update should show
const updateAvailable = Boolean(updateStatus?.updateAvailable);
const showUpdate = updateAvailable || Boolean(isUpdating);
const updateLabel = getUpdateLabel(Boolean(isUpdating), updateStatus);
const updateDisabled = !isOnline || Boolean(isUpdating);

// Update label logic
function getUpdateLabel(isUpdating: boolean, updateStatus?: UpdateStatus): string {
  if (isUpdating) return 'Updating...';
  if (updateStatus?.latestVersion) {
    return `Update available (${updateStatus.latestVersion})`;
  }
  return 'Update available';
}

// Rendered UI
{showUpdate && (
  <View style={styles.updateRow}>
    <Download size={14} color={updateAccent} />
    <AppText variant="mono" style={[styles.updateText, { color: updateAccent }]}>
      {updateLabel}
    </AppText>
  </View>
)}

// Update button
<Pressable
  style={[styles.actionButton, updateDisabled && styles.actionButtonDisabled]}
  onPress={onUpdate}
  disabled={updateDisabled}
>
  <Download size={16} color={updateAccent} />
  <AppText style={{ color: updateAccent }}>
    {isUpdating ? 'Updating...' : 'Update'}
  </AppText>
</Pressable>
```

---

### Q4: API endpoints the agent exposes

**Server Setup:** `/home/gabrielolv/Documents/Projects/ter/agent/src/http/app.ts`

```typescript
export function buildApp() {
  const app = new Hono();
  
  // CORS for all origins
  app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'] }));
  
  // Optional token authentication
  app.use('*', async (c, next) => {
    if (!TOKEN) return next();
    const header = c.req.header('authorization') || c.req.header('x-api-key') || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (token !== TOKEN) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    return next();
  });
  
  // Register all route modules
  registerAiSessionRoutes(app);
  registerCliAssetRoutes(app);
  registerCoreRoutes(app);
  registerDockerRoutes(app);
  registerFileRoutes(app);
  registerNotificationRoutes(app);
  registerPortRoutes(app);
  registerSessionRoutes(app);
  registerTunnelRoutes(app);
  registerUpdateRoutes(app);
  registerCopilotRoutes(app);
  
  return app;
}
```

#### Complete API Surface

**Core Endpoints** (`routes/core.ts`):
- `GET /health` - Health check with tmux version
- `GET /ping` - Latency check with event loop lag
- `GET /host` - Host system information (CPU, RAM, uptime, platform)
- `GET /usage` - Current resource usage snapshot

**Session Management** (`routes/sessions.ts`):
- `GET /sessions` - List all tmux sessions
- `POST /sessions` - Create new tmux session
- `DELETE /sessions/:name` - Kill tmux session
- `POST /sessions/:name/attach` - Attach to session
- `POST /sessions/:name/send-keys` - Send keys to session

**Update Management** (`routes/update.ts`):
- `GET /update/check` - Check for git updates
- `POST /update/apply` - Apply update and restart

**Docker Operations** (`routes/docker.ts`):
- `GET /docker` - List containers and images
- `POST /docker/exec` - Execute command in container (returns exec ID)
- `DELETE /docker/exec/:id` - Stop running exec

**Port Forwarding** (`routes/ports.ts`):
- `GET /ports` - List active port forwards
- `POST /ports` - Create new port forward
- `DELETE /ports/:id` - Stop port forward

**Tunnel Management** (`routes/tunnels.ts`):
- `GET /tunnels` - List active SSH tunnels
- `POST /tunnels` - Create SSH tunnel
- `DELETE /tunnels/:id` - Stop SSH tunnel

**File Operations** (`routes/files.ts`):
- `GET /files` - List directory contents
- `POST /files` - Create file/directory
- `DELETE /files` - Delete file/directory
- `POST /upload` - Upload base64 file

**AI Session Management** (`routes/ai-sessions.ts`):
- `GET /ai-sessions` - List Claude Code sessions
- `GET /ai-sessions/:name` - Get session details
- `POST /ai-sessions/:name/attach` - Attach to AI session
- `DELETE /ai-sessions/:name` - Kill AI session

**CLI Asset Distribution** (`routes/cli-assets.ts`):
- `GET /cli-assets` - List available CLI binaries
- `POST /cli-assets/install` - Install CLI tool
- `GET /cli-assets/:name/download` - Download binary

**Notifications** (`routes/notifications.ts`):
- `POST /notifications/register` - Register Expo push token
- `DELETE /notifications/unregister` - Unregister device

**Copilot Integration** (`routes/copilot.ts`):
- `POST /copilot/completions` - Get code completions
- `POST /copilot/explain` - Get code explanations

**WebSocket Endpoints** (`ws.ts`):
- `WS /ws?session=<name>&cols=<num>&rows=<num>&token=<token>` - Terminal I/O
- `WS /docker/exec?id=<execId>&token=<token>` - Docker exec I/O
- `WS /events?sessions=1&host=1&docker=1&token=<token>` - Live state updates

---

### Q5: Configuration/settings related to the agent

**Agent Configuration:** `/home/gabrielolv/Documents/Projects/ter/agent/src/config.ts`

```typescript
export const PORT = Number(process.env.TMUX_AGENT_PORT || 4020);
export const HOST_LABEL = process.env.TMUX_AGENT_HOST || os.hostname();
export const TOKEN = process.env.TMUX_AGENT_TOKEN;  // Optional auth
export const SOCKET = process.env.TMUX_AGENT_SOCKET; // Custom tmux socket path
export const USAGE_POLL_INTERVAL = Number(process.env.TMUX_AGENT_USAGE_POLL_MS || 60000);
export const MAX_TOKEN_FILES = Number(process.env.TMUX_AGENT_TOKEN_FILES || 200);
export const TOKEN_POLL_INTERVAL = Number(process.env.TMUX_AGENT_TOKEN_POLL_MS || 180000);
export const IDLE_STOP_MS = Number(process.env.TMUX_AGENT_IDLE_STOP_MS || 2000);
export const NOTIFICATION_POLL_INTERVAL = Number(process.env.TMUX_AGENT_NOTIFICATION_POLL_MS || 15000);
export const CLAUDE_PROBE_DIR = path.join(os.homedir(), '.tmux-agent', 'claude-probe');
```

**Environment Variables:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `TMUX_AGENT_PORT` | 4020 | HTTP/WS server port |
| `TMUX_AGENT_HOST` | hostname | Host display label |
| `TMUX_AGENT_TOKEN` | (none) | Optional auth token |
| `TMUX_AGENT_SOCKET` | (default) | Custom tmux socket |
| `BRIDGE_INSTALL_DIR` | `~/.bridge-agent` | Installation directory |

**App Configuration:** `/home/gabrielolv/Documents/Projects/ter/lib/store.tsx`

App stores configuration locally using AsyncStorage:

```typescript
export type AppPreferences = {
  usageCards: {
    claude: boolean;
    codex: boolean;
    copilot: boolean;
  };
  theme: 'light' | 'dark' | 'system';
  notifications: {
    pushEnabled: boolean;
    liveEnabled: boolean;
  };
  terminal: {
    fontFamily: 'JetBrains Mono' | 'Fira Code' | 'Source Code Pro' | 'SF Mono' | 'Menlo';
    fontSize: number;
  };
};
```

**Host Storage:**
- Hosts are persisted to AsyncStorage
- Key: `@ter-hosts`
- Format: JSON array of Host objects

---

### Q6: Any existing installation or setup code?

**Installation Scripts:**

| File | Purpose |
|------|---------|
| `/home/gabrielolv/Documents/Projects/ter/agent/install.sh` | Initial agent installation |
| `/home/gabrielolv/Documents/Projects/ter/agent/update.sh` | Update existing installation |
| `/home/gabrielolv/Documents/Projects/ter/agent/uninstall.sh` | Remove agent |

**Install Script Workflow:**
1. Detects OS (Linux/macOS)
2. Checks for dependencies (tmux, git, node)
3. Clones repo to `~/.bridge-agent`
4. Runs `npm install` in agent directory
5. Creates systemd service (Linux) or launchd plist (macOS)
6. Starts service on boot

**Update Script Workflow:**
1. Finds installation directory (via `$BRIDGE_INSTALL_DIR` or `.git` search)
2. Stashes local changes with `git stash push -m "auto-update stash"`
3. Pulls latest code with `git pull origin main`
4. Runs `npm install` if package.json changed
5. Restarts service (systemd/launchd/rc-service)

**No App-Side Installation:**
- App does not install the agent
- App expects agent to be pre-installed on hosts
- Discovery mechanism: Network scan on port 4020
- Manual setup: User enters IP/port in "Add Host" form

**Discovery Code:** `/home/gabrielolv/Documents/Projects/ter/lib/discovery.ts`

```typescript
// Scan local network for agents
export async function discoverHosts(
  subnet: string,   // e.g., "192.168.1"
  port = 4020,
  timeoutMs = 1000
): Promise<DiscoveredHost[]> {
  const ips = Array.from({ length: 255 }, (_, i) => `${subnet}.${i + 1}`);
  
  const results = await Promise.all(
    ips.map(async (ip) => {
      const baseUrl = `http://${ip}:${port}`;
      const probe = await probeHealth(baseUrl, undefined, timeoutMs);
      
      if (probe.status === 'ok') {
        return {
          baseUrl,
          hostname: probe.hostname,
          platform: probe.platform,
        };
      }
      return null;
    })
  );
  
  return results.filter(Boolean);
}
```

---

## Architecture Map

```
┌─────────────────────────────────────────────────────────────┐
│                      Mobile App (Expo)                      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Screens    │  │ Components   │  │   Lib        │     │
│  │              │  │              │  │              │     │
│  │ • hosts.tsx  │  │ • HostCard   │  │ • api.ts     │     │
│  │ • index.tsx  │  │ • Terminal   │  │ • live.tsx   │     │
│  │ • more.tsx   │  │ • LaunchSheet│  │ • store.tsx  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                  │                  │             │
│         └──────────────────┴──────────────────┘             │
│                            │                                │
└────────────────────────────┼────────────────────────────────┘
                             │
                             │ HTTP REST + WebSocket
                             │ Port 4020 (default)
                             │
┌────────────────────────────┼────────────────────────────────┐
│                     Agent Server (Node.js)                  │
│                            │                                │
│  ┌─────────────────────────┴────────────────────────┐      │
│  │            Hono HTTP Server + WS                 │      │
│  │  • CORS enabled                                  │      │
│  │  • Optional token auth                           │      │
│  └───────────────────┬──────────────────────────────┘      │
│                      │                                      │
│  ┌───────────────────┴─────────────────┐                   │
│  │         Route Handlers              │                   │
│  │                                     │                   │
│  │  ┌──────────────┐  ┌─────────────┐ │                   │
│  │  │ Core Routes  │  │Update Routes│ │                   │
│  │  │ • /health    │  │ • /check    │ │                   │
│  │  │ • /ping      │  │ • /apply    │ │                   │
│  │  │ • /host      │  └─────────────┘ │                   │
│  │  │ • /usage     │                  │                   │
│  │  └──────────────┘                  │                   │
│  │                                     │                   │
│  │  ┌──────────────┐  ┌─────────────┐ │                   │
│  │  │Session Routes│  │Docker Routes│ │                   │
│  │  │ • GET /sess  │  │ • GET /dock │ │                   │
│  │  │ • POST /sess │  │ • POST /exec│ │                   │
│  │  │ • DELETE     │  │ • DELETE    │ │                   │
│  │  └──────────────┘  └─────────────┘ │                   │
│  │                                     │                   │
│  │  [+ 7 more route modules]           │                   │
│  └─────────────────────────────────────┘                   │
│                      │                                      │
│  ┌───────────────────┴─────────────────┐                   │
│  │      WebSocket Handlers             │                   │
│  │  • /ws (terminal)                   │                   │
│  │  • /docker/exec (container shell)   │                   │
│  │  • /events (live updates)           │                   │
│  └─────────────────────────────────────┘                   │
│                      │                                      │
│  ┌───────────────────┴─────────────────┐                   │
│  │         System Integration          │                   │
│  │  • Tmux (sessions)                  │                   │
│  │  • Docker (containers)              │                   │
│  │  • Git (updates)                    │                   │
│  │  • node-pty (terminal)              │                   │
│  └─────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose | Entry Points |
|------|---------|--------------|
| `/home/gabrielolv/Documents/Projects/ter/lib/api.ts` | HTTP API client | `request()`, `checkForUpdate()`, `applyUpdate()` |
| `/home/gabrielolv/Documents/Projects/ter/lib/live.tsx` | WebSocket state | `useHostsLive()`, `buildEventsUrl()` |
| `/home/gabrielolv/Documents/Projects/ter/lib/store.tsx` | App state | `useAppStore()`, `hosts`, `preferences` |
| `/home/gabrielolv/Documents/Projects/ter/agent/src/http/app.ts` | HTTP server | `buildApp()` |
| `/home/gabrielolv/Documents/Projects/ter/agent/src/http/ws.ts` | WebSocket servers | `attachWebSocketServers()` |
| `/home/gabrielolv/Documents/Projects/ter/agent/src/http/routes/update.ts` | Update logic | `GET /update/check`, `POST /update/apply` |
| `/home/gabrielolv/Documents/Projects/ter/agent/src/server.ts` | Server init | `startServer()` |
| `/home/gabrielolv/Documents/Projects/ter/app/(tabs)/hosts.tsx` | Hosts screen | Update UI and triggers |
| `/home/gabrielolv/Documents/Projects/ter/components/HostCard.tsx` | Host card UI | Update status display |

## Update Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     UPDATE FLOW                                 │
└─────────────────────────────────────────────────────────────────┘

[App Launches]
     │
     ├──> useHostsLive() establishes WebSocket connections
     │    • /events?sessions=1&host=1&docker=1
     │    • Receives live snapshots every N seconds
     │
     └──> useEffect() starts periodic update checks
          • Every 60 seconds
          • Only for online hosts
          │
          ├──> GET /update/check (each host)
          │    │
          │    └──> Agent runs:
          │         1. git fetch origin main
          │         2. Compare local vs remote commit
          │         3. Get commit log if different
          │         4. Return UpdateStatus
          │
          └──> Update UI state
               • Show "Update available (abc123)" if updateAvailable
               • Display in HostCard component


[User Clicks "Update" Button]
     │
     └──> handleUpdate(hostId)
          │
          ├──> Set isUpdating = true
          │    • Button shows "Updating..."
          │    • Button disabled
          │
          ├──> POST /update/apply
          │    │
          │    └──> Agent runs:
          │         1. Find install directory
          │         2. spawn('bash', [update.sh, installDir])
          │         3. Detach and unref process
          │         4. Return immediately
          │
          │         [Background: update.sh runs]
          │         • git stash
          │         • git pull origin main
          │         • npm install (if needed)
          │         • systemctl restart (or equivalent)
          │
          ├──> Show Alert: "Update Started"
          │
          ├──> Remove from updateStatusMap
          │
          └──> Set isUpdating = false


[Agent Restarts]
     │
     └──> WebSocket reconnects automatically
          • useHostsLive() handles reconnection
          • Status changes: offline → checking → online
          • New version reflected in next update check
```

## Data Flow Patterns

### Host State Management

```typescript
// App-level storage (AsyncStorage)
const [hosts, setHosts] = useState<Host[]>([]);

// Live state per host (WebSocket)
const liveState = useHostsLive(hosts, {
  sessions: true,
  host: true,
  docker: true,
  intervalMs: 5000,
});

// Update status per host (Polling)
const [updateStatusMap, setUpdateStatusMap] = useState<Record<string, UpdateStatus>>({});

// Combined in UI
<HostCard
  host={host}
  status={liveState[host.id]?.status ?? 'unknown'}
  sessionCount={liveState[host.id]?.sessions.length ?? 0}
  containerCount={liveState[host.id]?.docker?.containers.length ?? 0}
  updateStatus={updateStatusMap[host.id]}
  isUpdating={updatingHosts[host.id]}
/>
```

### API Request Pattern

```typescript
// All API calls go through centralized request() function
// Handles:
// - URL normalization
// - Auth token injection
// - Timeout
// - Error handling
// - JSON parsing

const status = await checkForUpdate(host);
// ↓
const status = await request<UpdateStatus>(host, '/update/check', { method: 'GET' });
// ↓
fetch(`${host.baseUrl}/update/check`, {
  headers: { 'x-api-key': host.authToken },
  signal: AbortSignal.timeout(10000),
});
```

## Conventions Discovered

### Naming
- **Files:** camelCase for lib/components, lowercase for app routes (`hosts.tsx`, `api.ts`)
- **Components:** PascalCase (`HostCard`, `LaunchSheet`)
- **Functions:** camelCase (`checkForUpdate`, `buildEventsUrl`)
- **Types:** PascalCase (`Host`, `UpdateStatus`, `LiveOptions`)

### Patterns

| Pattern | Usage | Example |
|---------|-------|---------|
| Centralized API | All HTTP through single function | `request(host, path, options)` |
| WebSocket per feature | Separate WS for terminal, docker, events | `/ws`, `/docker/exec`, `/events` |
| Route modules | Each feature in separate route file | `routes/update.ts`, `routes/docker.ts` |
| Hook composition | Custom hooks wrap complex state | `useHostsLive()`, `useAppStore()` |
| AsyncStorage | Persistent state storage | Hosts, preferences |

### Error Handling
- API errors: Try/catch with Alert.alert
- WebSocket: Automatic reconnection on close
- Update failures: Non-blocking (silently ignore if agent doesn't support)

### Authentication
- Optional token-based auth
- Header: `x-api-key` or `Authorization: Bearer <token>`
- WebSocket: Query param `?token=<token>`
- If `TMUX_AGENT_TOKEN` not set, all requests allowed

## Open Questions

1. **Version display:** Agent doesn't expose version number in /health endpoint, only git commit hash in update check. Should there be a semantic version?

2. **Update rollback:** No rollback mechanism if update fails. Consider:
   - Backup mechanism
   - Automatic rollback on startup failure
   - Manual rollback endpoint

3. **Update notifications:** App checks every 60s but doesn't notify user. Should there be:
   - Push notification when update available?
   - Badge on hosts tab?
   - Auto-update option?

4. **Multi-host updates:** Currently updates one host at a time. Could batch updates or update all hosts at once.

5. **CLI asset sync:** The `/cli-assets` endpoints suggest distributing CLI tools (tldr, ast-grep, etc.) via the agent. Is this used for auto-installing CLI tools on the mobile app side or for host setup?

6. **Agent installation from app:** Currently manual (user SSHs and runs install.sh). Could the app:
   - Provide SSH credentials
   - Run install script remotely
   - Download and execute install script via HTTP?

## Security Considerations

1. **No HTTPS enforcement:** App accepts both http:// and https:// URLs. Consider enforcing HTTPS for non-local hosts.

2. **Token storage:** Auth tokens stored in AsyncStorage (unencrypted). Consider:
   - Secure keychain storage (react-native-keychain)
   - Token rotation
   - Token expiration

3. **Update script execution:** Agent runs arbitrary bash script from git repo. Ensure:
   - Git repo integrity (signed commits?)
   - Script validation before execution
   - Limited user permissions

4. **CORS wide open:** `origin: '*'` allows any web app to call agent. Consider:
   - Allowlist of origins
   - Require auth token for all endpoints
   - Rate limiting

5. **WebSocket auth:** Token in query param (visible in logs). Consider:
   - Auth via first message
   - Token in subprotocol header
   - Short-lived session tokens

---

**End of Report**
