#!/bin/bash
# Bridge Agent Auto-Update Script

INSTALL_DIR="${1:-$HOME/.bridge-agent}"
SERVICE_NAME="bridge-agent"
LOG_PREFIX="[bridge-update]"

log() {
    echo "$LOG_PREFIX $1"
}

if [ ! -d "$INSTALL_DIR" ]; then
    log "Error: Install directory not found: $INSTALL_DIR"
    exit 1
fi

cd "$INSTALL_DIR"

# Fetch latest from remote
log "Checking for updates..."
git fetch origin main --quiet 2>/dev/null || git fetch origin master --quiet 2>/dev/null

# Get current and remote commits
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/master 2>/dev/null)

if [ "$LOCAL" = "$REMOTE" ]; then
    log "Already up to date ($(echo $LOCAL | head -c 7))"
    exit 0
fi

log "Update available: $(echo $LOCAL | head -c 7) -> $(echo $REMOTE | head -c 7)"

# Check what changed
CHANGES=$(git diff --name-only "$LOCAL" "$REMOTE")
log "Changed files:"
echo "$CHANGES" | while read file; do echo "  - $file"; done

# Pull changes
log "Pulling changes..."
if ! git pull origin main 2>/dev/null && ! git pull origin master 2>/dev/null; then
    log "Error: Failed to pull changes. Manual intervention may be required."
    exit 1
fi

# Check if dependencies changed
if echo "$CHANGES" | grep -q "agent/package.json\|agent/package-lock.json"; then
    log "Dependencies changed, running npm install..."
    cd agent && npm install
    cd ..
fi

# Restart service
log "Restarting service..."
if systemctl --user is-active --quiet "$SERVICE_NAME"; then
    systemctl --user restart "$SERVICE_NAME"
    log "Service restarted successfully"
else
    log "Service not running, starting..."
    systemctl --user start "$SERVICE_NAME"
fi

log "Update complete!"
