# Task 02: Cross-Platform Install Script

**Status:** COMPLETED
**Date:** 2026-01-22

## Summary

Created cross-platform Node.js installer and uninstaller scripts to replace the bash-only install.sh and uninstall.sh. These scripts support Windows, macOS, and Linux with automatic detection of init systems.

## Files Created

### `/home/gabrielolv/Documents/Projects/ter/agent/scripts/install.ts`
Cross-platform installer with:
- **Platform detection**: Detects OS (linux/macos/windows) and init system (systemd/openrc/launchd/task-scheduler/manual)
- **Interactive wizard**: Prompts for install directory, port, host label, auth token, tmux socket
- **Prerequisite checking**: Validates git, node >= 18, npm are available
- **Template substitution**: Creates .env file with configuration
- **Service installation**:
  - systemd: User service at `~/.config/systemd/user/bridge-agent.service`
  - OpenRC: Init script at install-dir with instructions for system-wide install
  - launchd: Plist at `~/Library/LaunchAgents/com.bridge.agent.plist`
  - Windows: Scheduled task "BridgeAgent" with start batch file
  - Manual: Detached process with PID file
- **Verification**: Checks service is running via HTTP health endpoint

### `/home/gabrielolv/Documents/Projects/ter/agent/scripts/uninstall.ts`
Cross-platform uninstaller with:
- **CLI options**: `-y/--yes` (skip prompts), `-r/--remove-files` (remove install dir), `-h/--help`
- **Service removal** for all supported managers
- **Optional directory cleanup**

## Files Modified

### `/home/gabrielolv/Documents/Projects/ter/agent/package.json`
Added npm scripts:
```json
"install-agent": "tsx scripts/install.ts",
"uninstall-agent": "tsx scripts/uninstall.ts"
```

### `/home/gabrielolv/Documents/Projects/ter/agent/tsconfig.json`
Extended include to cover scripts directory (already done by another task).

## Platform Support Matrix

| Platform | Init System | Installation Method |
|----------|-------------|---------------------|
| Linux | systemd | User service with linger |
| Linux | OpenRC | Init script + manual instructions |
| Linux | other | Manual background process |
| macOS | launchd | Launch agent plist |
| Windows | Task Scheduler | Scheduled task + batch file |

## Usage

```bash
# Install
cd agent
npx tsx scripts/install.ts

# Or via npm
npm run install-agent

# Uninstall
npx tsx scripts/uninstall.ts
npm run uninstall-agent

# Uninstall non-interactive
npx tsx scripts/uninstall.ts -y -r
```

## Exports for Testing

The install.ts exports key functions for unit testing:
- `detectPlatform(): Platform`
- `checkPrerequisites(): { ok: boolean; missing: string[]; warnings: string[] }`
- `createEnvFile(installDir: string, config: Config): void`

## Verification

```bash
# Test platform detection
npx tsx -e "import { detectPlatform } from './scripts/install.ts'; console.log(detectPlatform());"

# Test prerequisites check
npx tsx -e "import { checkPrerequisites } from './scripts/install.ts'; console.log(checkPrerequisites());"

# Test uninstall help
npx tsx scripts/uninstall.ts --help
```

## Notes

- The scripts use Node.js readline/promises for cross-platform interactive input
- ANSI colors are automatically disabled when not running in a TTY
- The main() function is guarded to only run when executed directly (not when imported)
- OpenRC setup requires manual sudo commands for system-wide installation
- Windows Task Scheduler creates a batch file to set environment variables before running
