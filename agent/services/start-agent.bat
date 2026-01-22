@echo off
REM Bridge Agent Startup Script for Windows Task Scheduler
REM This file is a template - placeholders will be replaced during installation

cd /d "{{INSTALL_DIR}}\agent"
set NODE_ENV=production
set BRIDGE_INSTALL_DIR={{INSTALL_DIR}}
set TMUX_AGENT_PORT={{PORT}}
set TMUX_AGENT_HOST={{HOST_LABEL}}
set TMUX_AGENT_TOKEN={{AUTH_TOKEN}}
set TMUX_AGENT_SOCKET={{TMUX_SOCKET}}
set TMUX_AGENT_USAGE_POLL_MS=60000
set TMUX_AGENT_TOKEN_POLL_MS=180000

"{{NODE_PATH}}" "{{INSTALL_DIR}}\agent\node_modules\.bin\tsx.cmd" "{{INSTALL_DIR}}\agent\src\index.ts"
