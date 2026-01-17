# Bridge

React Native (Expo) app to manage tmux sessions and Docker containers across multiple hosts.

## Features

- Multiple host profiles with per-host auth tokens
- Live session lists + create/kill/rename
- Docker container management
- Full terminal via WebView + xterm.js
- Text selection (long-press) and copy/paste
- Auto-updating agent with systemd integration

---

## Agent Installation (Server)

### Quick Install

Run on any Linux server you want to manage:

```bash
curl -sSL https://raw.githubusercontent.com/GabrielOlvH/bridge/main/agent/install.sh | bash
```

Or clone and run manually:

```bash
git clone https://github.com/GabrielOlvH/bridge.git
cd bridge/agent
./install.sh
```

The installer will guide you through configuration (port, auth token, etc).

### Requirements

- Node.js >= 18
- npm
- git
- Build tools (`sudo apt install build-essential` on Debian/Ubuntu)

### Service Management

```bash
# View status
systemctl --user status bridge-agent

# View logs
journalctl --user -u bridge-agent -f

# Restart
systemctl --user restart bridge-agent

# Stop
systemctl --user stop bridge-agent
```

### Configuration

Edit `~/.bridge-agent/agent/.env`:

```bash
TMUX_AGENT_PORT=4020
TMUX_AGENT_HOST=my-server
TMUX_AGENT_TOKEN=your-secret-token
```

Then restart: `systemctl --user restart bridge-agent`

### Updates

Updates are triggered from the Bridge app. The app will notify you when an update is available.

```bash
# Manual update from command line
~/.bridge-agent/agent/update.sh
```

### Uninstall

```bash
~/.bridge-agent/agent/uninstall.sh
```

---

## App Development

### Run the app

```bash
pnpm install
pnpm start
```

### Connect to agent

Add a host in the app pointing to `http://<server-ip>:4020` with your auth token (if configured).

---

## Architecture

```
bridge/
├── app/          # Expo Router screens
├── components/   # React Native components
├── lib/          # API, store, types
└── agent/        # Node.js server (runs on managed hosts)
```

The agent provides:
- REST API for session/container management
- WebSocket for terminal I/O
- System metrics (CPU, memory, disk)
