# Plan: Agent Process Consolidation (Cross-Platform)

## Goal

Consolidate the Bridge Agent into a proper system service across all platforms:
1. **Persistent auto-restarts** - Restart on crash
2. **Auto-start on boot** - Start when machine boots
3. **In-app updates** - Trigger updates from the mobile app
4. **Cross-platform support** - Linux (systemd + OpenRC), macOS (launchd), Windows

## Current State Analysis

### What Already Exists

| Component | Location | Status |
|-----------|----------|--------|
| Install wizard | `agent/install.sh` | ✓ Has systemd/OpenRC detection |
| Update script | `agent/update.sh` | ✓ Git-based update with restart |
| Uninstaller | `agent/uninstall.sh` | ✓ Linux only |
| Update API | `agent/src/http/routes/update.ts` | ✓ Works |
| App UI | `app/(tabs)/hosts.tsx` | ✓ Polls every 60s |

### Gaps

| Platform | Auto-restart | Auto-start | Install Script |
|----------|--------------|------------|----------------|
| systemd | ✓ (Restart=on-failure) | ✓ | ✓ Needs polish |
| OpenRC | ✗ Missing | ✗ Not installed | ✗ Creates but doesn't install |
| macOS | ✗ Missing | ✗ Missing | ✗ Missing |
| Windows | ✗ Missing | ✗ Missing | ✗ Missing |

## Technical Choices

| Platform | Service Manager | Config Location |
|----------|-----------------|-----------------|
| Linux (systemd) | systemd user service | `~/.config/systemd/user/` |
| Linux (OpenRC) | supervise-daemon | `/etc/init.d/` (system) |
| macOS | launchd | `~/Library/LaunchAgents/` |
| Windows | Windows Service (node-windows) or Task Scheduler | Registry / Task Scheduler |

## Tasks

### Task 1: Create Platform-Specific Service Files

Create service definition templates for each platform.

**Files to create:**
- `agent/services/bridge-agent.service` - systemd unit file
- `agent/services/bridge-agent.openrc` - OpenRC init script
- `agent/services/com.bridge.agent.plist` - macOS launchd plist
- `agent/services/install-windows.js` - Windows service installer

**Systemd unit:**
```ini
[Unit]
Description=Bridge Agent - Terminal Management Server
After=network.target

[Service]
Type=simple
WorkingDirectory={{INSTALL_DIR}}/agent
ExecStart={{NODE_PATH}} {{INSTALL_DIR}}/agent/node_modules/.bin/tsx {{INSTALL_DIR}}/agent/src/index.ts
Restart=on-failure
RestartSec=5
EnvironmentFile={{INSTALL_DIR}}/agent/.env

[Install]
WantedBy=default.target
```

**OpenRC script:**
```bash
#!/sbin/openrc-run
name="bridge-agent"
description="Bridge Agent - Terminal Management Server"
supervisor="supervise-daemon"
command="{{NODE_PATH}}"
command_args="{{INSTALL_DIR}}/agent/node_modules/.bin/tsx {{INSTALL_DIR}}/agent/src/index.ts"
command_user="{{USER}}"
directory="{{INSTALL_DIR}}/agent"
pidfile="/run/${RC_SVCNAME}.pid"
respawn_delay=5
respawn_max=0

depend() {
    need net
}

start_pre() {
    [ -f "${directory}/.env" ] && export $(grep -v '^#' ${directory}/.env | xargs)
}
```

**macOS launchd plist:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.bridge.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>{{NODE_PATH}}</string>
        <string>{{INSTALL_DIR}}/agent/node_modules/.bin/tsx</string>
        <string>{{INSTALL_DIR}}/agent/src/index.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>{{INSTALL_DIR}}/agent</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>{{INSTALL_DIR}}/agent/logs/agent.log</string>
    <key>StandardErrorPath</key>
    <string>{{INSTALL_DIR}}/agent/logs/error.log</string>
</dict>
</plist>
```

### Task 2: Create Cross-Platform Install Script

Replace bash-only install.sh with a Node.js installer that works everywhere.

**Files to create:**
- `agent/scripts/install.ts` - Cross-platform installer
- `agent/scripts/uninstall.ts` - Cross-platform uninstaller

**Features:**
- [ ] Detect platform (linux/darwin/win32)
- [ ] Detect init system on Linux (systemd vs OpenRC)
- [ ] Interactive wizard (prompts for port, token, etc.)
- [ ] Template substitution for service files
- [ ] Install and enable service
- [ ] Verify installation

**Platform detection logic:**
```typescript
function detectPlatform(): Platform {
  const platform = process.platform;
  if (platform === 'darwin') return { type: 'macos', manager: 'launchd' };
  if (platform === 'win32') return { type: 'windows', manager: 'windows-service' };
  if (platform === 'linux') {
    // Check for systemd
    if (existsSync('/run/systemd/system')) return { type: 'linux', manager: 'systemd' };
    // Check for OpenRC
    if (existsSync('/sbin/openrc-run')) return { type: 'linux', manager: 'openrc' };
    return { type: 'linux', manager: 'manual' };
  }
  return { type: 'unknown', manager: 'manual' };
}
```

### Task 3: Create Cross-Platform Update Script

Replace bash-only update.sh with Node.js version.

**Files to create:**
- `agent/scripts/update.ts` - Cross-platform updater

**Features:**
- [ ] Git fetch and pull
- [ ] npm install if package.json changed
- [ ] Restart service (platform-specific)
- [ ] Rollback on failure

**Restart logic by platform:**
```typescript
async function restartService(platform: Platform): Promise<void> {
  switch (platform.manager) {
    case 'systemd':
      await exec('systemctl --user restart bridge-agent');
      break;
    case 'openrc':
      await exec('sudo rc-service bridge-agent restart');
      break;
    case 'launchd':
      await exec('launchctl kickstart -k gui/$(id -u)/com.bridge.agent');
      break;
    case 'windows-service':
      await exec('net stop bridge-agent && net start bridge-agent');
      break;
  }
}
```

### Task 4: Add Service Management API

Extend the agent API with service management endpoints.

**Files to modify:**
- `agent/src/http/routes/update.ts` → expand or create `service.ts`

**New endpoints:**
- [ ] `GET /service/status` - Running state, uptime, PID, platform info
- [ ] `POST /service/restart` - Trigger service restart
- [ ] `GET /service/logs?lines=100` - Recent log lines
- [ ] `GET /service/info` - Install path, version, platform, init system

**Response types:**
```typescript
type ServiceStatus = {
  status: 'running' | 'stopped' | 'unknown';
  pid: number;
  uptimeSeconds: number;
  platform: 'linux' | 'macos' | 'windows';
  initSystem: 'systemd' | 'openrc' | 'launchd' | 'windows-service' | 'manual';
  autoRestart: boolean;
  version: string;
  installDir: string;
};

type ServiceLogs = {
  lines: string[];
  source: 'journald' | 'file' | 'eventlog';
};
```

### Task 5: Add Service Management UI in App

Show service status and controls in the host detail screen.

**Files to modify:**
- `lib/api.ts` - Add API functions
- `app/hosts/[id]/index.tsx` - Add service status section

**UI additions:**
- [ ] Service status badge (running/stopped)
- [ ] Uptime display
- [ ] Platform/init system info
- [ ] Restart button
- [ ] View logs button (opens modal or new screen)

### Task 6: Add npm Scripts for Easy Access

**Files to modify:**
- `agent/package.json`

**Scripts to add:**
```json
{
  "scripts": {
    "install-service": "tsx scripts/install.ts",
    "uninstall-service": "tsx scripts/uninstall.ts",
    "update-service": "tsx scripts/update.ts"
  }
}
```

### Task 7: Windows-Specific Implementation

Windows requires special handling due to lack of native service support in Node.

**Options (choose one):**

**Option A: node-windows package**
```typescript
import { Service } from 'node-windows';

const svc = new Service({
  name: 'Bridge Agent',
  description: 'Terminal Management Server',
  script: path.join(installDir, 'agent/src/index.ts'),
  nodeOptions: ['--require', 'tsx/cjs'],
});

svc.on('install', () => svc.start());
svc.install();
```

**Option B: Task Scheduler (no admin required)**
```typescript
// Uses schtasks.exe to create a task that runs at logon
await exec(`schtasks /create /tn "BridgeAgent" /tr "${command}" /sc onlogon /rl highest`);
```

**Decision:** Use Task Scheduler for simplicity (no npm dependency, works without admin for user tasks).

### Task 8: Documentation

**Files to create:**
- `agent/INSTALL.md` - Installation guide

**Sections:**
- [ ] Quick start (development)
- [ ] Linux (systemd) installation
- [ ] Linux (OpenRC) installation
- [ ] macOS installation
- [ ] Windows installation
- [ ] Updating
- [ ] Uninstalling
- [ ] Troubleshooting

## File Structure After Implementation

```
agent/
├── scripts/
│   ├── install.ts      # Cross-platform installer
│   ├── uninstall.ts    # Cross-platform uninstaller
│   └── update.ts       # Cross-platform updater
├── services/
│   ├── bridge-agent.service     # systemd
│   ├── bridge-agent.openrc      # OpenRC
│   └── com.bridge.agent.plist   # macOS launchd
├── src/
│   └── http/routes/
│       └── service.ts  # Service management API
├── install.sh          # Keep for curl | bash convenience (calls scripts/install.ts)
├── INSTALL.md          # Documentation
└── package.json        # Updated with new scripts
```

## Success Criteria

### Automated Verification:
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes

### Manual Verification (per platform):

**Linux (systemd):**
- [ ] `npm run install-service` completes
- [ ] `systemctl --user status bridge-agent` shows active
- [ ] Agent restarts after `kill -9 $(pidof node)`
- [ ] Agent starts after reboot

**Linux (OpenRC):**
- [ ] `npm run install-service` completes
- [ ] `rc-service bridge-agent status` shows started
- [ ] Agent restarts after kill
- [ ] Agent starts after reboot

**macOS:**
- [ ] `npm run install-service` completes
- [ ] `launchctl list | grep bridge` shows running
- [ ] Agent restarts after kill
- [ ] Agent starts after reboot

**Windows:**
- [ ] `npm run install-service` completes
- [ ] Task shows in Task Scheduler
- [ ] Agent restarts after taskkill
- [ ] Agent starts after reboot

**App UI:**
- [ ] Service status shows correctly
- [ ] Restart button works
- [ ] Logs are viewable

## Out of Scope

- **Docker deployment** - Different use case
- **Multi-instance support** - Single agent per host
- **Linux without systemd/OpenRC** - Too niche (use manual)

## Risks (Pre-Mortem)

### Tigers:
- **Windows service permissions** (MEDIUM)
  - Mitigation: Use Task Scheduler instead of Windows Service

- **OpenRC requires root** (MEDIUM)
  - Mitigation: Prompt for sudo, document requirement

- **macOS code signing** (LOW)
  - Mitigation: launchd user agents don't require signing

### Elephants:
- **Different Node.js paths across systems** (MEDIUM)
  - Note: Detect with `which node` / `where node`, store in config

- **tsx not available on PATH** (MEDIUM)
  - Note: Use full path to node_modules/.bin/tsx
