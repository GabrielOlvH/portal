# Codebase Report: Keyboard Accessory Component
Generated: 2026-01-30

## Summary

The keyboard accessory is a custom component built specifically for the terminal session screen. It provides helper keys (Esc, Tab, arrow keys, etc.) and expandable functionality (paste, image upload, snippets) that appear above the iOS keyboard when it's visible.

**Key Finding:** There is NO voice/audio functionality currently implemented in this app. The search for audio, voice, microphone, and recording features returned only node_modules results.

## Project Structure

```
/home/gabriel/Projects/Personal/portal/
├── app/
│   ├── session/[hostId]/[name]/
│   │   ├── terminal.tsx          # Main keyboard accessory implementation
│   │   └── index.tsx              # Session list screen
│   └── snippets/
│       └── index.tsx              # Snippets management UI
├── components/
│   └── TerminalWebView.tsx       # WebView wrapper (no keyboard accessory logic)
└── lib/
    ├── snippets-store.tsx         # Snippets state management
    └── types.ts                   # Type definitions
```

## Main Keyboard Accessory Implementation

### Location
**File:** `/home/gabriel/Projects/Personal/portal/app/session/[hostId]/[name]/terminal.tsx`

### Component: `SessionTerminalScreen`

This is the main terminal screen component that implements the keyboard accessory pattern.

### Key State Variables

| State Variable | Type | Purpose |
|----------------|------|---------|
| `keyboardOffset` | `number` | Height of keyboard in pixels |
| `helperHeight` | `number` | Height of helper bar for layout calculations |
| `isAccessoryExpanded` | `boolean` | Controls expanded row visibility |
| `focusedSessionName` | `string \| null` | Tracks which session has keyboard focus |
| `keyboardVisibleRef` | `useRef<boolean>` | Ref to track keyboard visibility |

### Keyboard Event Listeners (Lines 208-218)

```typescript
const show = Keyboard.addListener('keyboardDidShow', (e) => 
  updateKeyboardOffset(e.endCoordinates.height)
);
const hide = Keyboard.addListener('keyboardDidHide', () => {
  updateKeyboardOffset(0);
  // Blur terminal when keyboard hides
});
const changeFrame = Keyboard.addListener('keyboardDidChangeFrame', (e) => 
  updateKeyboardOffset(e.endCoordinates.height)
);
```

### Helper Keys Configuration (Lines 93-103)

**Main Helper Keys (always visible):**
```typescript
const mainHelperKeys: HelperKey[] = [
  { label: 'Esc', data: '\u001b' },
  { label: 'Tab', data: '\t' },
  { label: 'Up', data: '\u001b[A', icon: ChevronUp },
  { label: 'Down', data: '\u001b[B', icon: ChevronDown },
  { label: 'Left', data: '\u001b[D', icon: ChevronLeft },
  { label: 'Right', data: '\u001b[C', icon: ChevronRight },
];
```

**Expanded Helper Keys (visible when expanded):**
```typescript
const expandedHelperKeys: HelperKey[] = [
  { label: 'PgUp', data: '\u001b[5~' },
  { label: 'PgDn', data: '\u001b[6~' },
];
```

### Keyboard Accessory UI Structure (Lines 597-673)

The accessory only renders when `keyboardInset > 0`:

```typescript
{keyboardInset > 0 && (
  <View style={[styles.helperOverlay, { bottom: keyboardInset }]}>
    <View style={styles.helperBar} onLayout={(e) => setHelperHeight(...)}>
      {/* Main Row - Always Visible */}
      <ScrollView horizontal>
        <Pressable>  {/* Done button (ChevronDown) - dismisses keyboard */}
        {mainHelperKeys.map(...)}  {/* Esc, Tab, arrows */}
        <Pressable>  {/* Expand button (MoreHorizontal / X) */}
      </ScrollView>
      
      {/* Expanded Row - Conditional */}
      {isAccessoryExpanded && (
        <ScrollView horizontal style={styles.expandedRow}>
          <Pressable>  {/* Paste from clipboard */}
          <Pressable>  {/* Insert image (camera/library) */}
          {expandedHelperKeys.map(...)}  {/* PgUp, PgDn */}
          {snippets.map(...)}  {/* User-defined snippets */}
        </ScrollView>
      )}
    </View>
  </View>
)}
```

### Layout Pattern: Vertical Expansion

**Decision (from handoff):** Expanded row appears BELOW main row (user preference)

```
┌─────────────────────────────────┐
│  Done | Esc Tab ↑ ↓ ← → | More │  ← Main row (always visible)
├─────────────────────────────────┤
│ Paste Img PgUp PgDn [Snippets] │  ← Expanded row (conditional)
└─────────────────────────────────┘
```

## Input Modes Handling

### 1. **Normal Mode** (keyboard hidden)
- Accessory not rendered
- `keyboardInset = 0`
- Full terminal height

### 2. **Keyboard Visible** (main row only)
- Shows: Done, Esc, Tab, arrow keys, More button
- Terminal padding-bottom: `keyboardInset + helperHeight`
- Expand button shows `MoreHorizontal` icon

### 3. **Expanded Mode** (keyboard + expanded row)
- Shows: All main keys + Paste, Image, PgUp/PgDn, Snippets
- Same padding calculation
- Expand button shows `X` icon (to collapse)
- Additional row with `marginTop: 8`

## Key Functions

### Terminal Interaction

| Function | Purpose | Implementation |
|----------|---------|----------------|
| `sendToTerminal(data)` | Send escape sequences to terminal | Injects JS into WebView |
| `blurTerminal()` | Dismiss keyboard | Sets states to 0/false, calls blur JS |
| `focusTerminal(sessionName)` | Show keyboard | Injects focus JS into WebView |
| `copyFromTerminal()` | Copy terminal selection | Triggers WebView copy command |

### Image Upload Flow (Lines 327-394)

```
User taps Image button
  ↓
handleInsertImage()
  ↓
Platform.OS === 'ios' ? ActionSheetIOS : Alert
  ↓
"Take Photo" → takePhoto() → ImagePicker.launchCameraAsync()
  OR
"Choose Photo" → pickFromLibrary() → ImagePicker.launchImageLibraryAsync()
  ↓
uploadPickedImage(result)
  ↓
uploadImage(host, base64, mimeType) [API call]
  ↓
sendToTerminal(path + ' ')  [Insert file path in terminal]
```

### Paste Flow (Lines 631-636)

```typescript
<Pressable onPress={async () => {
  const text = await Clipboard.getStringAsync();
  if (text) sendToTerminal(text);
}}>
  <ClipboardPaste icon />
</Pressable>
```

## Snippets Integration

### Snippets Store

**File:** `/home/gabriel/Projects/Personal/portal/lib/snippets-store.tsx`

Provides React Context for snippet management:

```typescript
type Snippet = {
  id: string;
  label: string;
  command: string;
  providerIcon?: string;
};

const { snippets, addSnippet, updateSnippet, removeSnippet } = useSnippets();
```

**Default Snippets:**
- Claude: `claude --permission-mode bypassPermissions`
- Codex: `codex --yolo`
- OpenCode: `opencode`

**Storage:** AsyncStorage with key `'tmux.snippets.v1'`

### Snippet Rendering in Keyboard Accessory (Lines 658-665)

```typescript
{snippets.map((snippet) => (
  <Pressable
    key={snippet.id}
    style={[styles.helperKey, pressed && styles.keyPressed]}
    onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sendToTerminal(snippet.command);
    }}
  >
    <AppText variant="caps">{snippet.label}</AppText>
  </Pressable>
))}
```

### Snippet Management UI

**File:** `/home/gabriel/Projects/Personal/portal/app/snippets/index.tsx`

Full CRUD interface:
- Add new snippets (label + command)
- Edit existing snippets
- Delete with confirmation
- Persists to AsyncStorage

## Styling

### Key Style Classes (Lines 693-791)

| Style | Purpose |
|-------|---------|
| `helperOverlay` | Positioned absolute, bottom = keyboardInset |
| `helperBar` | Container with border-top, vertical padding |
| `helperContent` | Horizontal padding + gap for ScrollView |
| `helperKey` | Standard key: padding, border, background |
| `doneKey` | Special style for Done/Expand buttons |
| `expandedRow` | marginTop: 8 for spacing |
| `keyPressed` | Press state feedback |

### Color Tokens Used

- `colors.terminalBackground` - Accessory background
- `colors.terminalForeground` - Icon/text color
- `colors.terminalBorder` - Border and done button background
- `colors.terminalPressed` - Key background
- `colors.cardPressed` - Pressed state

## TerminalWebView Component

**File:** `/home/gabriel/Projects/Personal/portal/components/TerminalWebView.tsx`

**Purpose:** Wrapper around react-native-webview with terminal-specific config

**Key Props:**
```typescript
type TerminalWebViewProps = {
  source?: { html: string };
  keyboardEnabled?: boolean;  // Default: true
  autoFit?: boolean;          // Auto-resize terminal
  onMessage?: (event) => void;
  // ... standard WebView props
};
```

**WebView Configuration (Lines 124-138):**
```typescript
<WebView
  keyboardDisplayRequiresUserAction={false}  // Allow programmatic focus
  hideKeyboardAccessoryView={true}           // Hide iOS default accessory
  scrollEnabled={false}
  overScrollMode="never"
  // ... dimension sync logic
/>
```

**Important:** This component does NOT implement the keyboard accessory. It only:
1. Wraps the WebView with proper settings
2. Handles dimension sync between RN layout and terminal sizing
3. Hides the default iOS keyboard accessory bar

The custom accessory is implemented in the parent component (`terminal.tsx`).

## Keyboard Visibility Logic

### Multiple Sync Points

The terminal tracks keyboard state through multiple effects to handle edge cases:

1. **Keyboard event listeners** (lines 208-218) - Direct events
2. **isFocused changes** (lines 262-267) - Route navigation
3. **AppState changes** (lines 274-280) - App backgrounding
4. **Polling fallback** (lines 236-246) - Keyboard metrics check

### Auto-collapse on Keyboard Hide

Multiple effects reset `isAccessoryExpanded` when keyboard dismisses:
- Line 212: On keyboardDidHide
- Line 243: On polling timeout
- Line 256: On route blur
- Line 278: On app background

This ensures the expanded row doesn't persist incorrectly.

## Voice/Audio Functionality

**Status:** ❌ NONE FOUND

Search for voice/audio keywords returned only node_modules type definitions. This app has:
- ✅ Text input via terminal
- ✅ Clipboard paste
- ✅ Image upload (camera/library)
- ✅ Snippet quick commands
- ❌ NO voice input
- ❌ NO audio recording
- ❌ NO speech-to-text
- ❌ NO microphone access

## Architecture Patterns

### State Management Hierarchy

```
SessionTerminalScreen (coordinator)
  ├── Keyboard state (offset, expanded, focused)
  ├── Session state (currentSessionName, sessions list)
  ├── Pager state (ScrollView with horizontal pages)
  └── WebView refs (Record<sessionName, WebView>)
      └── Terminal instances (one per session)
```

### Communication Flow

```
React Native (SessionTerminalScreen)
  ↕ [JavaScript injection + message events]
TerminalWebView
  ↕ [WebSocket via terminal HTML]
Backend WebSocket Server
  ↕
PTY/Shell Session
```

### Helper Key Press Flow

```
User taps Esc key
  ↓
Pressable onPress handler
  ↓
Haptics.impactAsync()  [tactile feedback]
  ↓
sendToTerminal('\u001b')
  ↓
webRef.injectJavaScript('window.__sendToTerminal(...)')
  ↓
Terminal receives escape sequence
```

## File References

### Core Files

| File | Lines | Purpose |
|------|-------|---------|
| `/home/gabriel/Projects/Personal/portal/app/session/[hostId]/[name]/terminal.tsx` | 791 | Main keyboard accessory implementation |
| `/home/gabriel/Projects/Personal/portal/components/TerminalWebView.tsx` | 172 | WebView wrapper component |
| `/home/gabriel/Projects/Personal/portal/lib/snippets-store.tsx` | 120 | Snippet state management |
| `/home/gabriel/Projects/Personal/portal/app/snippets/index.tsx` | 340 | Snippet CRUD UI |

### Key Type Definitions

```typescript
// From terminal.tsx
type HelperKey = {
  label: string;      // Display text
  data: string;       // Escape sequence or command
  icon?: HelperKeyIcon;  // Optional icon component
};

// From types.ts (inferred)
type Snippet = {
  id: string;
  label: string;
  command: string;
  providerIcon?: string;
};
```

## Recent Changes (from handoff)

Session: `ter` (2026-01-18)

**Implemented:**
1. ✅ Split keys into `mainHelperKeys` and `expandedHelperKeys`
2. ✅ Added `isAccessoryExpanded` state toggle
3. ✅ Vertical expansion (expanded row below main row)
4. ✅ Moved Paste, Image, PgUp, PgDn, Snippets to expanded row
5. ✅ Expand button inline with main row ScrollView

**Design Decisions:**
- Expanded row appears BELOW (not above) main row
- Expand button inside main ScrollView for alignment
- Conditional rendering with `&&` instead of ternary

## Open Questions

From the handoff:
> "Does the current layout look correct on device?"

The implementation is complete but needs device testing to verify:
- Expand/collapse animation (mentioned as "next" step)
- Layout correctness on actual iOS device
- Visual alignment of two-row layout

## Potential Enhancement Areas

1. **Voice Input** - No current implementation. Would require:
   - expo-av or react-native-audio-recorder-player
   - Speech-to-text service integration
   - New button in expanded row
   - Microphone permissions

2. **Animation** - Expand/collapse transition (noted in handoff)
   - Could use LayoutAnimation or Animated API
   - Smooth height transition for expandedRow

3. **Customization** - Helper keys are hardcoded
   - Could make configurable per-session
   - Save preferences to AsyncStorage

4. **Haptic Patterns** - Currently single impact
   - Could vary feedback by key type
   - Success/error haptics for actions

## Summary for Voice Integration

If adding voice functionality, the recommended approach would be:

1. **New button in expanded row** (alongside Paste, Image)
2. **Icon:** Microphone from lucide-react-native
3. **Dependencies:** expo-av (already used for ImagePicker ecosystem)
4. **Flow:**
   ```
   User taps Microphone button
     ↓
   Request audio permissions
     ↓
   Start recording (show recording indicator)
     ↓
   Stop recording on second tap
     ↓
   Send audio to speech-to-text API
     ↓
   sendToTerminal(transcribedText)
   ```

5. **State additions:**
   - `isRecording: boolean`
   - `recordingDuration: number` (for timer display)

6. **Integration point:** Lines 631-665 in terminal.tsx (expanded row content)

This would maintain consistency with existing image upload pattern.
