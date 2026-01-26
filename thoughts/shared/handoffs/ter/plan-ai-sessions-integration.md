---
date: 2026-01-21T15:45:00Z
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-ai-sessions-integration.md
---

# Plan Handoff: AI Sessions Integration with Projects

## Summary
Integrate AI Sessions into the Project flow via LaunchSheet - show related AI sessions when selecting a project, with resume capability.

## Plan Created
`thoughts/shared/plans/PLAN-ai-sessions-integration.md`

## Key Technical Decisions
- **Integration Point**: LaunchSheet CommandStep shows AI sessions alongside npm scripts
- **Matching Logic**: `session.directory.startsWith(project.path)`
- **No new tabs**: Uses existing LaunchSheet pattern + More tab entry

## Task Overview (4 tasks)
1. **Add AI Sessions to CommandStep** - Show recent sessions for selected project in LaunchSheet
2. **Session Count Badge** - Display AI session count on project cards
3. **Projects Screen Integration** - Show AI activity in main Projects list
4. **Directory Filter Support** - Allow pre-filtered navigation to AI Sessions screen

## UX Flow
```
LaunchSheet opens
  → Select Host
  → Select Project (shows session count badge)
  → CommandStep shows:
      - npm scripts
      - Recent AI Sessions (3-5 with resume button)
      - Snippets
```

## Research Findings
- LaunchSheet is multi-step: Host → Project → Command (components/LaunchSheet.tsx:~600 lines)
- AI Sessions have `directory` field that maps to project `path`
- Resume API exists: `resumeAiSession(host, provider, id)`
- Can fetch sessions filtered by path in API call

## For Next Steps
- Review plan at: `thoughts/shared/plans/PLAN-ai-sessions-integration.md`
- Start with Task 1 (LaunchSheet integration) as it's the core feature
