# Bridge Agent Installation Guide

Complete guide for installing the Bridge Agent on Linux, macOS, and Windows.

## Table of Contents

- [Quick Start (Development)](#quick-start-development)
- [Linux (systemd)](#linux-systemd)
- [Linux (OpenRC)](#linux-openrc)
- [macOS (launchd)](#macos-launchd)
- [Windows (Task Scheduler)](#windows-task-scheduler)
- [Configuration](#configuration)
- [Updating](#updating)
- [Uninstalling](#uninstalling)
- [Troubleshooting](#troubleshooting)
- [Architecture](#architecture)

---

## Quick Start (Development)

For local development or testing:

```bash
# Clone the repository
git clone https://github.com/GabrielOlvH/bridge.git
cd bridge/agent

# Install dependencies
npm install

# Start the agent
npm start
```

Access at `http://localhost:4020`

For development with auto-reload:

```bash
npm run dev
```

---

## Linux (systemd)

### One-Liner Install

```bash
curl -fsSL https://raw.githubusercontent.com/GabrielOlvH/bridge/main/agent/install.sh | bash
```

### Manual Install

```bash
cd agent
npm run install-service
```

The installer will:
1. Prompt for configuration (port, host label, auth token)
2. Create a systemd user service
3. Enable auto-start on login
4. Start the service immediately

### Commands

| Action | Command |
|--------|---------|
| View status | `systemctl --user status bridge-agent` |
| View logs | `journalctl --user -u bridge-agent -f` |
| Restart | `systemctl --user restart bridge-agent` |
| Stop | `systemctl --user stop bridge-agent` |
| Start | `systemctl --user start bridge-agent` |
| Disable auto-start | `systemctl --user disable bridge-agent` |

### Service Location

```
~/.config/systemd/user/bridge-agent.service
```

### Enable Linger (Run Without Login)

To keep the agent running even when not logged in:

```bash
loginctl enable-linger $USER
```

---

## Linux (OpenRC)

For Gentoo, Alpine, and other OpenRC-based distributions.

### Install

```bash
cd agent
npm run install-service
```

The installer will create an init script and provide instructions for system-wide installation.

### System-Wide Setup (Requires Root)

```bash
# Copy init script to system location
sudo cp ~/.bridge-agent/agent/bridge-agent.init /etc/init.d/bridge-agent

# Add to default runlevel
sudo rc-update add bridge-agent default

# Start the service
sudo rc-service bridge-agent start
```

### Commands

| Action | Command |
|--------|---------|
| View status | `sudo rc-service bridge-agent status` |
| Restart | `sudo rc-service bridge-agent restart` |
| Stop | `sudo rc-service bridge-agent stop` |
| Start | `sudo rc-service bridge-agent start` |
| View logs | `tail -f /var/log/bridge-agent.log` |

### Service Location

```
/etc/init.d/bridge-agent
```

---

## macOS (launchd)

### Install

```bash
cd agent
npm run install-service
```

The installer will:
1. Create a Launch Agent plist
2. Load the service immediately
3. Configure auto-start on login

### Commands

| Action | Command |
|--------|---------|
| View status | `launchctl list \| grep bridge` |
| Restart | `launchctl stop com.bridge.agent && launchctl start com.bridge.agent` |
| Stop | `launchctl stop com.bridge.agent` |
| Start | `launchctl start com.bridge.agent` |
| Force restart | `launchctl kickstart -k gui/$(id -u)/com.bridge.agent` |
| View logs | `tail -f /tmp/bridge-agent.log` |
| View errors | `tail -f /tmp/bridge-agent.err` |

### Service Location

```
~/Library/LaunchAgents/com.bridge.agent.plist
```

### Reload Service After Config Change

```bash
launchctl unload ~/Library/LaunchAgents/com.bridge.agent.plist
launchctl load ~/Library/LaunchAgents/com.bridge.agent.plist
```

---

## Windows (Task Scheduler)

### Install

Open PowerShell or Command Prompt as Administrator:

```powershell
cd agent
npm run install-service
```

The installer will:
1. Create a startup batch file
2. Configure a Task Scheduler task to run at logon
3. Start the agent immediately

### Commands

| Action | Command |
|--------|---------|
| View status | `schtasks /query /tn "BridgeAgent"` |
| Restart | `schtasks /end /tn "BridgeAgent" && schtasks /run /tn "BridgeAgent"` |
| Stop | `schtasks /end /tn "BridgeAgent"` |
| Start | `schtasks /run /tn "BridgeAgent"` |
| View logs | `type %TEMP%\bridge-agent.log` |

### Task Scheduler GUI

1. Open Task Scheduler (`taskschd.msc`)
2. Find "BridgeAgent" in the task list
3. Right-click to Start, Stop, or view Properties

### Service Location

```
%USERPROFILE%\.bridge-agent\agent\start-agent.bat
```

---

## Configuration

### Environment Variables

Configuration is stored in `~/.bridge-agent/agent/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `TMUX_AGENT_PORT` | `4020` | HTTP/WebSocket server port |
| `TMUX_AGENT_HOST` | System hostname | Label shown in the Bridge app |
| `TMUX_AGENT_TOKEN` | (none) | Bearer token for authentication |
| `TMUX_AGENT_SOCKET` | (default) | Custom tmux socket path |
| `TMUX_AGENT_USAGE_POLL_MS` | `60000` | System usage poll interval (ms) |
| `TMUX_AGENT_TOKEN_POLL_MS` | `180000` | Token usage poll interval (ms) |
| `BRIDGE_INSTALL_DIR` | `~/.bridge-agent` | Installation directory |

### Example .env File

```bash
# Bridge Agent Configuration

BRIDGE_INSTALL_DIR=/home/user/.bridge-agent
TMUX_AGENT_PORT=4020
TMUX_AGENT_HOST=my-server
TMUX_AGENT_TOKEN=your-secret-token
TMUX_AGENT_SOCKET=
TMUX_AGENT_USAGE_POLL_MS=60000
TMUX_AGENT_TOKEN_POLL_MS=180000
```

### Generating an Auth Token

```bash
# Generate a secure random token
openssl rand -hex 16
```

### Changing Configuration

1. Edit the `.env` file:
   ```bash
   nano ~/.bridge-agent/agent/.env
   ```

2. Restart the service:
   - **Linux (systemd):** `systemctl --user restart bridge-agent`
   - **Linux (OpenRC):** `sudo rc-service bridge-agent restart`
   - **macOS:** `launchctl stop com.bridge.agent && launchctl start com.bridge.agent`
   - **Windows:** `schtasks /end /tn "BridgeAgent" && schtasks /run /tn "BridgeAgent"`

---

## Updating

### From the Bridge App

Tap the update button in the app to trigger an automatic update.

### Manual Update

```bash
npm run update-service
```

Or use the update script directly:

```bash
~/.bridge-agent/agent/update.sh
```

The update process:
1. Fetches latest changes from git
2. Reinstalls dependencies if `package.json` changed
3. Restarts the service automatically

### Force Update

If the automatic update fails:

```bash
cd ~/.bridge-agent
git fetch origin main
git reset --hard origin/main
cd agent
npm install
# Then restart the service
```

---

## Uninstalling

### Using npm Script

```bash
cd agent
npm run uninstall-service
```

### Manual Uninstall

**Linux (systemd):**
```bash
systemctl --user stop bridge-agent
systemctl --user disable bridge-agent
rm ~/.config/systemd/user/bridge-agent.service
systemctl --user daemon-reload
rm -rf ~/.bridge-agent
```

**Linux (OpenRC):**
```bash
sudo rc-service bridge-agent stop
sudo rc-update del bridge-agent default
sudo rm /etc/init.d/bridge-agent
rm -rf ~/.bridge-agent
```

**macOS:**
```bash
launchctl unload ~/Library/LaunchAgents/com.bridge.agent.plist
rm ~/Library/LaunchAgents/com.bridge.agent.plist
rm -rf ~/.bridge-agent
```

**Windows:**
```powershell
schtasks /delete /tn "BridgeAgent" /f
Remove-Item -Recurse -Force "$env:USERPROFILE\.bridge-agent"
```

---

## Troubleshooting

### Agent Won't Start

**Check logs:**
```bash
# Linux (systemd)
journalctl --user -u bridge-agent --no-pager -n 50

# macOS
cat /tmp/bridge-agent.log

# Windows
type %TEMP%\bridge-agent.log
```

**Common causes:**
- Port already in use: `lsof -i :4020` or change `TMUX_AGENT_PORT`
- Missing Node.js: Ensure Node.js >= 18 is installed
- Permission denied: Check file permissions on install directory
- Missing dependencies: Run `npm install` in agent directory

### Can't Connect from App

**Check firewall:**
```bash
# Linux (ufw)
sudo ufw allow 4020/tcp

# Linux (firewalld)
sudo firewall-cmd --add-port=4020/tcp --permanent
sudo firewall-cmd --reload
```

**Verify agent is listening:**
```bash
curl http://localhost:4020/health
```

**Check network:**
- Ensure phone and server are on same network
- Use the correct IP address (not `localhost`)
- Check for VPN interference

### Update Fails

**Git permission issues:**
```bash
cd ~/.bridge-agent
git status
git stash  # Stash local changes
git pull origin main
```

**Network issues:**
- Check internet connectivity
- Verify GitHub is accessible

### Service Not Auto-Starting

**Linux (systemd):**
```bash
# Check linger is enabled
loginctl show-user $USER | grep Linger

# Enable if needed
loginctl enable-linger $USER

# Verify service is enabled
systemctl --user is-enabled bridge-agent
```

**macOS:**
- Ensure plist has `<key>RunAtLoad</key><true/>`
- Check System Preferences > Users > Login Items

**Windows:**
- Open Task Scheduler and verify "BridgeAgent" task exists
- Check task trigger is set to "At log on"

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `EADDRINUSE` | Port 4020 in use | Change port or stop conflicting process |
| `EACCES` | Permission denied | Check file/directory permissions |
| `ENOENT: .env` | Missing config | Run installer or create `.env` manually |
| `Cannot find module` | Missing deps | Run `npm install` |
| `node-pty build failed` | Missing build tools | Install gcc/make (Linux) or Visual C++ Build Tools (Windows) |

---

## Architecture

### Overview

```
┌─────────────────────┐     HTTP/WS      ┌─────────────────────┐
│   Bridge Mobile     │◄────────────────►│   Bridge Agent      │
│       App           │                  │   (per machine)     │
└─────────────────────┘                  └─────────┬───────────┘
                                                   │
                                                   ▼
                                         ┌─────────────────────┐
                                         │  tmux / Docker /    │
                                         │  System Resources   │
                                         └─────────────────────┘
```

### Components

| Component | Purpose |
|-----------|---------|
| HTTP Server | REST API for sessions, Docker, ports |
| WebSocket | Real-time terminal I/O (xterm.js) |
| tmux Integration | Session management, capture, keys |
| Docker Integration | Container listing, logs, exec |
| System Monitor | CPU, memory, disk usage |

### Data Flow

1. **Bridge App** connects to agent via HTTP/WebSocket
2. **Agent** translates requests to tmux/Docker commands
3. **Terminal data** streams via WebSocket for real-time display
4. **System metrics** polled periodically and cached

### Service Management

The agent is designed to run as a background service managed by:
- **Linux:** systemd (user service) or OpenRC
- **macOS:** launchd (Launch Agent)
- **Windows:** Task Scheduler

This ensures:
- Auto-start on boot/login
- Automatic restart on crash
- Proper logging
- Clean shutdown handling

### Security Notes

- Use `TMUX_AGENT_TOKEN` to protect against unauthorized access
- Agent listens on all interfaces by default; use firewall to restrict
- Consider running behind a reverse proxy (nginx/caddy) for HTTPS
- Never expose port 4020 directly to the internet without auth

---

## Additional Resources

- [README.md](./README.md) - Quick reference and API endpoints
- [GitHub Repository](https://github.com/GabrielOlvH/bridge) - Source code and issues
- [.env.example](./.env.example) - Configuration template
