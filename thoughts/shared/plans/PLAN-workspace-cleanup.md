# Plan: Workspace Cleanup - Remove Old Screen System

## Goal

When opening a new session (via LaunchSheet), the app navigates to the old standalone terminal screen (`app/session/[hostId]/[name]/terminal`) instead of staying in the workspace pager. The user has to manually go back to use the new niri-style tiling. This plan removes all unused old code and rewires session creation to work within the workspace system.

## Root Cause

`LaunchSheet.tsx` calls `router.push('/session/.../terminal')` which pushes a **Stack screen** on top of the workspace pager. The workspace system already has `SessionTerminalPage` (the workspace-native terminal component) and auto-assigns new sessions to the active workspace via `useWorkspaceState`. The old navigation just needs to be removed — the workspace auto-assignment already handles it.

## Current State Analysis

### What's NEW (keep):
- `app/(tabs)/index.tsx` — Main workspace pager (2D grid: vertical workspaces, horizontal windows)
- `components/workspace/SessionTerminalPage.tsx` — Terminal component for workspace windows
- `components/workspace/WorkspacePager.tsx` — Horizontal pager per workspace
- `components/workspace/WorkspaceIndicator.tsx` — Right-side dot navigator
- `components/workspace/LaunchpadPage.tsx` — "+" page at end of each workspace
- `components/workspace/BrowserPage.tsx` — Browser window type
- `components/workspace/WindowPage.tsx` — Embeds tab screens as workspace windows
- `lib/useWorkspaceState.ts` — Workspace state, persistence, session reconciliation
- `lib/workspace-types.ts` — Window, Workspace types

### What's OLD (remove):
- `app/session/[hostId]/[name]/terminal.tsx` (1075 lines) — Old standalone terminal screen with its own pager, header, helper bar. Comment at line 123 says: *"This screen is kept for deep link compatibility... TODO: redirect to main pager"*
- `app/session/[hostId]/[name]/index.tsx` (295 lines) — Old session detail/management screen (rename, kill, status). These actions should be accessible via long-press or context menu in the workspace terminal
- `components/workspace/SessionPickerSheet.tsx` (7920 bytes) — Dead code, never imported anywhere

### What NAVIGATES to old screens:
- `components/LaunchSheet.tsx` lines 948, 967, 987 — Three `router.push('/session/.../terminal')` calls
- `app/session/[hostId]/[name]/index.tsx` line 104 — Links to its own terminal sub-route
- `app/_layout.tsx` lines 94, 103 — Stack.Screen declarations for both old session routes

## Tasks

### Task 1: Remove `router.push` from LaunchSheet

The workspace auto-assigns new sessions when they appear (via `useWorkspaceState` reconciliation at lines 92-148). When LaunchSheet creates a session, the polling will pick it up and auto-add it as a workspace window.

- [ ] Remove `router.push('/session/.../terminal')` at lines 948, 967, 987 in `components/LaunchSheet.tsx`
- [ ] After `onClose()`, just let the workspace reconciliation handle it (sessions appear within ~2s polling cycle)
- [ ] Optionally: call `actions.setActiveWorkspace()` to ensure user sees the new window immediately

**Files to modify:**
- `components/LaunchSheet.tsx`

### Task 2: Remove old Stack.Screen declarations

- [ ] Remove `<Stack.Screen name="session/[hostId]/[name]/terminal" />` from `app/_layout.tsx` line 94
- [ ] Remove `<Stack.Screen name="session/[hostId]/[name]/index" />` from `app/_layout.tsx` line 103

**Files to modify:**
- `app/_layout.tsx`

### Task 3: Delete old session route files

- [ ] Delete `app/session/[hostId]/[name]/terminal.tsx` (1075 lines)
- [ ] Delete `app/session/[hostId]/[name]/index.tsx` (295 lines)
- [ ] Delete the empty `app/session/[hostId]/[name]/` directory
- [ ] Delete the empty `app/session/[hostId]/` directory
- [ ] Delete the empty `app/session/` directory

**Files to delete:**
- `app/session/[hostId]/[name]/terminal.tsx`
- `app/session/[hostId]/[name]/index.tsx`

### Task 4: Delete dead SessionPickerSheet component

- [ ] Delete `components/workspace/SessionPickerSheet.tsx` (never imported, confirmed dead code)

**Files to delete:**
- `components/workspace/SessionPickerSheet.tsx`

### Task 5: Verify no remaining references to old routes

- [ ] Search for any remaining `/session/` navigation patterns in source code
- [ ] Search for any imports from the deleted files
- [ ] Check `thoughts/` docs reference old paths (informational only, no action needed)

### Task 6: Ensure workspace responsiveness on session creation

After removing `router.push`, the new session appears via polling (2s interval). This may feel slightly delayed. If needed:

- [ ] Verify the LaunchSheet `onClose()` returns to the workspace pager (it should since there's no push anymore)
- [ ] Verify `useWorkspaceState` auto-assignment puts the new terminal in the active workspace
- [ ] If there's a noticeable delay, consider triggering an immediate poll/refresh after session creation

**Files to check:**
- `lib/useWorkspaceState.ts`
- `lib/live.ts` (polling logic)

## Success Criteria

### Automated Verification:
- [ ] `pnpm typecheck` passes (no broken imports/references)
- [ ] `pnpm lint` passes
- [ ] App builds successfully: `npx expo export --platform android`

### Manual Verification:
- [ ] Open LaunchSheet → create new session → stays in workspace pager (no old screen)
- [ ] New terminal window appears in active workspace within 2s
- [ ] Existing workspace navigation still works (swipe between windows, workspaces)
- [ ] Overview mode (pinch) still works
- [ ] Kill/rename sessions still possible (via workspace terminal long-press or context menu, if implemented)

## Risks (Pre-Mortem)

### Tigers:
- **Deep links to `/session/.../terminal` will break** (MEDIUM)
  - Mitigation: If push notifications link to old routes, they'll 404. Check notification handler in `lib/notifications.ts` for deep link URLs. May need a redirect or update notification payloads.

### Elephants:
- **Session rename/kill UX gap** (MEDIUM)
  - The old `session/[hostId]/[name]/index.tsx` had rename/kill UI. With it removed, users lose these actions unless the workspace terminal has them (check `SessionTerminalPage` for these features). May need to add a long-press context menu later.

## Out of Scope
- Adding rename/kill actions to the workspace terminal (can be a follow-up)
- Deep link redirect implementation (the TODO from the old code — can add later if needed)
- Refactoring the tab layout (hidden tabs work fine as routing scaffolding)
- Docker container screens (these are separate and unrelated)
