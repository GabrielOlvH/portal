---
date: 2026-01-22T14:30:00
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-agent-process-consolidation.md
---

# Plan Handoff: Agent Process Consolidation (Cross-Platform)

## Summary

Created a comprehensive cross-platform plan to consolidate the Bridge Agent into a proper system service with auto-restart, auto-start on boot, and in-app management. Covers Linux (systemd + OpenRC), macOS (launchd), and Windows (Task Scheduler).

## Plan Created

`thoughts/shared/plans/PLAN-agent-process-consolidation.md`

## Key Technical Decisions

| Platform | Service Manager | Rationale |
|----------|-----------------|-----------|
| Linux (systemd) | systemd user service | Native, well-supported |
| Linux (OpenRC) | supervise-daemon | Built-in auto-restart |
| macOS | launchd user agent | Native, no signing needed |
| Windows | Task Scheduler | No admin required, no deps |

## Task Overview

| # | Task | Scope |
|---|------|-------|
| 1 | Service files | Create templates for all 4 platforms |
| 2 | Install script | Cross-platform Node.js installer |
| 3 | Update script | Cross-platform Node.js updater |
| 4 | Service API | `/service/status`, `/restart`, `/logs` |
| 5 | App UI | Service status card, controls |
| 6 | npm scripts | `install-service`, `uninstall-service` |
| 7 | Windows impl | Task Scheduler integration |
| 8 | Documentation | INSTALL.md with all platforms |

## Research Findings

### Already Working:
- Update check/apply API (`agent/src/http/routes/update.ts`)
- App update polling UI (`app/(tabs)/hosts.tsx`)
- Basic install.sh with systemd/OpenRC detection

### Needs Implementation:
- macOS launchd support (missing entirely)
- Windows support (missing entirely)
- OpenRC auto-restart (supervise-daemon not used)
- Service management API (status, logs)
- Cross-platform scripts (currently bash-only)

## Assumptions Made

- Node.js and npm are already installed on target systems
- Users can install to their home directory without root
- OpenRC systems can use sudo for service installation
- Windows users have Task Scheduler access

## For Next Steps

- User should review plan at: `thoughts/shared/plans/PLAN-agent-process-consolidation.md`
- After approval, run `/implement_plan` with the plan path
- Test on each platform after implementation
