# Plan: Text Input Bar for Keyboard Accessory

## Goal
Add a text input field to the keyboard accessory that allows users to compose text (including using native voice dictation) before sending it to the terminal. This enables hands-free text input via the OS's built-in dictation feature.

## Technical Choices
- **Approach**: Native `TextInput` component - leverages iOS/Android built-in keyboard dictation
- **Placement**: Text input in the expanded accessory row, taking remaining space after action buttons
- **UX Pattern**: Type or dictate → tap Send button → text sent to terminal

## Why This Approach
1. **No dependencies** - Uses React Native's built-in `TextInput`
2. **Works in Expo Go** - No native module or dev build required
3. **Familiar UX** - Users already know the keyboard's mic button
4. **All languages** - Supports whatever the device's dictation supports
5. **Zero maintenance** - OS updates improve dictation automatically

## Current State Analysis

The keyboard accessory is in `app/session/[hostId]/[name]/terminal.tsx`:
- **Collapsed row** (line 600-628): Done, Esc, Tab, arrows, More button
- **Expanded row** (line 629-676): Paste, Image, PgUp/PgDn, snippets

### Key Files:
- `app/session/[hostId]/[name]/terminal.tsx` - Main terminal screen with keyboard accessory

### Existing Patterns:
- `sendToTerminal(data: string)` function sends text to terminal (line 295-300)
- Buttons use `Pressable` with `({ pressed })` style pattern
- Haptic feedback via `expo-haptics`
- Icons from `lucide-react-native`
- Colors from `useTheme()` hook

## Tasks

### Task 1: Add Text Input State
Add state to track the text input value.

- [ ] Add `const [inputText, setInputText] = useState('')`

**Files to modify:**
- `app/session/[hostId]/[name]/terminal.tsx`

### Task 2: Add Text Input to Expanded Row
Replace or augment the expanded row with a text input field and send button.

- [ ] Import `TextInput` from react-native
- [ ] Import `Send` or `CornerDownLeft` icon from lucide-react-native
- [ ] Add `TextInput` with flex: 1 to fill available space
- [ ] Add Send button next to input
- [ ] Style input to match terminal theme (dark background, light text)

**Layout:**
```
[Paste] [Image] [TextInput........................] [Send]
[PgUp] [PgDn] [Snippet1] [Snippet2] ...
```

**Files to modify:**
- `app/session/[hostId]/[name]/terminal.tsx`

### Task 3: Wire Send Functionality
Connect the send button to send text to terminal.

- [ ] On Send press: call `sendToTerminal(inputText)`, clear input, haptic feedback
- [ ] On TextInput submit (return key): same behavior
- [ ] Disable send button when input is empty

**Files to modify:**
- `app/session/[hostId]/[name]/terminal.tsx`

### Task 4: Style the Input
Apply terminal-consistent styling to the text input.

- [ ] Background: `colors.terminalPressed` (matches other buttons)
- [ ] Text color: `colors.terminalForeground`
- [ ] Placeholder: "Type or dictate..." in `colors.terminalMuted`
- [ ] Border radius matching helper keys (10px)
- [ ] Padding matching helper keys

**Files to modify:**
- `app/session/[hostId]/[name]/terminal.tsx`

## Implementation Details

### Layout Structure

The expanded row will be reorganized:

**Row 1 (input row):**
```tsx
<View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12 }}>
  <Pressable ... >{/* Paste */}</Pressable>
  <Pressable ... >{/* Image */}</Pressable>
  <TextInput
    style={{ flex: 1, ... }}
    value={inputText}
    onChangeText={setInputText}
    placeholder="Type or dictate..."
    placeholderTextColor={colors.terminalMuted}
    onSubmitEditing={handleSend}
    returnKeyType="send"
  />
  <Pressable onPress={handleSend} disabled={!inputText}>
    <Send size={16} color={inputText ? colors.terminalForeground : colors.terminalMuted} />
  </Pressable>
</View>
```

**Row 2 (navigation + snippets):**
```tsx
<ScrollView horizontal ...>
  <Pressable>{/* PgUp */}</Pressable>
  <Pressable>{/* PgDn */}</Pressable>
  {snippets.map(...)}
</ScrollView>
```

### Send Handler

```typescript
const handleSendInput = useCallback(() => {
  if (!inputText.trim()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  sendToTerminal(inputText);
  setInputText('');
}, [inputText, sendToTerminal]);
```

## Success Criteria

### Automated Verification:
- [ ] Type check: `pnpm typecheck`
- [ ] Lint: `pnpm lint`

### Manual Verification:
- [ ] Text input appears in expanded keyboard accessory
- [ ] Can type text and send via Send button
- [ ] Can type text and send via Return key
- [ ] Native keyboard mic button triggers dictation
- [ ] Dictated text appears in input field
- [ ] Send button disabled when input empty
- [ ] Input clears after sending
- [ ] Haptic feedback on send
- [ ] Styling matches terminal theme

## Out of Scope
- Custom speech recognition library
- Language selection
- Voice commands
- Multiline input (single line is fine for terminal commands)

## Risks (Pre-Mortem)

### Tigers:
- **Keyboard focus conflicts** (MEDIUM)
  - Mitigation: TextInput in accessory should work since keyboard is already shown
  - Test on both iOS and Android

### Elephants:
- **Dictation availability** (LOW)
  - Note: Some devices may not have dictation enabled
  - This is fine - the input still works for typing
