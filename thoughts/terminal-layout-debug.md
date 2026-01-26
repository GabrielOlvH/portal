Terminal Layout Debug Log
==========================

Problem
-------
- Terminal WebView renders at incorrect size (height too small, width cut off).
- It often corrects after a keyboard open/close or later layout pass.
- Multiple sessions: some fit, others stay wrong.
- Latest state: still broken after several attempts.

What was inspected
------------------
- `components/TerminalWebView.tsx` (WebView fit timing / layout triggers)
- `lib/terminal-html.ts` (xterm setup + fit addon + resize)
- `app/session/[hostId]/[name]/terminal.tsx` (session pager / layout)
- `app/hosts/[id]/docker/[containerId]/terminal.tsx` and logs view (secondary)

Changes that were tried (chronological)
--------------------------------------
1) TerminalWebView layout wrapper + fit scheduling
   - Wrapped WebView in a View with `onLayout`.
   - Added delayed fit bursts (0/80/200/500/1000ms).
   - Injected `__setViewport` and `__fitTerminal`.

2) xterm HTML gating on layout + fonts
   - Wait for fonts (`document.fonts`) before fitting.
   - `ResizeObserver` to fit when terminal element changes size.
   - Added `__setViewport` to force element sizes inside the WebView.

3) Viewport forcing + visual viewport sync
   - Tried to drive sizing from `window.visualViewport` + `innerWidth/innerHeight`.
   - Applied explicit width/height to html/body/root/terminal.
   - Added CSS load watcher for `xterm.css`.

4) Connect gating and aggressive fit
   - Delayed WS connect until dimensions stabilized.
   - Used `fitAddon.proposeDimensions()` and manual `term.resize`.
   - Result: layout glitches + "tmux dots" artifacts.

5) Rollbacks and simplification
   - Removed viewport forcing and connect gating.
   - Restored simpler `fitAddon.fit()` flow.
   - Reverted gating that caused empty terminals.

6) Active / inactive WebView gating
   - Added `active` prop and `__setActive` to avoid fitting off-screen sessions.
   - Helped random input artifacts but still had incorrect sizes.
   - Removed later for simplicity.

7) Android rendering workaround
   - Set `androidLayerType="software"` + `renderToHardwareTextureAndroid`.
   - This reduced severity but did not eliminate the issue.

8) Pager replacement (transform -> native paging)
   - Replaced transform-based pager (`Animated.View` translateX)
     with horizontal `ScrollView` + `pagingEnabled`.
   - Added explicit width/height for pages and content container.
   - This aligned with xterm docs about transforms affecting
     `getBoundingClientRect` and fit measurements.
   - Still not fully fixed.

9) Fit timing tweaks (rAF + short timeout)
   - Injected fit calls wrapped in `requestAnimationFrame` + `setTimeout(60)`
     after `onLoadEnd` and layout events.

Current state (after latest changes)
------------------------------------
- Pager uses `ScrollView` with paging; each page uses explicit width/height
  derived from a measured pager container.
- TerminalWebView:
  - uses `onLoadEnd` + `onLayout` to inject `__fitTerminal`.
  - fit injection includes rAF + short timeout.
  - Android layer type is forced to software.
- terminal-html:
  - uses `fitAddon.fit()` + `ResizeObserver`.
  - no viewport forcing or active gating.

Notes from research (docs / issues)
-----------------------------------
- xterm fit depends on container size being stable and visible.
- xterm char sizing uses `getBoundingClientRect`, which is affected by CSS transforms.
- WebView sizing inside ScrollView/pager can return 0/incorrect sizes
  on first layout without explicit dimensions.
- `injectedJavaScriptBeforeContentLoaded` can be unreliable on Android.
- Keyboard events often force a layout pass that makes the WebView report
  correct dimensions (consistent with observed behavior).

Next steps (not yet attempted)
------------------------------
1) Replace ScrollView pager with native view pager
   - Use `react-native-pager-view` to avoid ScrollView/WebView layout issues.
   - This is the most direct fix suggested by WebView issue patterns.

2) Force a native layout pass post-navigation
   - On iOS, WKWebView can report stale size until after transition.
   - Consider a delayed fit (500-700ms) after screen focus.

3) Add live diagnostics
   - Report container size, `fitAddon.proposeDimensions()`, and `term.cols/rows`
     back to React Native to confirm where the mismatch occurs.


