# Plan: AI Sessions Integration with Projects

## Goal
Integrate AI Sessions into the Project flow so users see related AI sessions when working with a project:
1. Show AI session count/badge on project cards
2. Display recent AI sessions for a project in LaunchSheet command step
3. Allow resuming AI sessions directly from the project flow
4. Keep AI Sessions accessible via More tab for full browsing

## Technical Choices
- **Integration Point**: LaunchSheet CommandStep - show AI sessions alongside npm scripts
- **Matching Logic**: Match `AiSession.directory` to `Project.path` (contains/prefix match)
- **Resume Flow**: Resume action creates tmux session and runs resume command
- **Navigation**: Keep full AI Sessions screen in More tab for power users

## Current State Analysis

### LaunchSheet Flow:
```
Step 0: Select Host
Step 1: Select Project (or Blank Session)
Step 2: Select Command → shows npm scripts + snippets
```

### AI Sessions Data:
- `AiSession.directory` - absolute path where session ran
- `AiSession.provider` - claude/codex/opencode
- `AiSession.summary` - first message or auto-summary
- Resume via `resumeAiSession(host, provider, id)`

### Projects Data:
- `Project.path` - absolute path on host
- `Project.hostId` - which host

### Key Files:
- `components/LaunchSheet.tsx` - Multi-step launch wizard
- `app/ai-sessions/index.tsx` - Full AI sessions list
- `lib/api.ts` - API functions including `getAiSessions`, `resumeAiSession`
- `lib/types.ts` - Type definitions

## Tasks

### Task 1: Add AI Sessions to CommandStep
Modify the LaunchSheet to show AI sessions for the selected project.

- [ ] Fetch AI sessions filtered by project directory when project selected
- [ ] Add "Recent AI Sessions" section in CommandStep above/below commands
- [ ] Show 3-5 most recent sessions with provider icon, summary, timestamp
- [ ] Add resume button that calls `resumeAiSession` and navigates to terminal

**Files to modify:**
- `components/LaunchSheet.tsx`

### Task 2: Add Session Count Badge to Project Cards
Show how many AI sessions exist for each project.

- [ ] Create hook `useProjectAiSessionCounts(hostId, projects)`
- [ ] Fetch AI sessions and match to project paths
- [ ] Display badge/count on project chips in LaunchSheet
- [ ] Cache counts to avoid repeated API calls

**Files to modify:**
- `components/LaunchSheet.tsx` - ProjectStep component
- `lib/api.ts` - add helper for directory-filtered sessions

### Task 3: Add AI Sessions Section to Projects List Screen
Show AI session activity in the main Projects screen.

- [ ] Add expandable "Recent AI Activity" row per project
- [ ] Show last 2-3 sessions inline with quick resume
- [ ] Add "View All" link to filtered AI Sessions screen

**Files to modify:**
- `app/projects/index.tsx`

### Task 4: Support Directory Filter in AI Sessions Screen
Allow navigating to AI Sessions pre-filtered by directory.

- [ ] Add `directory` query param support to AI Sessions screen
- [ ] Pre-filter and highlight when coming from project context
- [ ] Update search to also filter by directory match

**Files to modify:**
- `app/ai-sessions/index.tsx`

## Success Criteria

### Automated Verification:
- [ ] TypeScript: `pnpm typecheck` passes
- [ ] Lint: `pnpm lint` passes

### Manual Verification:
- [ ] LaunchSheet shows AI sessions for selected project
- [ ] Can resume AI session directly from LaunchSheet
- [ ] Project cards show session count badge
- [ ] Projects screen shows recent AI activity per project
- [ ] Can navigate from project to filtered AI sessions list

## Out of Scope
- New tab for AI Sessions (using existing More menu entry)
- AI session creation (just browsing/resuming)
- Multi-host AI session aggregation

## Risks (Pre-Mortem)

### Tigers:
- **Path matching accuracy** (MEDIUM)
  - Session directory may be subdirectory of project path
  - Mitigation: Use `session.directory.startsWith(project.path)` or contains

- **API latency** (LOW)
  - Fetching sessions on every project select could feel slow
  - Mitigation: Cache session data, fetch in background

### Elephants:
- **Empty states** (LOW)
  - Project may have no AI sessions yet
  - Note: Show helpful empty state "No AI sessions for this project"
