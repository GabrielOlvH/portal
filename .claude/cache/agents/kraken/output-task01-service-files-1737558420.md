# Implementation Report: Platform-Specific Service Files

Generated: 2026-01-22T14:07:00Z

## Task

Create service definition templates for systemd, OpenRC, and macOS launchd to manage the Bridge Agent as a background service.

## Files Created

| File | Size | Purpose |
|------|------|---------|
| `/home/gabrielolv/Documents/Projects/ter/agent/services/bridge-agent.service` | 484 bytes | systemd unit file |
| `/home/gabrielolv/Documents/Projects/ter/agent/services/bridge-agent.openrc` | 606 bytes | OpenRC init script |
| `/home/gabrielolv/Documents/Projects/ter/agent/services/com.bridge.agent.plist` | 1100 bytes | macOS launchd plist |

## Implementation Details

### systemd Unit (bridge-agent.service)

```ini
[Unit]
Description=Bridge Agent - Terminal Management Server
Documentation=https://github.com/GabrielOlvH/bridge
After=network.target

[Service]
Type=simple
WorkingDirectory={{INSTALL_DIR}}/agent
ExecStart={{NODE_PATH}} {{INSTALL_DIR}}/agent/node_modules/.bin/tsx {{INSTALL_DIR}}/agent/src/index.ts
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bridge-agent
EnvironmentFile={{INSTALL_DIR}}/agent/.env

[Install]
WantedBy=default.target
```

### OpenRC Script (bridge-agent.openrc)

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
    after firewall
}

start_pre() {
    checkpath --directory --owner ${command_user} /run
    [ -f "${directory}/.env" ] && export $(grep -v '^#' ${directory}/.env | xargs)
}

stop_post() {
    rm -f "${pidfile}"
}
```

### macOS Launchd Plist (com.bridge.agent.plist)

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
    <dict>
        <key>SuccessfulExit</key>
        <false/>
        <key>Crashed</key>
        <true/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>5</integer>
    <key>StandardOutPath</key>
    <string>{{INSTALL_DIR}}/agent/logs/agent.log</string>
    <key>StandardErrorPath</key>
    <string>{{INSTALL_DIR}}/agent/logs/error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
```

## Placeholder Variables

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `{{INSTALL_DIR}}` | Base installation directory | `$HOME/.bridge-agent` |
| `{{NODE_PATH}}` | Full path to node binary | `/usr/bin/node` |
| `{{USER}}` | Username to run service as | `gabrielolv` |

## Substitution Example

```bash
# Substitute placeholders in systemd template
sed -e "s|{{INSTALL_DIR}}|$HOME/.bridge-agent|g" \
    -e "s|{{NODE_PATH}}|$(which node)|g" \
    agent/services/bridge-agent.service > ~/.config/systemd/user/bridge-agent.service
```

## Notes

- The systemd unit uses user-level service (`WantedBy=default.target`) which doesn't require root
- OpenRC script uses `supervise-daemon` for better process supervision than `command_background`
- macOS plist includes `KeepAlive` with smart restart (only on crash/abnormal exit)
- All services include automatic restart with 5-second delay
- Environment variables are loaded from the `.env` file

## Handoff

Created: `/home/gabrielolv/Documents/Projects/ter/thoughts/handoffs/agent-consolidation/task-01-service-files.md`
