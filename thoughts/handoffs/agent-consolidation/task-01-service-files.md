# Task 01: Platform-Specific Service Files

## Status: COMPLETED

## Summary

Created platform-specific service definition templates for the Bridge Agent that can be used across different operating systems and init systems.

## Files Created

### 1. `agent/services/bridge-agent.service` (systemd)
- Standard systemd unit file for Linux distributions using systemd
- Features:
  - Starts after network.target
  - Automatic restart on failure with 5-second delay
  - Logs to systemd journal
  - Environment loaded from .env file
  - User-level service (WantedBy=default.target)

### 2. `agent/services/bridge-agent.openrc` (OpenRC)
- OpenRC init script for Gentoo, Alpine, and other OpenRC-based systems
- Features:
  - Uses supervise-daemon supervisor for process management
  - Automatic respawn with 5-second delay
  - Depends on network availability
  - Environment loaded from .env file in start_pre hook
  - Cleanup of pidfile in stop_post

### 3. `agent/services/com.bridge.agent.plist` (macOS launchd)
- macOS launchd property list for LaunchAgents
- Features:
  - Runs at load (login)
  - KeepAlive with crash restart
  - 5-second throttle interval
  - Separate stdout/stderr log files
  - PATH environment variable set

## Placeholder Variables

All service files use `{{PLACEHOLDER}}` syntax for substitution during installation:

| Placeholder | Description |
|------------|-------------|
| `{{INSTALL_DIR}}` | Installation directory (e.g., `$HOME/.bridge-agent`) |
| `{{NODE_PATH}}` | Path to node executable (e.g., `/usr/bin/node`) |
| `{{USER}}` | Username for running the service |

## Usage

The installer script should:
1. Detect the platform/init system
2. Read the appropriate template from `agent/services/`
3. Substitute placeholders with actual values using `sed`:
   ```bash
   sed -e "s|{{INSTALL_DIR}}|$INSTALL_DIR|g" \
       -e "s|{{NODE_PATH}}|$(which node)|g" \
       -e "s|{{USER}}|$USER|g" \
       template.service > output.service
   ```

## Improvements Over Existing Code

The existing `install.sh` has service definitions inline. These templates:
1. Separate concerns - service definitions are now standalone files
2. Enable easier maintenance and updates
3. Allow users to customize templates before installation
4. Support version control of service configurations independently
