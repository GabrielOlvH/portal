---
root_span_id: 698eaaa8-4f12-4968-851d-ad63257a3bac
turn_span_id: e52c12b2-c299-4326-8a5d-b42cfedbc8c2
session_id: 698eaaa8-4f12-4968-851d-ad63257a3bac
---

# Handoff: Tasks 6 + 8 — Two-finger workspace switching + Tab bar hiding

## Status: COMPLETE

Both tasks implemented, `pnpm typecheck` passes (0 errors), `pnpm lint` passes (0 errors, 28 pre-existing warnings unchanged).

---

## Task 6: Two-finger workspace switching

### Files changed
- `app/(tabs)/index.tsx`

### What was added

**Import** at top of file (line 2):
```ts
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
```
`react-native-gesture-handler` was already a dependency (used in `app/_layout.tsx` for `GestureHandlerRootView`), so no package install needed.

**`workspaces` useMemo** in `SessionsScreen`, placed after the `allSessions` useMemo:
```ts
const workspaces = useMemo(() => {
  const seen = new Set<string>();
  const result: Array<{ hostId: string; host: Host; startIndex: number }> = [];
  allSessions.forEach((session, index) => {
    if (!seen.has(session.host.id)) {
      seen.add(session.host.id);
      result.push({ hostId: session.host.id, host: session.host, startIndex: index });
    }
  });
  return result;
}, [allSessions]);
```

**`twoFingerPan` gesture** in `SessionsScreen`, placed after `workspaces`, before the return:
```ts
const twoFingerPan = Gesture.Pan()
  .minPointers(2)
  .maxPointers(2)
  .runOnJS(true)
  .onEnd((event) => {
    if (Math.abs(event.translationY) < 60) return;
    const direction = event.translationY > 0 ? 1 : -1;
    let currentWorkspaceIdx = -1;
    for (let i = workspaces.length - 1; i >= 0; i--) {
      if (workspaces[i].startIndex <= currentPage) {
        currentWorkspaceIdx = i;
        break;
      }
    }
    const nextWorkspaceIdx = currentWorkspaceIdx + direction;
    if (nextWorkspaceIdx < 0 || nextWorkspaceIdx >= workspaces.length) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    pagerRef.current?.setPage(workspaces[nextWorkspaceIdx].startIndex);
  });
```

Note: used a manual reverse loop instead of `findLastIndex` to avoid TypeScript lib target issues.

**GestureDetector wrap** around each `SessionTerminalPage` in the PagerView render loop:
```tsx
{allSessions.map((session, index) => (
  <View key={`${session.host.id}/${session.name}`} style={{ flex: 1 }} collapsable={false}>
    <GestureDetector gesture={twoFingerPan}>
      <SessionTerminalPage ... />
    </GestureDetector>
  </View>
))}
```

The LaunchpadPage (last page) does NOT get wrapped — it doesn't participate in workspace switching.

### Behaviour
- 2-finger vertical swipe > 60px on a session page triggers workspace jump
- Positive Y (swipe down) = move to next workspace (higher startIndex)
- Negative Y (swipe up) = move to previous workspace
- Heavy haptic on each successful workspace switch
- No-op at boundaries (first/last workspace)

---

## Task 8: Tab bar hiding + deep link compat

### Files changed
- `app/(tabs)/_layout.tsx`
- `app/session/[hostId]/[name]/terminal.tsx`

### Tab bar hiding (`_layout.tsx`)

Added `tabBarStyle: { display: 'none' }` to the `index` screen options in `AndroidTabLayout`:
```tsx
<Tabs.Screen
  name="index"
  options={{
    title: 'Sessions',
    tabBarIcon: ({ color, size }) => <Terminal size={size} color={color} />,
    tabBarStyle: { display: 'none' },
  }}
/>
```

iOS uses `NativeTabs` which hides with `minimizeBehavior="onScrollDown"` — no change needed, the native tab bar auto-minimizes.

### Deep link compat (`terminal.tsx`)

Added a comment block before the export:
```ts
// This screen is kept for deep link compatibility (e.g. notification links).
// The main terminal flow now uses app/(tabs)/index.tsx (PagerView).
// TODO: redirect to main pager at matching index once deep link routing supports it.
```

No redirect was added — an immediate `router.replace('/(tabs)')` would break notification deep links that need to show a specific session. Left as-is with a TODO for future work.

---

## State for next tasks

- `allSessions: SessionWithHost[]` — flat list of all sessions across hosts
- `workspaces: { hostId, host, startIndex }[]` — one entry per host, ordered by first session appearance
- `pagerRef: React.RefObject<PagerView | null>` — controls page navigation
- `currentPage: number` — 0-indexed, updated by `onPageSelected`
- Tab bar hidden on Android index screen; visible on hosts/projects/more
- `terminal.tsx` preserved for deep links, marked with TODO comment
