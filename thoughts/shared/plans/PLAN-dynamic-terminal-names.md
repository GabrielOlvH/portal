# Plan: Dynamic Terminal Names with Title Bar

## Goal
Add dynamic terminal naming that:
1. Shows the terminal title bar content set by processes (e.g., `vim - myfile.ts`, `npm run dev`)
2. Updates session display in real-time as processes set their titles
3. Preserves the original session identifier for routing while showing the title

## Technical Choices
- **Data Source**: `#{pane_title}` from tmux - captures what processes set via `\e]0;title\a` escape sequences
- **Display Strategy**: Show title as primary when set, fall back to session name
- **Update Mechanism**: Add `pane_title` to existing tmux queries during session listing
- **Storage**: Add `title` field to Session type

## Current State Analysis

### How Sessions Work Now:
1. **Session Creation** (`components/LaunchSheet.tsx:816,845,863`):
   - Project launch: `${projectName}-${timestamp}` (e.g., `myapp-l8k3j2n9`)
   - Blank session: `session-${timestamp}` (e.g., `session-l8k3j45x`)

2. **Session Display** (`components/SessionCard.tsx:89-90`):
   - Shows `session.name` directly in UI
   - Already shows `session.insights?.meta?.agentCommand` as secondary info

3. **Session Listing** (`agent/src/sessions.ts:3-9`):
   ```typescript
   // Current query - no pane_title
   '#{session_name}||#{session_windows}||#{session_created}||#{session_attached}||#{session_last_attached}'
   ```

4. **Session Type** (`lib/types.ts:14-22`):
   ```typescript
   export type Session = {
     name: string;
     windows: number;
     attached: boolean;
     createdAt?: number;
     lastAttached?: number;
     preview?: string[];
     insights?: SessionInsights;
   };
   ```

### Terminal Title in tmux:
- `#{pane_title}` - returns the title set by processes via escape sequences
- Many CLIs set this: vim, htop, npm, node, etc.
- Example: vim sets title to `vim - filename.ts`

### Key Files:
- `lib/types.ts` - Session type definition
- `agent/src/sessions.ts` - Session listing with tmux query
- `agent/src/http/sessions.ts` - fetchSessions logic
- `components/SessionCard.tsx` - Main session display component
- `app/(tabs)/index.tsx` - Home screen session list
- `app/session/[hostId]/[name]/terminal.tsx` - Terminal screen with session pager

## Tasks

### Task 1: Add `title` to Session Type
Extend the Session type to include the terminal title.

- [x] Add `title?: string` field to Session type in `lib/types.ts`

**Files to modify:**
- `lib/types.ts`

### Task 2: Query `pane_title` from tmux
Add terminal title to the session listing query.

- [x] Create new function to get pane title for a session
- [x] Query tmux with `list-panes -t <session> -F '#{pane_title}'`
- [x] Return empty/null if title equals hostname or default shell prompt

**Files to modify:**
- `agent/src/sessions.ts`

### Task 3: Include Title in Session Response
Include the pane title in the session list API response.

- [x] Modify `fetchSessions` to include title from pane query
- [x] Run title queries in parallel with existing preview/insights

**Files to modify:**
- `agent/src/http/sessions.ts`

### Task 4: Update SessionCard to Show Title
Show title as primary display when available.

- [x] Display `session.title || session.name` as the session label
- [x] Optionally show original name as secondary if title is set

**Files to modify:**
- `components/SessionCard.tsx`

### Task 5: Update Home Screen Session Display
Update the inline session display on the home screen.

- [x] Show `session.title || session.name` in the session list

**Files to modify:**
- `app/(tabs)/index.tsx` (line ~577 where `{session.name}` is displayed)

### Task 6: Update Terminal Screen Labels
Update session labels in the terminal pager view.

- [x] Show title in page labels when available
- [x] Update session-related alerts to show title

**Files to modify:**
- `app/session/[hostId]/[name]/terminal.tsx` (line ~531)

### Task 7: Update Session Detail Screen
Update the session detail/rename screen.

- [x] Show title in header when available
- [x] Keep original name in rename field (title is read-only, set by processes)

**Files to modify:**
- `app/session/[hostId]/[name]/index.tsx`

## Success Criteria

### Automated Verification:
- [x] TypeScript compiles: `pnpm typecheck` (no new errors introduced)
- [x] Linting passes: `pnpm lint` (0 errors, only pre-existing warnings)

### Manual Verification:
- [ ] Create a session and run `vim myfile.ts` - shows `vim - myfile.ts` (vim's title)
- [ ] Exit vim back to shell - reverts to session name
- [ ] Run `htop` - shows `htop` (htop sets its title)
- [ ] Run Claude Code - shows the title it sets
- [ ] Session list on home screen shows titles
- [ ] Terminal pager labels show titles
- [ ] Rename still works (uses original session name)

## Out of Scope
- Renaming the actual tmux session (would break WebSocket connections)
- Custom title formatting/transformation
- Title history

## Implementation Notes

Terminal title is set by processes using escape sequences:
- `\e]0;My Title\a` - sets both window and icon title
- `\e]2;My Title\a` - sets window title only

Many CLIs set this automatically:
- **vim**: `vim - filename`
- **htop**: `htop`
- **npm**: shows the running script
- **Claude Code**: sets custom title during operations

The tmux `#{pane_title}` variable captures whatever the process sets. If nothing sets it, it defaults to the shell name or hostname.

**Filtering defaults**: We should filter out common defaults like:
- Just the hostname
- Just `bash`, `zsh`, etc.
- Empty strings

This avoids showing useless info when no real title is set.
