# Task 05: Service Management UI

## Status: COMPLETE

## Summary

Added service status display and management controls to the mobile app host detail screen.

## Changes

### API Layer (`lib/api.ts`)

Added three new API functions:
- `getServiceStatus(host)` - GET /service/status
- `restartService(host)` - POST /service/restart
- `getServiceLogs(host, lines?)` - GET /service/logs?lines=N

Added two new types:
- `ServiceStatus` - status, pid, uptimeSeconds, platform, initSystem, autoRestart, version, installDir
- `ServiceLogs` - lines[], source

### UI Layer (`app/hosts/[id]/index.tsx`)

Added a "Service" section that shows:
- Status badge (Running/Stopped/Unknown) with color coding
- Uptime display
- Version number
- Platform and init system (e.g., "linux (systemd)")
- PID
- Auto-restart indicator
- Restart button with confirmation dialog

## Error Handling

- 404 from old agents: "Service info unavailable"
- Restart failure: Alert with error message
- Loading state: "Loading service status..."

## Testing

- TypeScript type checking: PASS
- Linting: PASS

## Files Modified

- `/home/gabrielolv/Documents/Projects/ter/lib/api.ts`
- `/home/gabrielolv/Documents/Projects/ter/app/hosts/[id]/index.tsx`

## Dependencies

- Depends on Task 4 (backend API endpoints) being implemented
- Uses existing UI components: Card, Pill, SectionHeader, AppText

## Next Steps

- Task 4 must implement the backend endpoints for this UI to function
- Consider adding a "View logs" button in future iteration
