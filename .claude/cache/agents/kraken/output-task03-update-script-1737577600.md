# Implementation Report: Cross-Platform Update Script
Generated: 2026-01-22T14:20:00Z

## Task
Create a cross-platform Node.js update script that replaces the bash-only `update.sh`.

## TDD Summary

### Tests Written
No formal test framework exists in this project. Verification was done through:
- TypeScript compilation checks
- Manual verification of exported function signatures
- Comparison with bash script functionality

### Implementation

#### New File: `/home/gabrielolv/Documents/Projects/ter/agent/scripts/update.ts`

**Key exports:**
```typescript
export async function update(installDir?: string): Promise<UpdateResult>
```

**UpdateResult interface:**
```typescript
interface UpdateResult {
  success: boolean;
  message: string;
  previousVersion?: string;
  newVersion?: string;
  changedFiles?: string[];
  error?: string;
}
```

**Platform detection:**
```typescript
type InitSystem = 'systemd-user' | 'systemd-system' | 'openrc' | 'launchd' | 'task-scheduler' | 'manual';

async function detectInitSystem(): Promise<InitSystem>
```

**Service restart functions:**
- `restartSystemdUser()` - Linux systemd user services
- `restartSystemdSystem()` - Linux systemd system services
- `restartOpenRC()` - OpenRC (Gentoo, Alpine)
- `restartLaunchd()` - macOS launchd
- `restartTaskScheduler()` - Windows Task Scheduler
- `restartManual()` - PID file based fallback

#### Modified: `/home/gabrielolv/Documents/Projects/ter/agent/src/http/routes/update.ts`

Added logic to prefer TypeScript script over bash:
```typescript
// Prefer TypeScript script (cross-platform)
const tsScript = path.join(installDir, 'agent', 'scripts', 'update.ts');
const bashScript = path.join(installDir, 'agent', 'update.sh');

if (existsSync(tsScript)) {
  // Use npx tsx for cross-platform execution
  // ...
}
// Fall back to bash script (Linux/macOS only)
```

#### Modified: `/home/gabrielolv/Documents/Projects/ter/agent/tsconfig.json`

Added scripts directory to includes:
```json
"include": ["src/**/*.ts", "src/**/*.d.ts", "scripts/**/*.ts"],
```

#### Modified: `/home/gabrielolv/Documents/Projects/ter/agent/package.json`

Added update npm script:
```json
"scripts": {
  "update": "tsx scripts/update.ts"
}
```

## Test Results
- TypeScript compilation: PASS (no errors for update.ts)
- Route integration: PASS (no errors for update routes)

## Changes Made

1. **Created `/home/gabrielolv/Documents/Projects/ter/agent/scripts/update.ts`**
   - 435 lines of TypeScript
   - Full port of update.sh functionality
   - Added Windows and macOS support
   - Structured return type for API integration

2. **Updated `/home/gabrielolv/Documents/Projects/ter/agent/src/http/routes/update.ts`**
   - Added TypeScript script detection
   - Added platform-aware execution (shell mode on Windows)
   - Maintained bash fallback for backward compatibility

3. **Updated `/home/gabrielolv/Documents/Projects/ter/agent/tsconfig.json`**
   - Added `scripts/**/*.ts` to include paths

4. **Updated `/home/gabrielolv/Documents/Projects/ter/agent/package.json`**
   - Added `npm run update` script

## Architecture

```
POST /update/apply
    |
    v
resolveInstallDir()
    |
    v
[Check for scripts/update.ts]
    |
    +-- Yes --> spawn tsx scripts/update.ts
    |               |
    |               v
    |           update()
    |               |
    |               +-- determineBranch() -> 'main' | 'master'
    |               +-- getCurrentAndRemoteCommits()
    |               +-- getChangedFiles()
    |               +-- stashChanges() (if dirty)
    |               +-- pullChanges() (git pull --rebase)
    |               +-- restoreStash() (if stashed)
    |               +-- installDependencies() (if package*.json changed)
    |               +-- detectInitSystem()
    |               +-- restartService()
    |               |
    |               v
    |           UpdateResult { success, message, versions, files }
    |
    +-- No --> [Check for update.sh]
                   |
                   +-- Yes (Linux/macOS) --> spawn bash update.sh
                   +-- No (Windows) --> Error
```

## Notes

- The update script uses only Node.js built-in modules for maximum compatibility
- Execution timeout is 30 seconds for most git operations, 120 seconds for npm install
- The script can be run directly via CLI or imported as a module
- PID files are stored in os.tmpdir() for cross-platform compatibility
