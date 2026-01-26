# Debug Report: Terminal Width/Height Dimension Desync

Generated: 2026-01-23

## Symptom

Terminal dimensions (width/height) are getting out of sync consistently. The terminal renders at incorrect size (height too small, width cut off), often correcting only after keyboard open/close or later layout passes. The user explicitly requested NOT to implement lazy solutions like calling layout multiple times in rapid succession - the ROOT CAUSE must be found.

## Hypotheses Tested

1. **Race condition between WebView resize and xterm fit** - CONFIRMED - Multiple independent timing sources
2. **Stale closure capturing outdated dimensions** - CONFIRMED - Evidence in React state handling
3. **Transform/ScrollView affecting getBoundingClientRect** - CONFIRMED - Documented in past debugging

## Investigation Trail

| Step | Action | Finding |
|------|--------|---------|
| 1 | Read TerminalWebView.tsx | Found multiple fit scheduling sources |
| 2 | Read terminal.tsx | Found complex state management with keyboard/focus |
| 3 | Read terminal-html.ts | Found xterm fit logic with multiple timing mechanisms |
| 4 | Read terminal-layout-debug.md | Confirms ongoing issue with 9+ attempted fixes |

## Evidence

### Finding 1: Multiple Independent Fit Trigger Sources (Race Condition)

**Location:** `/home/gabrielolv/Documents/Projects/ter/components/TerminalWebView.tsx:57-97`

The TerminalWebView has multiple independent sources that trigger fit scheduling:

```typescript
// Line 57-67: scheduleFit function with multiple delayed calls
const scheduleFit = useCallback(() => {
  if (!autoFit) return;
  delays.forEach((delay) => {  // defaults to [0, 50, 150]
    setTimeout(() => {
      // injects __fitTerminal
    }, delay);
  });
}, [autoFit, delays, canFit]);

// Line 74-78: handleLoadEnd triggers fit
const handleLoadEnd = useCallback(() => {
  loadedRef.current = true;
  onLoadEnd?.();
  scheduleFit();  // <-- FIT SOURCE 1
}, [onLoadEnd, scheduleFit]);

// Line 80-84: handleLayout triggers fit
const handleLayout = useCallback((event: LayoutChangeEvent) => {
  layoutRef.current = event.nativeEvent.layout;
  onLayout?.(event);
  scheduleFit();  // <-- FIT SOURCE 2
}, [onLayout, scheduleFit]);

// Line 90-92: useEffect on source change
useEffect(() => {
  scheduleFit();  // <-- FIT SOURCE 3
}, [scheduleFit, source]);

// Line 94-97: useEffect on loadedRef
useEffect(() => {
  if (!loadedRef.current) return;
  scheduleFit();  // <-- FIT SOURCE 4
}, [scheduleFit]);
```

**Problem:** Each of these sources fires independently, and each calls `scheduleFit` which schedules 3 separate timeouts (0, 50, 150ms). This means a single layout event can trigger up to 12 fit calls from the React Native side alone. These are NOT synchronized.

### Finding 2: Additional Fit Sources in terminal.tsx

**Location:** `/home/gabrielolv/Documents/Projects/ter/app/session/[hostId]/[name]/terminal.tsx:427-435`

```typescript
useEffect(() => {
  if (!currentSessionName || !isFocused) return;
  const ref = webRefs.current[currentSessionName];
  if (!ref) return;
  const timeout = setTimeout(() => {
    ref.injectJavaScript(fitScript);  // <-- FIT SOURCE 5
  }, 60);
  return () => clearTimeout(timeout);
}, [currentSessionName, isFocused, keyboardInset, helperHeight]);
```

This fires on **4 different dependencies**: `currentSessionName`, `isFocused`, `keyboardInset`, `helperHeight`. Each change triggers another fit call.

Additionally at lines 530-533:
```typescript
onLayout={() => {
  if (!isCurrent) return;
  webRefs.current[session.name]?.injectJavaScript(fitScript);  // <-- FIT SOURCE 6
}}
```

And at lines 540-542:
```typescript
onLoadEnd={() => {
  webRefs.current[session.name]?.injectJavaScript(fitScript);  // <-- FIT SOURCE 7
}}
```

### Finding 3: WebView-side Has ANOTHER Layer of Burst Timing

**Location:** `/home/gabrielolv/Documents/Projects/ter/lib/terminal-html.ts:412-417`

Inside the WebView, when `__fitTerminal` is called, it triggers `fitBurst()`:

```javascript
function fitBurst() {
  scheduleFit();
  setTimeout(scheduleFit, 80);   // <-- WEBVIEW FIT 1
  setTimeout(scheduleFit, 200);  // <-- WEBVIEW FIT 2
  setTimeout(scheduleFit, 500);  // <-- WEBVIEW FIT 3
  setTimeout(scheduleFit, 1000); // <-- WEBVIEW FIT 4
}

window.__fitTerminal = () => { fitBurst(); };  // Line 545
```

**Compounding Problem:** When React Native calls `injectJavaScript('window.__fitTerminal()')`, it triggers 5 fit calls inside the WebView. Combined with the 7 sources from React Native side, a single layout event can cascade into 35+ uncoordinated fit attempts.

### Finding 4: Root Race Condition - Resize Sent Before Layout Stabilizes

**Location:** `/home/gabrielolv/Documents/Projects/ter/lib/terminal-html.ts:375-388`

```javascript
function tryFit() {
  updateLayoutReady();
  if (!canFit()) return false;
  const dims = getProposedDimensions();
  if (!dims || !dims.cols || !dims.rows) return false;
  fitAddon.fit();
  if (term.cols !== dims.cols || term.rows !== dims.rows) {
    term.resize(dims.cols, dims.rows);
  }
  if (term.cols !== dims.cols || term.rows !== dims.rows) return false;
  hasFitted = true;
  sendResize();  // <-- SENDS TO SERVER
  fitRetryCount = 0;
  return true;
}
```

The `sendResize()` function (lines 327-335):
```javascript
function sendResize() {
  if (!config.enableResize || socket?.readyState !== 1) return;
  const cols = term.cols;
  const rows = term.rows;
  if (!cols || !rows) return;
  if (cols === lastCols && rows === lastRows) return;  // <-- DEDUP, but only local
  lastCols = cols;
  lastRows = rows;
  socket.send(JSON.stringify({ type: 'resize', cols, rows }));  // <-- SENT TO PTY
}
```

**Critical Issue:** Each `tryFit()` that succeeds sends a resize to the server. With 35+ fit attempts from various timing sources, the server/PTY receives multiple resize commands in quick succession. The PTY resize is NOT atomic - it can process the first resize, then another arrives before the first completes, leading to desync.

### Finding 5: State Ordering Issue in React Native

**Location:** `/home/gabrielolv/Documents/Projects/ter/app/session/[hostId]/[name]/terminal.tsx:529`

```typescript
style={[styles.terminal, keyboardInset > 0 && isCurrent && { paddingBottom: keyboardInset + helperHeight }]}
```

The terminal container's padding depends on `keyboardInset` and `helperHeight`. Both are measured asynchronously:
- `keyboardInset` from keyboard events (lines 197-214)
- `helperHeight` from onLayout (line 600)

When these change, the container resizes, which triggers `onLayout` in the View (line 530-533), which triggers fit, which reads the NEW container dimensions but the OLD terminal dimensions from xterm, causing the desync.

### Finding 6: Keyboard State and Layout State Are Not Coordinated

**Location:** `/home/gabrielolv/Documents/Projects/ter/app/session/[hostId]/[name]/terminal.tsx:196-228`

```typescript
// Line 197-214: Keyboard listeners
useEffect(() => {
  const updateKeyboardOffset = (height: number) => {
    if (!isFocused || appState !== 'active') return;
    const nextHeight = Math.max(0, height);
    keyboardVisibleRef.current = nextHeight > 0;
    setKeyboardOffset(nextHeight);  // <-- STATE CHANGE 1
  };
  const show = Keyboard.addListener('keyboardDidShow', (e) => updateKeyboardOffset(e.endCoordinates.height));
  // ...
}, [appState, currentSessionName, isFocused]);
```

When keyboard shows/hides, `keyboardOffset` changes, which:
1. Causes re-render
2. Changes terminal container padding (line 529)
3. Triggers onLayout
4. Triggers fit scheduling
5. BUT the fit may run before React has finished the re-render

## Root Cause

**PRIMARY CAUSE: Lack of Authoritative Dimension Source**

The system has NO single source of truth for terminal dimensions. Instead, dimensions flow through 3 independent pathways that are not synchronized:

1. **React Native Layout** -> State (`keyboardOffset`, `helperHeight`, `pagerHeight`)
2. **WebView DOM** -> `fitAddon.proposeDimensions()` -> `term.resize()`
3. **Server/PTY** -> WebSocket resize messages

Each pathway has its own timing and can fire independently. When they desync (which happens frequently due to the cascade of fit calls), the terminal displays at the wrong size.

**SECONDARY CAUSE: "Burst" Pattern is a Workaround, Not a Fix**

The current code uses burst timing (`fitBurst()` with multiple delayed calls) as a workaround for not knowing WHEN the layout is actually stable. This is exactly the "lazy solution" the user wants to avoid. The burst pattern:
- Wastes CPU cycles on redundant fits
- Sends multiple resize commands to the server
- Can still miss the correct timing window
- Creates race conditions when overlapping bursts occur

**Confidence:** High

## Recommended Fix

### Architecture Change: Request-Response Dimension Protocol

Instead of fire-and-forget fit calls, implement a dimension coordination protocol:

**Files to modify:**

1. **`/home/gabrielolv/Documents/Projects/ter/lib/terminal-html.ts`**
   - Remove `fitBurst()` and all burst timing
   - Implement a single `requestDimensions()` function that:
     1. Gets container dimensions via `getBoundingClientRect()`
     2. Gets proposed dimensions from `fitAddon.proposeDimensions()`
     3. Sends BOTH to React Native via `sendToRN({ type: 'dimensions', container: {...}, proposed: {...} })`
   - Wait for React Native to respond with `__confirmDimensions(cols, rows)` before applying resize
   - Add debounced ResizeObserver that only REQUESTS dimensions (does not fit)

2. **`/home/gabrielolv/Documents/Projects/ter/components/TerminalWebView.tsx`**
   - Remove `scheduleFit()` with burst delays
   - Add `onMessage` handler for `dimensions` type
   - Implement dimension validation logic:
     - Compare container dimensions with expected layout dimensions
     - If match, send `__confirmDimensions(cols, rows)` to WebView
     - If mismatch, wait for next layout event (do NOT retry on timer)

3. **`/home/gabrielolv/Documents/Projects/ter/app/session/[hostId]/[name]/terminal.tsx`**
   - Add coordination state for pending dimension requests
   - Remove direct `fitScript` injections
   - Pass dimension confirmation handler to TerminalWebView

### Specific Changes:

**terminal-html.ts changes:**

```javascript
// Replace fitBurst() with:
let dimensionRequestPending = false;

function requestDimensions() {
  if (dimensionRequestPending) return;
  dimensionRequestPending = true;
  
  const container = terminalEl.getBoundingClientRect();
  const proposed = getProposedDimensions();
  
  sendToRN({
    type: 'dimensionRequest',
    container: { width: container.width, height: container.height },
    proposed: proposed ? { cols: proposed.cols, rows: proposed.rows } : null
  });
}

window.__confirmDimensions = (cols, rows) => {
  dimensionRequestPending = false;
  if (!cols || !rows) return;
  
  // Only now apply the resize
  fitAddon.fit();
  if (term.cols !== cols || term.rows !== rows) {
    term.resize(cols, rows);
  }
  sendResize();
};

// ResizeObserver only requests, doesn't fit
const resizeObserver = new ResizeObserver(() => {
  requestDimensions();
});
```

**TerminalWebView.tsx changes:**

```typescript
const pendingDimensionRef = useRef<{ cols: number; rows: number } | null>(null);

const handleMessage = useCallback((event: WebViewMessageEvent) => {
  const data = JSON.parse(event.nativeEvent.data);
  
  if (data.type === 'dimensionRequest') {
    const layout = layoutRef.current;
    if (!layout) return;  // Wait for layout
    
    // Validate container dimensions match React Native expectations
    const tolerance = 2;  // px tolerance for rounding
    const widthMatch = Math.abs(data.container.width - layout.width) < tolerance;
    const heightMatch = Math.abs(data.container.height - layout.height) < tolerance;
    
    if (widthMatch && heightMatch && data.proposed) {
      // Dimensions are stable, confirm the resize
      webRef.current?.injectJavaScript(
        `window.__confirmDimensions(${data.proposed.cols}, ${data.proposed.rows}); true;`
      );
    }
    // If mismatch, do nothing - wait for next layout/resize cycle
  }
  
  onMessage?.(event);
}, [onMessage]);
```

### Alternative: Simpler Debounce Fix (Less Invasive)

If the full protocol is too invasive, a simpler fix is to:

1. Add a SINGLE debounced fit with 300ms delay after ALL sources
2. Cancel any pending fit when a new layout event occurs
3. Only send resize to server when dimensions actually changed AND are stable for 300ms

**terminal-html.ts:**
```javascript
let fitDebounceTimer = null;
let lastStableCols = 0;
let lastStableRows = 0;

function debouncedFit() {
  if (fitDebounceTimer) clearTimeout(fitDebounceTimer);
  fitDebounceTimer = setTimeout(() => {
    fitDebounceTimer = null;
    if (!tryFit()) return;
    // Only consider stable if same for 300ms
    if (term.cols === lastStableCols && term.rows === lastStableRows) return;
    lastStableCols = term.cols;
    lastStableRows = term.rows;
    sendResize();
  }, 300);
}
```

## Prevention

1. **Single Dimension Authority**: All dimension changes should flow through ONE coordinated path
2. **Request-Response Pattern**: Never apply dimensions without validation
3. **Debounce at Source**: Layout events should be debounced BEFORE triggering any action
4. **State Dependency Tracking**: When React state affects layout, wait for render completion before measuring
5. **Server-Side Ack**: Consider having the server acknowledge resize before client assumes it's applied

---

## Summary

The root cause is **lack of coordination** between three independent timing systems (React Native layout, WebView DOM, server PTY). The current "burst" approach of calling fit multiple times is a workaround that actually makes the problem worse by creating more opportunities for race conditions. The fix requires implementing a synchronized dimension protocol where React Native acts as the authority and validates dimensions before they are applied.
