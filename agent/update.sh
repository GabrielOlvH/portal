#!/bin/bash
# Bridge Agent Auto-Update Script

INSTALL_DIR="${1:-$HOME/.bridge-agent}"
SERVICE_NAME="bridge-agent"
LOG_PREFIX="[bridge-update]"
INIT_SYSTEM=""

log() {
    echo "$LOG_PREFIX $1"
}

detect_init_system() {
    if command -v systemctl &> /dev/null && systemctl --user status &> /dev/null; then
        INIT_SYSTEM="systemd-user"
    elif command -v systemctl &> /dev/null && systemctl status &> /dev/null; then
        INIT_SYSTEM="systemd-system"
    elif command -v rc-service &> /dev/null; then
        INIT_SYSTEM="openrc"
    else
        INIT_SYSTEM="manual"
    fi
}

restart_systemd_user() {
    systemctl --user daemon-reload 2>/dev/null || true
    if systemctl --user is-active --quiet "$SERVICE_NAME"; then
        systemctl --user restart "$SERVICE_NAME"
        log "Systemd user service restarted"
    else
        systemctl --user start "$SERVICE_NAME"
        log "Systemd user service started"
    fi
}

restart_systemd_system() {
    systemctl daemon-reload 2>/dev/null || true
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        systemctl restart "$SERVICE_NAME"
        log "Systemd system service restarted"
    else
        systemctl start "$SERVICE_NAME"
        log "Systemd system service started"
    fi
}

start_manual() {
    if [ ! -d "$INSTALL_DIR/agent" ]; then
        log "Error: Agent directory not found: $INSTALL_DIR/agent"
        return 1
    fi

    local node_bin
    node_bin=$(command -v node || true)
    if [ -z "$node_bin" ]; then
        log "Error: node not found in PATH"
        return 1
    fi

    cd "$INSTALL_DIR/agent" || return 1
    if [ -f ".env" ]; then
        # shellcheck disable=SC2046
        export $(grep -v '^#' .env | xargs)
    fi
    nohup "$node_bin" node_modules/.bin/tsx src/index.ts > /tmp/bridge-agent.log 2>&1 &
    echo $! > /tmp/bridge-agent.pid
    log "Agent started manually (PID: $(cat /tmp/bridge-agent.pid))"
}

restart_manual() {
    local pidfile=""
    if [ -f "/run/${SERVICE_NAME}.pid" ]; then
        pidfile="/run/${SERVICE_NAME}.pid"
    elif [ -f "/tmp/${SERVICE_NAME}.pid" ]; then
        pidfile="/tmp/${SERVICE_NAME}.pid"
    fi

    if [ -n "$pidfile" ]; then
        local pid
        pid=$(cat "$pidfile" 2>/dev/null || true)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            log "Stopping existing process (PID: $pid)"
            kill "$pid" 2>/dev/null || true
            sleep 1
        fi
        rm -f "$pidfile"
    fi

    start_manual
}

restart_openrc() {
    if [ -f "/etc/init.d/$SERVICE_NAME" ]; then
        if [ "$(id -u)" -eq 0 ]; then
            rc-service "$SERVICE_NAME" restart
            log "OpenRC service restarted"
            return 0
        fi

        if command -v sudo &> /dev/null && sudo -n true 2>/dev/null; then
            sudo -n rc-service "$SERVICE_NAME" restart
            log "OpenRC service restarted via sudo"
            return 0
        fi

        log "OpenRC detected but no permission to restart service"
    else
        log "OpenRC detected but service not installed in /etc/init.d"
    fi

    log "Falling back to manual restart"
    restart_manual
}

restart_service() {
    detect_init_system
    case "$INIT_SYSTEM" in
        systemd-user)
            restart_systemd_user
            ;;
        systemd-system)
            restart_systemd_system
            ;;
        openrc)
            restart_openrc
            ;;
        *)
            restart_manual
            ;;
    esac
}

if [ ! -d "$INSTALL_DIR" ]; then
    log "Error: Install directory not found: $INSTALL_DIR"
    exit 1
fi

cd "$INSTALL_DIR" || exit 1

# Fetch latest from remote
log "Checking for updates..."
if git fetch origin main --quiet 2>/dev/null; then
    BRANCH="main"
elif git fetch origin master --quiet 2>/dev/null; then
    BRANCH="master"
else
    log "Error: Failed to fetch from origin (main or master)"
    exit 1
fi

# Get current and remote commits
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
    log "Already up to date ($(echo "$LOCAL" | head -c 7))"
    exit 0
fi

log "Update available: $(echo "$LOCAL" | head -c 7) -> $(echo "$REMOTE" | head -c 7)"

# Check what changed
CHANGES=$(git diff --name-only "$LOCAL" "$REMOTE")
log "Changed files:"
    echo "$CHANGES" | while read -r file; do echo "  - $file"; done

# Stash any local changes
STASHED=false
if ! git diff --quiet || ! git diff --cached --quiet; then
    log "Stashing local changes..."
    git stash push -m "auto-update stash"
    STASHED=true
fi

# Pull changes (use rebase to keep history clean)
log "Pulling changes..."
if ! git pull --rebase origin "$BRANCH"; then
    log "Error: Failed to pull changes. Manual intervention may be required."
    if [ "$STASHED" = true ]; then
        git stash pop
    fi
    exit 1
fi

# Restore stashed changes
if [ "$STASHED" = true ]; then
    log "Restoring local changes..."
    git stash pop || log "Warning: Could not restore local changes cleanly"
fi

# Check if dependencies changed
if echo "$CHANGES" | grep -q "agent/package.json\|agent/package-lock.json"; then
    log "Dependencies changed, running npm install..."
    (cd agent && npm install)
fi

# Restart service
log "Restarting service..."
restart_service

log "Update complete!"
