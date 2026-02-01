#!/bin/bash
# Bridge Agent Uninstaller

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

INSTALL_DIR="${1:-$HOME/.bridge-agent}"
SERVICE_NAME="bridge-agent"

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════╗"
echo "║       ${BOLD}Bridge Agent Uninstaller${NC}${CYAN}            ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${YELLOW}This will remove Bridge Agent from your system.${NC}\n"

# Confirm
echo -ne "${CYAN}Are you sure you want to uninstall? [y/N]: ${NC}"
read -r confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}Uninstall cancelled${NC}"
    exit 0
fi

echo -e "\n${CYAN}Stopping services...${NC}"

# Stop systemd service if exists
if command -v systemctl &> /dev/null; then
    systemctl --user stop "$SERVICE_NAME.service" 2>/dev/null || true
    systemctl --user disable "$SERVICE_NAME.service" 2>/dev/null || true
    rm -f "$HOME/.config/systemd/user/$SERVICE_NAME.service"
    systemctl --user daemon-reload 2>/dev/null || true
fi

# Stop OpenRC service if exists
if command -v rc-service &> /dev/null; then
    sudo rc-service "$SERVICE_NAME" stop 2>/dev/null || true
    sudo rc-update del "$SERVICE_NAME" default 2>/dev/null || true
    sudo rm -f "/etc/init.d/$SERVICE_NAME" 2>/dev/null || true
fi

# Kill manual process if running
if [ -f /tmp/bridge-agent.pid ]; then
    kill "$(cat /tmp/bridge-agent.pid)" 2>/dev/null || true
    rm -f /tmp/bridge-agent.pid
fi

# Clean up log
rm -f /tmp/bridge-agent.log

echo -e "${GREEN}✓ Services stopped${NC}"

# Ask about removing files
echo
echo -ne "${CYAN}Remove installation directory ($INSTALL_DIR)? [y/N]: ${NC}"
read -r remove_files
if [[ "$remove_files" =~ ^[Yy]$ ]]; then
    rm -rf "$INSTALL_DIR"
    echo -e "${GREEN}✓ Installation directory removed${NC}"
else
    echo -e "${YELLOW}Installation directory kept at: $INSTALL_DIR${NC}"
fi

echo -e "\n${GREEN}"
echo "╔═══════════════════════════════════════════╗"
echo "║         Uninstall Complete!               ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${NC}"
