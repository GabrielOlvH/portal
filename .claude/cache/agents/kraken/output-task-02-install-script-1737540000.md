# Implementation Report: Cross-Platform Install Script
Generated: 2026-01-22T12:00:00Z

## Task
Create cross-platform Node.js installer and uninstaller scripts to replace bash-only install.sh/uninstall.sh with Windows/macOS/Linux support.

## TDD Summary

### Tests Written
Since this is a CLI tool that interacts with the filesystem and system services, the implementation uses exported functions that can be unit tested:
- `detectPlatform()` - Returns platform type and init manager
- `checkPrerequisites()` - Validates required tools are installed
- `createEnvFile()` - Creates .env configuration file

Verification performed:
```bash
# Platform detection test
npx tsx -e "import { detectPlatform } from './scripts/install.ts'; console.log(detectPlatform());"
# Output: { type: 'linux', manager: 'openrc' }

# Prerequisites test
npx tsx -e "import { checkPrerequisites } from './scripts/install.ts'; console.log(checkPrerequisites());"
# Output: { ok: true, missing: [], warnings: [] }

# Uninstall help test
npx tsx scripts/uninstall.ts --help
# Shows usage information
```

### Implementation
- `/home/gabrielolv/Documents/Projects/ter/agent/scripts/install.ts` - Cross-platform installer (706 lines)
- `/home/gabrielolv/Documents/Projects/ter/agent/scripts/uninstall.ts` - Cross-platform uninstaller (220 lines)

## Test Results
- Platform detection: PASS (correctly detects linux/openrc on Gentoo)
- Prerequisites check: PASS (validates git, node >= 18, npm)
- Uninstall CLI: PASS (help flag works correctly)
- Import guard: PASS (module can be imported without running main)

## Changes Made

### New Files
1. `agent/scripts/install.ts`:
   - Platform detection (linux/macos/windows + systemd/openrc/launchd/task-scheduler/manual)
   - Interactive wizard using readline/promises
   - Repository cloning/updating
   - npm install execution
   - .env file generation
   - Service setup for all supported platforms
   - Health check verification

2. `agent/scripts/uninstall.ts`:
   - CLI argument parsing (-y, -r, -h flags)
   - Service stopping for all platforms
   - Optional directory removal
   - Cross-platform PID file cleanup

### Modified Files
1. `agent/package.json`:
   - Added `install-agent` script
   - Added `uninstall-agent` script

## Architecture

```
install.ts
  |-- detectPlatform() -> { type, manager }
  |-- checkPrerequisites() -> { ok, missing, warnings }
  |-- runWizard() -> Config
  |-- cloneOrUpdateRepo()
  |-- installDependencies()
  |-- createEnvFile()
  |-- setupService() -> delegates to:
  |     |-- setupSystemd()
  |     |-- setupOpenRC()
  |     |-- setupLaunchd()
  |     |-- setupTaskScheduler()
  |     |-- startManual()
  |-- verifyRunning()
  |-- printSuccess()
```

## Platform-Specific Details

### Linux - systemd
- Creates user service at `~/.config/systemd/user/bridge-agent.service`
- Enables linger for services to run without login
- Uses `systemctl --user` commands

### Linux - OpenRC
- Creates init script locally at `<install-dir>/agent/bridge-agent.init`
- Provides instructions for system-wide installation (requires sudo)
- Falls back to manual start for immediate use

### macOS - launchd
- Creates plist at `~/Library/LaunchAgents/com.bridge.agent.plist`
- Embeds environment variables directly in plist
- Uses `launchctl load/unload` commands

### Windows - Task Scheduler
- Creates batch file at `<install-dir>/agent/start-agent.bat`
- Sets environment variables in batch
- Creates scheduled task "BridgeAgent" to run at logon
- Uses `schtasks` commands

## Notes
- Uses ANSI colors with automatic detection for non-TTY environments
- Handles Ctrl+C gracefully via readline interface
- Main execution is guarded to allow module imports for testing
- OpenRC path detection checks both `/sbin/openrc-run` and `/sbin/rc-service`
