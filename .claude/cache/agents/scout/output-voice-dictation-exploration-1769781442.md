# Codebase Report: Voice Dictation & Speech Recognition Patterns
Generated: 2026-01-30 (timestamp: 1769781442)

## Summary

NO existing voice dictation, speech recognition, or audio input functionality found in the codebase. This is a greenfield implementation opportunity.

## Project Structure

```
portal/
├── app/                    # React Native app (Expo)
│   ├── (tabs)/            # Main tab navigation
│   ├── session/           # Terminal session views
│   ├── hosts/             # Host management
│   └── projects/          # Project management
├── components/            # Reusable UI components
│   ├── Field.tsx         # Standard text input field
│   ├── SearchBar.tsx     # Search input with clear button
│   └── AppText.tsx       # Themed text component
├── lib/                   # Utilities and shared logic
├── agent/                 # Node.js backend agent
└── package.json          # Expo SDK 54, React Native 0.81.5
```

## Questions Answered

### Q1: Does the codebase use expo-speech or expo-av?

**Answer:** NO (✓ VERIFIED)

**Evidence:**
- Ran `npm list expo-speech` → not installed
- Checked `package.json` → no speech/audio packages
- Grepped entire codebase → no imports of expo-speech or expo-av

**Dependencies in package.json:**
```json
{
  "expo": "~54.0.32",
  "expo-haptics": "^15.0.8",
  "expo-clipboard": "~8.0.7",
  // NO expo-speech
  // NO expo-av
  // NO react-native-voice
}
```

**Note:** `expo-av` was checked for removal in SDK 55 upgrade plan but confirmed NOT used.

### Q2: Is there existing microphone permission handling?

**Answer:** NO (✓ VERIFIED)

**iOS Permissions (app.json):**
```json
"ios": {
  "infoPlist": {
    "NSLocalNetworkUsageDescription": "Find tmux agents on your local network."
    // NO NSMicrophoneUsageDescription
  }
}
```

**Android Permissions (app.json):**
```json
"android": {
  "package": "systems.kaia.portal",
  // NO android.permissions array
  // NO RECORD_AUDIO permission
}
```

**Grep Results:**
- Searched for `RECORD_AUDIO` → 0 matches
- Searched for `MICROPHONE` → 0 matches
- Searched for `AudioRecord` → 0 matches

### Q3: Are there voice input UI components?

**Answer:** NO (✓ VERIFIED)

**Existing Input Components:**

| Component | File | Purpose | Voice? |
|-----------|------|---------|--------|
| `Field` | `components/Field.tsx` | Labeled text input | No |
| `SearchBar` | `components/SearchBar.tsx` | Search input with clear button | No |
| Various forms | `app/hosts/new.tsx`, etc. | Host/project creation forms | No |

**Pattern Analysis:**
- All inputs use standard `TextInput` from React Native
- No microphone icons in component library (lucide-react-native)
- No voice-related state management
- No audio recording hooks

### Q4: Is there speech-to-text integration?

**Answer:** NO (✓ VERIFIED)

**Search Results:**
- `speech-to-text` → 0 matches
- `SpeechRecognition` → 0 matches (only in node_modules)
- `recognition` pattern → 0 matches in app code
- No API calls to speech services

## Conventions Discovered

### Input Component Patterns

**1. Field Component Pattern**
```typescript
// components/Field.tsx
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}
```

**Key conventions:**
- Use `useTheme()` hook for colors
- Spread `TextInputProps` for flexibility
- Style with `StyleSheet.create()` using theme constants
- Use `AppText` for labels

**2. SearchBar Pattern**
```typescript
// components/SearchBar.tsx
export function SearchBar({ value, onChangeText, placeholder }: SearchBarProps) {
  return (
    <Card>
      <AppText style={styles.icon}>⌕</AppText>
      <TextInput value={value} onChangeText={onChangeText} />
      {value && <Pressable onPress={() => onChangeText('')}>✕</Pressable>}
    </Card>
  );
}
```

**Key conventions:**
- Icon prefix (e.g., `⌕` for search)
- Clear button when text present
- Wrapped in `Card` component
- No autocorrect/autocapitalize for search

### Naming Conventions

| Pattern | Example | Usage |
|---------|---------|-------|
| Components | `PascalCase` | `Field`, `SearchBar`, `AppText` |
| Files | `PascalCase.tsx` | `Field.tsx`, `SearchBar.tsx` |
| Props types | `{Name}Props` | `SearchBarProps` |
| Style creator | `createStyles` | `const createStyles = (colors) => StyleSheet.create(...)` |

### Theme Usage

All components use the theme system:

```typescript
import { theme } from '@/lib/theme';
import { ThemeColors, useTheme } from '@/lib/useTheme';

const { colors } = useTheme();
const styles = useMemo(() => createStyles(colors), [colors]);
```

**Theme constants:**
- `theme.spacing.sm`, `theme.spacing.md`
- `theme.radii.md`
- `colors.text`, `colors.textMuted`, `colors.border`, `colors.card`

## Architecture Map

```
[App Entry] --> [Expo Router] --> [Tab Navigation]
                                        |
                                   [Screens]
                                        |
                                  [Components]
                                        |
                              [TextInput (React Native)]
```

**Input Flow (Current):**
1. User taps text field
2. Keyboard appears
3. User types
4. `onChangeText` callback fires
5. State updates via React hooks

**No Audio Flow Exists**

## Key Files for Voice Integration

If adding voice dictation, these files would be relevant:

| File | Purpose | Why Relevant |
|------|---------|--------------|
| `components/Field.tsx` | Standard input field | Add voice button here |
| `components/SearchBar.tsx` | Search input | Voice search use case |
| `lib/theme.ts` | Theme constants | Add voice button colors |
| `lib/useTheme.tsx` | Theme hook | Access colors in voice components |
| `app.json` | App config | Add microphone permissions |
| `package.json` | Dependencies | Install expo-speech or alternative |

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Expo | ~54.0.32 |
| React Native | RN | 0.81.5 |
| React | React | 19.1.0 |
| Navigation | expo-router | ~6.0.22 |
| UI Icons | lucide-react-native | ^0.562.0 |
| State | React hooks | Built-in |

**Note:** SDK 55 upgrade planned (see `PLAN-expo-sdk-55-upgrade.md`)

## Voice Dictation Options (Recommendations)

### Option 1: expo-speech (Official)
```bash
npx expo install expo-speech
```

**Pros:**
- Official Expo package
- Works with Expo Go
- Simple API
- Auto-handles permissions

**Cons:**
- May not be available (expo-av was removed in SDK 55)
- Need to verify SDK 54/55 compatibility

### Option 2: react-native-voice
```bash
npm install @react-native-voice/voice
```

**Pros:**
- Popular community package
- Real-time recognition
- Multiple languages

**Cons:**
- Requires native build (no Expo Go)
- Manual permission handling
- More complex setup

### Option 3: Web Speech API (Web Only)
Use browser's `SpeechRecognition` API.

**Pros:**
- No dependencies
- Free

**Cons:**
- Web platform only
- Not available on native iOS/Android

## Permissions Required

### iOS (app.json)
```json
"ios": {
  "infoPlist": {
    "NSMicrophoneUsageDescription": "Enable voice dictation for faster input.",
    "NSSpeechRecognitionUsageDescription": "Convert your speech to text."
  }
}
```

### Android (app.json)
```json
"android": {
  "permissions": [
    "RECORD_AUDIO"
  ]
}
```

### Runtime Permission Check
```typescript
import * as Permissions from 'expo-permissions';

const { status } = await Permissions.askAsync(Permissions.AUDIO_RECORDING);
if (status !== 'granted') {
  // Handle denied
}
```

## Implementation Pattern Suggestion

Based on existing conventions, a voice-enabled Field would look like:

```typescript
// components/VoiceField.tsx
import { Field } from './Field';
import { Pressable } from 'react-native';
import { Mic } from 'lucide-react-native';

export function VoiceField({ label, value, onChangeText, ...props }) {
  const { colors } = useTheme();
  const [isRecording, setIsRecording] = useState(false);

  const handleVoicePress = async () => {
    // Check permissions
    // Start/stop recording
    // Convert to text
    // Call onChangeText()
  };

  return (
    <View>
      <Field label={label} value={value} onChangeText={onChangeText} {...props} />
      <Pressable onPress={handleVoicePress} style={styles.micButton}>
        <Mic color={isRecording ? colors.primary : colors.textSecondary} size={20} />
      </Pressable>
    </View>
  );
}
```

## Open Questions

1. **Which screens need voice input?**
   - Search bars? (likely yes)
   - Host creation forms? (maybe)
   - Terminal input? (interesting use case)

2. **Language support?**
   - English only initially?
   - Multi-language support needed?

3. **Offline vs Online?**
   - Device speech recognition (offline, limited)
   - Cloud API (online, more accurate, costs)

4. **UX Pattern?**
   - Button next to input field?
   - Hold-to-speak gesture?
   - Toggle between keyboard/voice?

## References

- Expo SDK 54: https://docs.expo.dev/versions/v54.0.0/
- Expo SDK 55 Upgrade Plan: `thoughts/shared/plans/PLAN-expo-sdk-55-upgrade.md`
- Existing components: `components/Field.tsx`, `components/SearchBar.tsx`
- Theme system: `lib/theme.ts`, `lib/useTheme.tsx`
