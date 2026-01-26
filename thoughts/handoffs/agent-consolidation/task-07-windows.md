# Task 07: Windows-Specific Implementation

## Summary

Enhanced Windows support with Task Scheduler integration verification and bug fixes.

## Findings

### 1. Windows Install Logic (VERIFIED)

**File:** `agent/scripts/install.ts` (lines 443-485)

The Windows Task Scheduler setup is properly implemented:
- Creates `start-agent.bat` batch file with environment variables
- Uses `schtasks /create /tn "BridgeAgent" /tr "<batch>" /sc onlogon /rl highest /f`
- Task runs at logon with highest privileges
- Task is started immediately after creation with `schtasks /run`

### 2. Windows Batch File Template (CREATED)

**File:** `agent/services/start-agent.bat`

Created a template batch file to match the patterns of other service files (systemd, launchd, openrc). This provides a reference for the Windows startup script structure.

### 3. Windows Update Logic (VERIFIED)

**File:** `agent/scripts/update.ts` (lines 169-179)

The `restartTaskScheduler()` function correctly:
- Ends the running task with `schtasks /end /tn "BridgeAgent"`
- Starts the task with `schtasks /run /tn "BridgeAgent"`
- Falls back to manual restart if Task Scheduler fails

### 4. Windows Service Status (FIXED)

**File:** `agent/src/http/routes/service.ts`

**Bug Found:** Task name mismatch between install scripts and service routes.

| Component | Task Name Used | Correct? |
|-----------|---------------|----------|
| install.ts | "BridgeAgent" | Yes |
| uninstall.ts | "BridgeAgent" | Yes |
| update.ts | "BridgeAgent" | Yes |
| service.ts | "bridge-agent" (SERVICE_NAME) | **NO** |

**Fix Applied:**
- Added `WINDOWS_TASK_NAME = 'BridgeAgent'` constant
- Updated `getTaskSchedulerStatus()` to use `WINDOWS_TASK_NAME`
- Updated `restartService()` task-scheduler case to use `WINDOWS_TASK_NAME`

### 5. Windows Uninstall (VERIFIED)

**File:** `agent/scripts/uninstall.ts` (lines 159-188)

The `stopTaskScheduler()` function correctly:
- Ends the running task with `schtasks /end /tn "BridgeAgent"`
- Deletes the task with `schtasks /delete /tn "BridgeAgent" /f`
- Removes the `start-agent.bat` file

### 6. Windows Log Retrieval (VERIFIED)

**File:** `agent/src/http/routes/service.ts` (lines 374-402)

The `getWindowsLogs()` function:
- Attempts to read from Windows Event Log via `wevtutil`
- Falls back to log file in install directory
- Returns structured log data

## Changes Made

### Modified Files

1. **agent/src/http/routes/service.ts**
   - Added `WINDOWS_TASK_NAME = 'BridgeAgent'` constant (line 13)
   - Fixed `getTaskSchedulerStatus()` to use correct task name (line 212)
   - Fixed `restartService()` task-scheduler case (lines 473, 475)

### New Files

1. **agent/services/start-agent.bat**
   - Windows batch file template for Task Scheduler
   - Uses placeholder variables matching other service templates

## Test Considerations

Windows-specific testing would require:
1. Windows environment with Node.js installed
2. Administrative privileges for Task Scheduler operations
3. Verification of task creation, start, stop, status check, and removal

## Notes

- The task runs at user logon, not at system boot
- Highest privileges (`/rl highest`) ensure proper permissions
- No restart-on-failure is configured in Task Scheduler (unlike systemd)
- For true restart-on-failure, a wrapper could be created using Task Scheduler's built-in retry options

## Recommendations

1. Consider adding Task Scheduler restart settings for reliability:
   ```
   schtasks /create ... /ri 1 /du 9999:59
   ```
   This would restart the task every minute indefinitely if it fails.

2. Consider using Windows Service wrapper (like node-windows or nssm) for production deployments instead of Task Scheduler for better reliability.
