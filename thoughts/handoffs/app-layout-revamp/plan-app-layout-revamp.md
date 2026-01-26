---
date: 2026-01-23T12:30:00Z
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-app-layout-revamp.md
---

# Plan Handoff: App Layout Revamp - Projects Tab & Docker Integration

## Summary
Plan to revamp the app's tab layout by replacing the Docker tab with an enhanced Projects tab, and moving Docker functionality into host detail pages. The new Projects tab will feature Recent Launches, Open Sessions, and an improved Projects list with quick-launch capabilities.

## Plan Created
`thoughts/shared/plans/PLAN-app-layout-revamp.md`

## Key Technical Decisions
- **Tab replacement over addition**: Replace Docker tab with Projects (keep 4 tabs) rather than adding a 5th tab
- **Inline Docker on host pages**: Docker containers shown directly on host detail pages rather than a separate tab
- **Three-section Projects layout**: Recent Launches + Open Sessions + Projects List for comprehensive project management
- **Leverage existing hooks**: Use `useProjects()`, `useHostsLive()`, and `useDocker()` hooks rather than building new state management

## Task Overview
1. **Update Tab Configuration** - Replace Docker → Projects in `_layout.tsx`
2. **Rename Tab File** - Delete docker.tsx, create projects.tsx
3. **Enhance Host Detail** - Add inline Docker section with containers list
4. **Build Projects Tab** - Three sections: Recent, Open Sessions, Projects
5. **Update More Tab** - Remove Projects MenuItem (now main tab)
6. **Add Quick Launch** - Launch buttons on project cards with LaunchSheet
7. **Update Navigation** - Fix any Docker tab references

## Research Findings
- Docker tab (`app/(tabs)/docker.tsx:561 lines`) aggregates containers across ALL hosts - this cross-host view will be lost (acceptable tradeoff)
- Host detail page (`app/hosts/[id]/index.tsx:662 lines`) already has "Docker" link in header at line 263
- Container detail routes exist at `app/hosts/[id]/docker/[containerId]/` - these remain unchanged
- Projects store (`lib/projects-store.tsx`) already has `recentLaunches` state and `addRecentLaunch()`
- LaunchSheet (`components/LaunchSheet.tsx`) already uses `addRecentLaunch` on successful launches

## Assumptions Made
- Users primarily access Docker for a specific host, not cross-host container management - verify before implementation
- RecentLaunches data is populated (may need empty state handling)
- The `useDocker(host)` hook exists for single-host Docker queries (need to verify in `lib/docker-hooks.ts`)

## For Next Steps
- User should review plan at: `thoughts/shared/plans/PLAN-app-layout-revamp.md`
- After approval, run `/implement_plan` with the plan path
- Research validation will occur before implementation
