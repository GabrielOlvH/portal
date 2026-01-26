# Task 03: Cross-Platform Update Script

## Status: COMPLETED

## Summary
Created a cross-platform TypeScript update script (`agent/scripts/update.ts`) that replaces the bash-only `update.sh` for better cross-platform support.

## Files Created/Modified

### Created
- `agent/scripts/update.ts` - Cross-platform update script in TypeScript

### Modified
- `agent/src/http/routes/update.ts` - Updated to prefer TypeScript script with bash fallback
- `agent/tsconfig.json` - Added `scripts/**/*.ts` to include paths
- `agent/package.json` - Added `update` script

## Implementation Details

### Features Implemented

1. **Git Operations**
   - Fetch latest from origin (main or master branch detection)
   - Compare local vs remote commits
   - Stash local changes if any exist
   - Pull with rebase
   - Restore stashed changes after update

2. **Dependency Management**
   - Detects changes to `package.json`, `package-lock.json`, or `bun.lockb`
   - Runs `npm install` when dependencies change (with 2 minute timeout)

3. **Platform Detection**
   - `detectInitSystem()` returns one of:
     - `systemd-user` (Linux with user-level systemd)
     - `systemd-system` (Linux with system-level systemd)
     - `openrc` (Alpine Linux, Gentoo)
     - `launchd` (macOS)
     - `task-scheduler` (Windows)
     - `manual` (fallback)

4. **Service Restart** (platform-specific)
   - `restartSystemdUser()` - Uses `systemctl --user`
   - `restartSystemdSystem()` - Uses `systemctl`
   - `restartOpenRC()` - Uses `rc-service` with sudo fallback
   - `restartLaunchd()` - Uses `launchctl kickstart`
   - `restartTaskScheduler()` - Uses `schtasks`
   - `restartManual()` - Kills existing process and spawns new one

5. **Logging**
   - All output prefixed with `[bridge-update]`
   - Shows changed files before update
   - Reports success/failure with version info

6. **Error Handling**
   - Git pull failures restore stashed changes before exiting
   - All errors captured and logged
   - Returns structured `UpdateResult` object

### API Integration

The `POST /update/apply` endpoint now:
1. First looks for `agent/scripts/update.ts`
2. If found, runs with local tsx or falls back to `npx tsx`
3. On Windows, uses shell mode for .cmd script compatibility
4. Falls back to `update.sh` on Linux/macOS if TypeScript script not found
5. Returns appropriate error on Windows if only bash script exists

### Usage

```bash
# Direct execution
cd agent && npm run update

# Or via tsx
npx tsx scripts/update.ts [install-dir]

# Via API
curl -X POST http://localhost:3000/update/apply
```

## Testing Notes

- TypeScript compilation passes with project tsconfig
- Script can be run standalone with `npx tsx scripts/update.ts`
- API endpoint tested to prefer TS script with bash fallback

## Dependencies

Uses only Node.js built-in modules:
- `node:child_process` (execFile, spawn)
- `node:fs` (existsSync, readFileSync, writeFileSync, unlinkSync)
- `node:util` (promisify)
- `node:path`
- `node:os`

## Checkpoints

- [x] Phase 1: Created update.ts with git operations
- [x] Phase 2: Added platform detection and service restart
- [x] Phase 3: Integrated with update routes
- [x] Phase 4: Added npm script and documentation

## Next Steps

- Can deprecate `update.sh` once TypeScript version is verified stable
- Consider adding progress callbacks for UI feedback
- Consider adding rollback capability on failure
