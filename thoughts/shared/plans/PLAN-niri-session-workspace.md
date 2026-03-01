# Plan: Always Terminal — Session Workspace

## Goal

Transform the app from a "list → navigate → terminal" flow into an "always terminal" experience. Sessions are navigated like browser tabs. Swiping all the way right lands on a **launchpad page** — the utility hub for creating sessions, managing hosts, projects, and settings. You're never "outside" your workspace.

## The Core Idea

Two axes of navigation — like NIRI's horizontal windows + vertical workspaces:

```
                    2-finger swipe ▲ (prev workspace)

         ── kaia.ovh workspace ──────────────────────────▶ launchpad
         │  sess1  │  sess2  │  sess3  │  + New  │
         │         │         │         │  Hosts  │
         │         │         │         │ Projects│

                    2-finger swipe ▼ (next workspace)

         ── work.server workspace ───────────────────────▶ launchpad
         │  api    │  web    │         │  + New  │
         │         │         │         │  Hosts  │
         │         │         │         │ Projects│
```

- **Horizontal swipe (1 finger)** — move between sessions within the current workspace
- **Vertical 2-finger swipe** — jump to next/previous workspace (host group)
- **Last page of every workspace** — launchpad (same content everywhere)
- **`[⊞]` button** — full-screen overview grid, see all workspaces + sessions at once

## Navigation Model

```
App opens → last active terminal

Inside any terminal:
  1-finger swipe ←→      = switch sessions within workspace
  2-finger swipe ↑↓      = switch workspace (host group)
  tap session name ▾     = quick-jump sheet (all sessions, all hosts)
  tap [⊞]               = overview grid overlay
  swipe to last page →   = launchpad

Overview grid:
  grouped by host
  tap card → jump to that terminal, dismiss overlay

Launchpad (last page):
  [+ New Session], Hosts, Projects, Settings
  swipe ← = back to last terminal
```

**No dedicated sessions list tab anymore.** The PagerView IS the sessions tab.

## What Changes vs Current

| Current | New |
|---|---|
| Sessions tab = vertical list | Sessions tab = global PagerView |
| Tap session → navigate to terminal screen | Already IN terminal — swipe to switch |
| Terminal PagerView scoped to one host | Terminal PagerView global (all hosts) |
| Hosts / Projects in separate tabs | Hosts / Projects accessible via launchpad |
| FAB for new session | Launchpad page for new session |
| No way to access settings from terminal | Launchpad page has settings link |

## Layout — Session Page

```
┌─────────────────────────────┐
│ claude-work ▾  ●kaia   [×] │  ← header: name dropdown, host dot, kill
│─────────────────────────────│
│                             │
│                             │
│     fullscreen terminal     │  ← existing TerminalWebView
│                             │
│                             │
│─────────────────────────────│
│ [esc][tab][ctrl] ...        │  ← existing helper keys
└─────────────────────────────┘
```

## Layout — Launchpad Page

```
Phone:                          Tablet:
┌─────────────────────┐         ┌───────────────────────────┐
│                     │         │  ╭──────────────────────╮  │
│   ╭─────────────╮   │         │  │    + New Session      │  │
│   │ + New        │   │         │  ╰──────────────────────╯  │
│   │  Session     │   │         │                             │
│   ╰─────────────╯   │         │  ┌──────────┐ ┌──────────┐ │
│                     │         │  │  Hosts   │ │ Projects │ │
│  ┌─────────────────┐│         │  └──────────┘ └──────────┘ │
│  │ 🖥  Hosts        ││         │                             │
│  ├─────────────────┤│         │  ┌──────────────────────┐  │
│  │ 📁  Projects    ││         │  │      Settings        │  │
│  ├─────────────────┤│         │  └──────────────────────┘  │
│  │ ⚙   Settings   ││         │                             │
│  └─────────────────┘│         │  Recent: sess1 sess2 sess3  │
│                     │         └───────────────────────────┘
│  ○ ○ ○ ●            │
└─────────────────────┘
```

## Architecture

### Files modified:
- `app/(tabs)/index.tsx` — full rewrite: global PagerView + launchpad page
- `app/(tabs)/_layout.tsx` — hide bottom tab bar (Sessions tab becomes full-screen)

### Files kept as-is:
- `app/session/[hostId]/[name]/terminal.tsx` — kept for deep links (notifications). Can redirect to main pager or stay independent.
- `components/TerminalWebView.tsx` — no changes
- All other screens (Hosts, Projects, etc.) — no changes

### New components (inline in index.tsx):
- `SessionTerminalPage` — one terminal page in the pager
- `LaunchpadPage` — the final swipe page

## Key Technical Points

### Global PagerView (not per-host)
Current terminal PagerView is scoped to one host via `hostId` route param. New pager shows sessions from **all hosts**, sorted by `lastAttached` descending. Each page needs `host` + `sessionName` to build its WS URL — `useHostsLive` already provides both.

### WebView management
Same pattern as current terminal.tsx — a `webRefs` map keyed by `sessionName`, lazy-loaded when the page becomes active. Only the current ± 1 adjacent page keeps an active WebSocket.

### Tab bar
- **iOS `NativeTabs`**: Use `tabBarHidden` or wrap the PagerView in a full-screen `Modal`-like container. Simplest: keep tab bar, style it to be less obtrusive. Revisit after MVP.
- **Android `Tabs`**: `tabBarStyle: { display: 'none' }` on the index screen.
- **Decision**: Hide on Android immediately. For iOS, evaluate at runtime — the `minimizeBehavior="onScrollDown"` won't fire on horizontal scroll, so the tab bar persists. Post-MVP: full-screen mode for iOS.

### Session quick-jump (header dropdown)
Tapping `▾` on the header opens a `BottomSheet` (or `Modal`) listing all sessions. Tap any → `pagerRef.current?.setPage(index)`. This is the "Super+W overview" equivalent — instant access without leaving the flow.

### Tablet layout
Same PagerView, wider pages. On tablet landscape, the launchpad uses a 2-col grid layout. Position dots remain visible in the header (not the footer, to avoid overlap with keyboard).

### iPad sidebar
Same mitigation as before: use `onLayout` on the PagerView container to measure actual available width.

### Position indicator
Bottom dots (○ ○ ● ○) capped at 8 visible dots — if more sessions, show `3 / 12` count instead. Dots are in the launchpad page footer only; terminal pages show a thin dot strip in the header row.

## Tasks

### Task 1: Rewrite `app/(tabs)/index.tsx` as global PagerView

- [ ] Remove all existing `SessionRow`, `GitHubStatusSection`, vertical list code
- [ ] Call `useHostsLive` for all hosts with `sessions: true, insights: true, preview: true, previewLines: 5`
- [ ] Build flat `allSessions: SessionWithHost[]` sorted by `lastAttached` desc
- [ ] Add `PagerView` import (already in terminal.tsx, same package)
- [ ] Render: `allSessions.map(session => <SessionTerminalPage>)` + `<LaunchpadPage>` as last page
- [ ] Track `currentIndex` via `onPageSelected`
- [ ] Auto-set initial page to most recently active session index
- [ ] Pass `pagerRef` down so header and launchpad can programmatically navigate

**Files:** `app/(tabs)/index.tsx`

### Task 2: Build `SessionTerminalPage` component

- [ ] Props: `session`, `host`, `isActive`, `pagerViewport`, `onKill`
- [ ] Thin header row:
  - Session name (truncated) + `▾` tap → opens session picker sheet
  - Host color dot + host name
  - `[×]` kill button
- [ ] `TerminalWebView` (reuse existing component, same props pattern as terminal.tsx)
- [ ] Lazy init: only create WebSocket when `isActive || wasEverActive`
- [ ] Helper keys row at bottom (reuse from terminal.tsx)
- [ ] Non-active pages: show a dimmed "preview label" overlay (port existing `pageLabel` logic)

**Files:** `app/(tabs)/index.tsx`

### Task 3: Build `LaunchpadPage` component

- [ ] Props: `onNewSession`, `totalSessions`, `currentIndex`, `stateMap` (host live states)
- [ ] **Usage rings** — reuse existing `CompactUsageCard` / `HealthRing` components from the current home screen. Shows Claude, Codex, Cursor etc. usage at a glance. Same data source (`stateMap` → `session.insights`)
- [ ] Primary button: `[+ New Session]` → calls `openLaunchSheet()`
- [ ] Navigation rows: Hosts → `router.push('/hosts')`, Projects → `router.push('/projects')`, Settings → `router.push('/more')`
- [ ] Position indicator: dots if ≤ 8 sessions, `N / total` text if more
- [ ] Empty state variant: when 0 sessions, this is the only page — show welcoming copy + add host CTA
- [ ] Tablet: 2-col grid layout for nav items

**Files:** `app/(tabs)/index.tsx`

### Task 4: Session quick-jump sheet

- [ ] `SessionPickerSheet` component: renders inside the PagerView screen, triggered by `▾` in header
- [ ] Uses `Modal` with `transparent` + animated slide-up (no external dependency)
- [ ] Lists all sessions grouped by host
- [ ] Tap → `pagerRef.current?.setPage(index)` + close sheet
- [ ] Shows state dot (running/idle/stopped) per session

**Files:** `app/(tabs)/index.tsx`

### Task 5: Overview grid overlay (`[⊞]`)

- [ ] `SessionOverviewOverlay` component — full-screen modal overlay, `transparent` bg + blur/dim
- [ ] Triggered by `[⊞]` button in session header
- [ ] **Usage rings strip at the top** — same `CompactUsageCard`/`HealthRing` components, aggregated across all sessions. Gives a live system health snapshot while you're picking a session.
- [ ] Sessions grouped by workspace (host), 2-col grid (3-col tablet)
- [ ] Each card: host color bar, session name, state dot, git branch
- [ ] Tap any card → `pagerRef.current?.setPage(index)` + dismiss overlay
- [ ] Swipe down or tap backdrop → dismiss
- [ ] `[+ New]` card at end of each workspace group
- [ ] Animated: slides up from bottom, cards fade in staggered

**Files:** `app/(tabs)/index.tsx`

### Task 6: Two-finger workspace switching

Workspaces = sessions grouped by host. Two-finger vertical swipe jumps to the first session of the next/previous host group.

- [ ] Define `workspaces: { host, sessions }[]` derived from `allSessions` (grouped by host, order preserved)
- [ ] Wrap each `SessionTerminalPage` in a `GestureDetector` from `react-native-gesture-handler`
- [ ] Use `Gesture.Pan().minPointers(2).maxPointers(2)` — 2-finger pan only
- [ ] Activate on vertical movement > 60px threshold with downward/upward direction
- [ ] On activation: find current workspace index, jump pager to first session of next/prev workspace
- [ ] Haptic feedback on workspace switch (`Haptics.impactAsync(Heavy)`)
- [ ] `react-native-gesture-handler` is already used in the project (PagerView depends on it)
- [ ] Does NOT conflict with terminal scroll — WebView only receives single-finger events; 2-finger goes to the native gesture layer above it

**Files:** `app/(tabs)/index.tsx`

### Task 8: Hide tab bar + deep link compat

- [ ] Android: add `tabBarStyle: { display: 'none' }` to index screen options in `_layout.tsx`
- [ ] iOS: evaluate at runtime — for now accept tab bar is visible, add TODO comment
- [ ] `app/session/[hostId]/[name]/terminal.tsx`: add redirect to main pager at matching index, or leave as standalone for notification deep links

**Files:** `app/(tabs)/_layout.tsx`, `app/session/[hostId]/[name]/terminal.tsx`

## Success Criteria

### Automated:
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes

### Manual — Phone:
- [ ] App opens directly to last active terminal
- [ ] Swipe left/right switches between sessions globally (across hosts)
- [ ] Swipe to last page shows launchpad
- [ ] Tapping `▾` in header opens session picker
- [ ] Tapping session in picker jumps to it
- [ ] Launchpad [+ New Session] opens launch sheet
- [ ] Launchpad nav items route to correct screens
- [ ] Kill button works with confirm dialog
- [ ] No sessions → launchpad is the first/only page with add-host CTA
- [ ] Tab bar hidden on Android, acceptable on iOS

### Manual — Tablet:
- [ ] Pages fill available width correctly (onLayout measurement)
- [ ] Launchpad shows 2-col grid
- [ ] Session picker sheet looks good on larger screen

## Out of Scope

- Animated tab bar hide/show on iOS (post-MVP)
- Drag-to-reorder sessions in the pager
- Session grouping by host within the pager
- CI/GitHub status (removed from main flow — accessible via Projects screen)
- StatusBar usage meters (moved to launchpad or settings)

## Risks

### Tigers:
- **Managing many WebViews in a single PagerView** (HIGH)
  - Each session needs a WebSocket + WebView. 10 sessions = 10 WebViews.
  - Mitigation: Lazy init — only activate WS for `current ± 1` pages. Destroy WS for pages more than 2 away (same pattern as current terminal.tsx already handles with `isCurrent` logic).
- **iPad sidebar content width** (MEDIUM)
  - Mitigation: `onLayout` on PagerView container (documented above).
- **iOS tab bar always visible** (LOW)
  - Mitigation: Post-MVP. Tab bar doesn't break anything, just less immersive.

### Elephants:
- **Users might not discover the launchpad** (MEDIUM)
  - Note: First launch should show a brief hint "swipe right for more →" that dismisses after one view.
- **Cross-host sessions in one pager may feel disorienting** (LOW)
  - Note: Host color dot in header gives constant spatial context.
