---
root_span_id: 70959b85-d283-4189-b3ff-4aa81aa58290
turn_span_id: 01402efe-d54c-4364-9e4b-a3f2cc742983
session_id: 70959b85-d283-4189-b3ff-4aa81aa58290
date: 2026-01-30T18:45:00
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-session-activity-detection.md
---

# Plan Handoff: Improve Session Activity Detection

## Summary

Created a plan to reduce false positive idle detection in tmux session monitoring. The current 2-second threshold is too aggressive - users reading output, running interactive tools like htop, or waiting for builds get incorrectly marked as idle.

## Plan Created

`thoughts/shared/plans/PLAN-session-activity-detection.md`

## Key Technical Decisions

- **5-second threshold**: Increased from 2s to 5s - balance responsiveness and fewer false positives
- **Process whitelist**: Interactive processes (htop, vim, less) never marked idle
- **Hysteresis debounce**: Require sustained inactivity, not momentary pauses
- **In-memory only**: No database changes, keeps current architecture

## Task Overview

1. **Increase idle threshold** - Change `IDLE_STOP_MS` from 2000ms to 5000ms
2. **Interactive process detection** - Whitelist for htop, vim, less, etc.
3. **Hysteresis** - Require 2 consecutive idle checks before transition
4. **Process tree tracking** - Reset timer when child processes change
5. **Agent awareness** - Detect Claude thinking patterns (optional)

## Research Findings

- `detectAgentState` in `agent/src/agents.ts:139-155` is the core logic
- Only signal is screen hash comparison - no other activity indicators
- `IDLE_STOP_MS = 2000` in `agent/src/config.ts:11` (configurable via env)
- `sessionActivity` Map in `agent/src/state.ts:116` tracks only `{hash, lastChangedAt}`
- `pause-monitor.ts:62` requires 30s running before sending idle notification

## Assumptions Made

- Users want longer idle window (5s per user preference)
- Interactive process list is reasonable starting point
- No need for keyboard input tracking (complex tmux integration)
- Hysteresis won't feel sluggish at 2-check requirement

## For Next Steps

- User should review plan at: `thoughts/shared/plans/PLAN-session-activity-detection.md`
- After approval, run `/implement_plan` with the plan path
- Tasks 1-2 provide immediate value, Tasks 3-5 are refinements
