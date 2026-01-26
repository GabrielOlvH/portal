# Task 04: Service Management API

## Status: COMPLETED

## Summary
Added service management API endpoints to the bridge-agent HTTP server for querying service status, viewing logs, triggering restarts, and getting service information.

## Files Created

### `/home/gabrielolv/Documents/Projects/ter/agent/src/http/routes/service.ts`
New route handler implementing 4 endpoints:

1. **GET /service/status** - Returns service running state
2. **POST /service/restart** - Triggers service restart
3. **GET /service/logs?lines=N** - Returns recent log lines
4. **GET /service/info** - Returns static service information

## Files Modified

### `/home/gabrielolv/Documents/Projects/ter/agent/src/http/app.ts`
- Added import for `registerServiceRoutes`
- Registered service routes in the app

## API Specification

### GET /service/status
Returns:
```typescript
{
  status: 'running' | 'stopped' | 'unknown';
  pid: number;
  uptimeSeconds: number;
  platform: 'linux' | 'macos' | 'windows' | 'unknown';
  initSystem: 'systemd' | 'openrc' | 'launchd' | 'task-scheduler' | 'manual';
  autoRestart: boolean;
  version: string;  // git short hash
  installDir: string;
}
```

### POST /service/restart
Returns:
```typescript
{
  success: boolean;
  message: string;
}
```

### GET /service/logs?lines=100
Returns:
```typescript
{
  lines: string[];
  source: 'journald' | 'file' | 'eventlog';
}
```

### GET /service/info
Returns:
```typescript
{
  installPath: string;
  gitVersion: string;
  platform: 'linux' | 'macos' | 'windows' | 'unknown';
  initSystem: 'systemd' | 'openrc' | 'launchd' | 'task-scheduler' | 'manual';
  nodeVersion: string;
  processId: number;
  processUptime: number;
}
```

## Platform Support

The implementation detects and handles:
- **Linux systemd** (user and system services)
- **Linux OpenRC** (Gentoo, Alpine)
- **macOS launchd** (LaunchAgents)
- **Windows Task Scheduler**
- **Manual** (fallback for other systems)

## Implementation Details

### Platform Detection
- Uses `os.platform()` for OS detection
- Checks `/run/systemd/system` for systemd
- Checks `/sbin/openrc-run` or `/sbin/rc-service` for OpenRC

### Log Sources
- systemd: `journalctl --user -u bridge-agent` or `journalctl -u bridge-agent`
- OpenRC: `/var/log/bridge-agent.log` or syslog
- launchd: `~/Library/Logs/bridge-agent/bridge-agent.log`
- Windows: Event Log via `wevtutil` or log file

### Restart Logic
- systemd: `systemctl --user restart` or `systemctl restart`
- OpenRC: `rc-service bridge-agent restart`
- launchd: `launchctl stop` + `launchctl start`
- Windows: `schtasks /end` + `schtasks /run`
- Manual: Returns error (cannot restart via API)

## Validation

- TypeScript compilation: PASSED (no new errors in service.ts or app.ts)
- Follows existing code patterns from routes/docker.ts, routes/update.ts
- Reuses platform detection logic from scripts/install.ts and scripts/update.ts

## Notes

- The uptime is tracked from when the Node.js process started (module-level `startTime`)
- Git version is fetched from the install directory using `git rev-parse --short HEAD`
- Manual service mode cannot be restarted via API (would kill the responding process)
