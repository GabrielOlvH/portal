# Codebase Report: Agent Architecture Exploration
Generated: 2026-01-22 14:15:00

## Summary

The project consists of a React Native mobile app (Expo) and a TypeScript Node.js agent that runs on remote hosts. The agent is a REST/WebSocket server managing tmux sessions, Docker containers, AI sessions, and port forwarding. It can be installed as a systemd service, OpenRC service, or run manually.

## Project Structure

```
ter/
├── agent/                      # Backend agent (runs on remote hosts)
│   ├── src/
│   │   ├── http/               # HTTP/WebSocket routes
│   │   │   ├── routes/         # API endpoints
│   │   │   ├── app.ts          # Hono app builder
│   │   │   ├── ws.ts           # WebSocket handlers
│   │   │   └── live.ts         # Live updates
│   │   ├── notifications/      # Push notifications
│   │   ├── index.ts           # Entry point
│   │   ├── server.ts          # HTTP server
│   │   ├── config.ts          # Environment variables
│   │   └── state.ts           # Shared memory state
│   ├── install.sh             # Installation wizard
│   ├── update.sh              # Auto-update script
│   ├── uninstall.sh           # Uninstaller
│   └── package.json           # Dependencies + scripts
├── app/                       # React Native mobile app
├── lib/                       # Shared types + API client
│   ├── api.ts                # API client for agent communication
│   └── types.ts              # Shared TypeScript types
└── components/               # React Native UI components
```

## Questions Answered

### Q1: Where is the agent code located?

**Location:** `/agent` directory

**Entry Point:** `agent/src/index.ts`

**Key Files:**
- `src/index.ts` - Main entry point, starts server + periodic tasks
- `src/server.ts` - HTTP server initialization (Hono + WebSocket)
- `src/http/app.ts` - Route registration + CORS + auth middleware
- `src/config.ts` - Environment variable configuration

**Build Process:**
- Runtime: Node.js (>= 18)
- Transpiler: `tsx` (TypeScript execution)
- No compilation step - runs directly with `tsx src/index.ts`

### Q2: How is the agent currently started/stopped?

**Current Running State:**
- Running manually via `tsx` (PID: 7541, 7662)
- Process: `node .../tsx src/index.ts`
- Not running via systemd (systemctl not found on Gentoo system)

**Available Start Methods:**

1. Manual (Development):
   ```bash
   cd agent
   npm start  # runs: tsx src/index.ts
   ```

2. Systemd (Production - systemd systems):
   ```bash
   systemctl --user start bridge-agent
   systemctl --user stop bridge-agent
   systemctl --user restart bridge-agent
   systemctl --user status bridge-agent
   ```

3. OpenRC (Production - Gentoo/Alpine):
   ```bash
   sudo rc-service bridge-agent start
   sudo rc-service bridge-agent stop
   sudo rc-service bridge-agent restart
   ```

4. Manual Background:
   ```bash
   cd agent
   nohup node node_modules/.bin/tsx src/index.ts > /tmp/bridge-agent.log 2>&1 &
   echo $! > /tmp/bridge-agent.pid
   ```

**Stop Methods:**
- Systemd: `systemctl --user stop bridge-agent`
- OpenRC: `sudo rc-service bridge-agent stop`
- Manual: `kill $(cat /tmp/bridge-agent.pid)`

### Q3: Is there existing systemd/process management code?

VERIFIED - Comprehensive process management exists

**Systemd Service File:**
- Location: `~/.config/systemd/user/bridge-agent.service`
- Type: User service (no root required)
- Auto-restart: Enabled (RestartSec=5, Restart=on-failure)
- Logs: journalctl --user -u bridge-agent

**Process Management Scripts:**

| Script | Purpose | Features |
|--------|---------|----------|
| `install.sh` | Installation wizard | Detects init system, creates service, starts agent |
| `update.sh` | Auto-update from git | Pulls changes, reinstalls deps, restarts service |
| `uninstall.sh` | Complete removal | Stops service, removes files, cleans up |

**Init System Detection:**
```bash
# update.sh detects init system automatically
if systemctl --user status &> /dev/null; then
    INIT_SYSTEM="systemd-user"
elif systemctl status &> /dev/null; then
    INIT_SYSTEM="systemd-system"
elif rc-service &> /dev/null; then
    INIT_SYSTEM="openrc"
else
    INIT_SYSTEM="manual"
fi
```

### Q4: What's the agent's entry point and build process?

**Entry Point:** `agent/src/index.ts`

**Startup Sequence:**
```typescript
// 1. Load environment
import 'dotenv/config';

// 2. Start HTTP server
startServer();  // Binds to PORT (default 4020)

// 3. Start periodic tasks
if (USAGE_POLL_INTERVAL > 0) {
  startUsageRefresh();  // Poll AI usage every 60s
}

if (TOKEN_POLL_INTERVAL > 0) {
  primeTokenRefresh();  // Refresh tokens every 180s
}

if (NOTIFICATION_POLL_INTERVAL > 0) {
  startPauseMonitor();  // Check for idle sessions every 15s
}

// 4. Register cleanup handlers
process.on('exit', () => {
  claudeSession.term?.kill();
});
```

**Build Process:**
- No build step required
- Direct execution: `tsx src/index.ts`
- TypeScript transpiled on-the-fly by `tsx`
- Type checking: `tsc --noEmit` (optional, for CI)

**Dependencies:**
- `@hono/node-server` - HTTP server
- `hono` - Web framework (like Express)
- `node-pty` - Terminal emulation (requires build tools)
- `ws` - WebSocket support
- `tsx` - TypeScript execution
- `dotenv` - Environment variables

**Environment Variables:**
```bash
TMUX_AGENT_PORT=4020                    # HTTP port
TMUX_AGENT_HOST=hostname                # Label shown in app
TMUX_AGENT_TOKEN=secret                 # Auth token (optional)
TMUX_AGENT_SOCKET=/path/to/socket       # Custom tmux socket
TMUX_AGENT_USAGE_POLL_MS=60000         # Usage polling interval
TMUX_AGENT_TOKEN_POLL_MS=180000        # Token refresh interval
TMUX_AGENT_NOTIFICATION_POLL_MS=15000  # Notification polling
```

### Q5: How does the mobile app communicate with the agent?

**Communication Architecture:**

```
[React Native App] <--HTTP/WS--> [Agent HTTP Server]
     (lib/api.ts)                  (agent/src/http/app.ts)
```

**API Client:** `lib/api.ts`

**Protocol:**
- HTTP REST for commands/queries
- WebSocket for real-time terminal I/O

**Authentication:**
- Header: `Authorization: Bearer <token>` or `X-Api-Key: <token>`
- Middleware checks `TMUX_AGENT_TOKEN` environment variable
- Responds with 401 if token doesn't match

**API Endpoints:**

| Category | Endpoint | Method | Purpose |
|----------|----------|--------|---------|
| Core | `/health` | GET | Check agent status + tmux version |
| Core | `/ping` | GET | Latency check + event loop lag |
| Core | `/host` | GET | Host info (OS, arch, memory) |
| Core | `/usage` | GET | AI usage stats (Claude, Cursor, etc) |
| Sessions | `/sessions` | GET | List tmux sessions |
| Sessions | `/sessions` | POST | Create new session |
| Sessions | `/sessions/:name/kill` | POST | Kill session |
| Sessions | `/sessions/:name/keys` | POST | Send keys to session |
| AI Sessions | `/ai-sessions` | GET | List AI sessions |
| AI Sessions | `/ai-sessions/:id` | GET | Get session details |
| Docker | `/docker/containers` | GET | List containers |
| Docker | `/docker/:id/logs` | GET | Stream container logs |
| Ports | `/ports` | GET | List listening ports |
| Tunnels | `/tunnels` | GET | List SSH tunnels |
| Tunnels | `/tunnels` | POST | Create tunnel |
| Tunnels | `/tunnels/:id` | DELETE | Close tunnel |
| Files | `/files` | GET | List directory |
| Files | `/files/package.json` | GET | Read package.json |
| Notifications | `/notifications/register` | POST | Register push token |
| Updates | `/update/check` | GET | Check for updates |
| Updates | `/update/apply` | POST | Trigger auto-update |

**WebSocket Terminals:**
- URL: `ws://<host>:4020/ws?session=<name>&cols=80&rows=24&token=<token>`
- Messages:
  - Client to Server: `{ type: "input", data: "string" }`
  - Client to Server: `{ type: "resize", cols, rows }`
  - Server to Client: raw terminal data (binary frames)

**Client Implementation:**
```typescript
// lib/api.ts
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function buildHeaders(authToken?: string): Record<string, string> {
  return authToken 
    ? { Authorization: `Bearer ${authToken}` }
    : {};
}

// Example: Health check
export async function probeHealth(
  baseUrl: string, 
  authToken?: string
): Promise<HealthProbeResult> {
  const url = `${normalizeBaseUrl(baseUrl)}/health`;
  const response = await fetch(url, { 
    headers: buildHeaders(authToken),
    timeout: 6000 
  });
  // ... handle response
}
```

**Discovery:**
- App can scan local network (port 4020) to find agents
- Agent responds to `/health` with hostname

## Conventions Discovered

### Naming

**Files:**
- `kebab-case.ts` for modules (`pause-monitor.ts`)
- `index.ts` for entry points

**Functions:**
- `camelCase` for functions (`startServer`, `buildApp`)
- `async` functions for I/O operations

**Routes:**
- RESTful: `/resource` (collection), `/resource/:id` (item)
- Actions: `/resource/:id/action` (e.g., `/sessions/:name/kill`)

### Patterns

| Pattern | Usage | Example |
|---------|-------|---------|
| Hono routes | All HTTP endpoints | `app.get('/health', handler)` |
| Route registration | Modular route files | `registerCoreRoutes(app)` |
| Error handling | Centralized error util | `jsonError(c, err, status)` |
| Config | Environment variables | `config.ts` exports parsed env vars |
| State | In-memory shared state | `state.ts` exports singleton objects |
| WebSocket | Separate from HTTP routes | `attachWebSocketServers(server)` |

### Code Organization

**HTTP Layer:**
```
src/http/
  app.ts          # App builder, CORS, auth middleware
  ws.ts           # WebSocket attachment
  errors.ts       # Error utilities
  routes/
    core.ts       # Core endpoints (health, ping, host)
    sessions.ts   # Tmux session management
    docker.ts     # Docker integration
    ports.ts      # Port scanning
    tunnels.ts    # SSH tunnel management
```

**Module Responsibilities:**
- `src/http/` - HTTP/WebSocket layer only
- `src/` - Business logic (tmux, docker, git, agents)
- `src/notifications/` - Push notification subsystem
- `lib/` - Shared types + API client (used by mobile app)

## Architecture Map

```
┌─────────────────────────────────────────────────────────┐
│              React Native Mobile App                     │
│         (Expo + React Navigation + Zustand)             │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ HTTP/WebSocket
                     │ (lib/api.ts)
                     │
┌────────────────────▼────────────────────────────────────┐
│                  Agent HTTP Server                       │
│              (Hono + @hono/node-server)                 │
├─────────────────────────────────────────────────────────┤
│  Routes: sessions, docker, ports, tunnels, files, ...   │
│  Middleware: CORS, Auth (Bearer token)                   │
│  WebSocket: Terminal I/O (node-pty)                     │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬──────────────┐
        │            │            │              │
┌───────▼─────┐ ┌───▼────┐ ┌─────▼─────┐ ┌─────▼─────┐
│    Tmux     │ │ Docker │ │    SSH    │ │ AI Agents │
│  Sessions   │ │  API   │ │  Tunnels  │ │ (Claude)  │
└─────────────┘ └────────┘ └───────────┘ └───────────┘
```

## Key Files

| File | Purpose | Entry Points |
|------|---------|--------------|
| `agent/src/index.ts` | Agent entry point | `startServer()` |
| `agent/src/server.ts` | HTTP server | `startServer()` |
| `agent/src/http/app.ts` | Route registration | `buildApp()` |
| `agent/src/config.ts` | Environment config | Exports constants |
| `agent/install.sh` | Installation wizard | Bash script |
| `agent/update.sh` | Auto-updater | Called by `/update/apply` |
| `lib/api.ts` | Mobile API client | All `probe*()` functions |
| `lib/types.ts` | Shared types | TypeScript interfaces |

## Process Management Details

### Installation Flow

1. User runs install.sh
2. Wizard collects config (port, host label, auth token)
3. Clone/update repo to ~/.bridge-agent
4. Install dependencies: `cd agent && npm install`
5. Create .env file with config
6. Detect init system and setup service
7. Print connection info

### Auto-Update Flow

1. Triggered from mobile app: POST /update/apply
2. Spawn update.sh in background
3. update.sh runs: git fetch, git pull, npm install (if needed), restart service
4. Service restarts automatically

### Systemd Service Features

- Auto-restart on failure after 5 seconds
- Logging to systemd journal
- User service (no root required)
- Linger enabled (runs even when user not logged in)
- Environment file loaded automatically

### OpenRC Service Features

- Init script created at `agent/bridge-agent.init`
- Manual install (user must copy to `/etc/init.d/` with sudo)
- Auto-start can be added to default runlevel
- Environment loaded via `start_pre()` hook

## Security Notes

- Authentication: Optional bearer token via env var
- CORS: Allows all origins (intended for local network use)
- WARNING: Exposed endpoints on all interfaces (0.0.0.0:4020)
- WARNING: No HTTPS (consider SSH tunneling for remote access)
- Process isolation: Runs as user (not root) via systemd user service

## Open Questions

- Systemd not available on Gentoo? Current system shows "command not found" but service file exists. May be using OpenRC instead.
- Multiple installation locations? Code checks BRIDGE_INSTALL_DIR, ../, and ~/.bridge-agent. Which is canonical?
- Development vs Production? Currently running manually via tsx. Should production use systemd/openrc?
