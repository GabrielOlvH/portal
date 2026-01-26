---
date: 2026-01-25T14:30:00Z
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-dynamic-terminal-names.md
---

# Plan Handoff: Dynamic Terminal Names with Title Bar

## Summary
Plan to show terminal title bar content in session labels (e.g., `vim - myfile.ts` instead of `session-l8k3j2n9`). Uses tmux `#{pane_title}` which captures what processes set via escape sequences.

## Plan Created
`thoughts/shared/plans/PLAN-dynamic-terminal-names.md`

## Key Technical Decisions
- **Data Source**: `#{pane_title}` from tmux - the actual terminal title bar
- **No tmux rename**: Keep original session name for routing/WebSocket stability, only change display
- **Default filtering**: Filter out hostname/shell defaults - only show meaningful titles
- **Simple display**: Show `title || name` - title when set, fall back to session name

## Task Overview
1. Add `title` field to Session type
2. Query `pane_title` from tmux
3. Include title in session API response
4. Update SessionCard component
5. Update home screen session display
6. Update terminal screen labels
7. Update session detail screen

## Research Findings
- `#{pane_title}` returns the terminal title set by processes
- Many CLIs set this: vim (`vim - filename`), htop, npm, Claude Code
- Title is set via escape sequences: `\e]0;My Title\a`
- Current session listing only queries session metadata, not pane info

## Assumptions Made
- Title updates via existing polling frequency (~5 seconds) is acceptable
- Filtering defaults (hostname, shell name) won't hide useful titles

## Risks

### Tigers:
- **Title query latency** (LOW)
  - Mitigation: Query in parallel with existing operations

### Elephants:
- **Long titles** (LOW)
  - Note: `numberOfLines={1}` handles truncation

## For Next Steps
- User should review plan at: `thoughts/shared/plans/PLAN-dynamic-terminal-names.md`
- After approval, run `/implement_plan` with the plan path
- Tasks 4-7 can run after Tasks 1-3
