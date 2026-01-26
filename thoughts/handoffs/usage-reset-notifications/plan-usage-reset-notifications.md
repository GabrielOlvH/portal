---
date: 2026-01-25T12:00:00Z
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-usage-reset-notifications.md
---

# Plan Handoff: Usage Limit Reset Push Notifications

## Summary

Created a plan to add push notifications that alert users when their AI provider usage limits reset (Claude, Cursor, Codex, Copilot).

## Plan Created

`thoughts/shared/plans/PLAN-usage-reset-notifications.md`

## Key Technical Decisions

- **Server-side detection**: Reuse the existing pause-monitor pattern - agent server polls usage and detects resets, then pushes notifications
- **Threshold-based**: Only notify when usage was below 50% before reset (avoid spamming users who weren't limited)
- **Per-provider tracking**: Track each provider's session/weekly windows independently
- **Existing infrastructure**: Leverage existing Expo Push setup, no new dependencies

## Task Overview

1. **Create Reset Monitor Module** - New `agent/src/notifications/reset-monitor.ts` following pause-monitor pattern
2. **Define Reset Detection Logic** - Parse reset times, detect actual resets vs time updates
3. **Integrate with Server Startup** - Add new interval in `agent/src/index.ts`
4. **Add Configuration** - New env vars for interval and threshold
5. **Create Notification Channel** - Optional: Separate Android channel for reset alerts
6. **Add Unit Tests** - Test reset detection logic

## Research Findings

### Usage Tracking (✓ VERIFIED at `agent/src/usage.ts`):
- Polls 4 providers every 60s
- Each returns `UsageWindow` with `percentLeft` (0-100) and `reset` (timestamp/relative)
- Reset field examples:
  - Claude OAuth: ISO timestamp `"2026-01-25T17:00:00Z"`
  - Claude CLI: relative `"5h 30m"`
  - Cursor: `billingCycleEnd` timestamp

### Notification Infrastructure (✓ VERIFIED):
- `agent/src/notifications/push.ts` - `sendExpoPushMessages()` to Expo service
- `agent/src/notifications/registry.ts` - Device storage with `expoPushToken`
- `agent/src/notifications/pause-monitor.ts` - Pattern to follow (polls, detects transitions, sends)
- Channel ID `task-updates` already exists

### State Types (✓ VERIFIED at `agent/src/state.ts`):
```typescript
type UsageWindow = {
  percentLeft?: number;
  reset?: string;  // ISO timestamp or relative time
  windowMinutes?: number;
};
```

## Assumptions Made

- **Assumption 1**: 60-second polling is frequent enough to catch resets - verify this works in practice
- **Assumption 2**: Reset time changes indicate actual resets (not just API returning different format) - may need tuning
- **Assumption 3**: Users want notifications for all providers they have configured - no per-provider preferences

## For Next Steps

- User should review plan at: `thoughts/shared/plans/PLAN-usage-reset-notifications.md`
- After approval, run `/implement_plan` with the plan path
- Consider if 50% threshold is the right default (configurable via env var)
