---
root_span_id: 85d83fa0-8507-4e28-9ed8-e64e3c97d4ae
turn_span_id: f9bdad59-2492-461e-a8c4-5324a29893d2
session_id: 85d83fa0-8507-4e28-9ed8-e64e3c97d4ae
date: 2026-01-30
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-voice-dictation-keyboard-accessory.md
---

# Plan Handoff: Voice Dictation for Keyboard Accessory

## Summary
Plan created to add voice dictation to the terminal keyboard accessory using `expo-speech-recognition`. Users will tap a microphone button to speak text that gets transcribed and sent to the terminal.

## Plan Created
`thoughts/shared/plans/PLAN-voice-dictation-keyboard-accessory.md`

## Key Technical Decisions
- **Library**: `expo-speech-recognition` by @jamsch - Native Expo module with config plugin, supports real-time results, tested with SDK 51-54
- **Placement**: Voice button in expanded accessory row (after Paste, before Image)
- **UX**: Tap to start/stop (not press-and-hold) with visual feedback via background color change

## Task Overview
1. **Install expo-speech-recognition** - Add dependency and configure Expo plugin for permissions
2. **Create voice dictation hook** - Reusable `useVoiceDictation` hook encapsulating speech recognition logic
3. **Add voice button to accessory** - Mic icon in expanded row, wired to hook
4. **Add recording visual feedback** - Red/accent background when recording, haptic feedback
5. **Handle permissions flow** - Graceful handling when permissions denied

## Research Findings
- `expo-speech-recognition` is the recommended library for Expo managed workflow (requires dev build, not Expo Go)
- Terminal keyboard accessory is in `app/session/[hostId]/[name]/terminal.tsx:597-679`
- Existing `sendToTerminal()` function at line 295-300 handles sending text
- Existing patterns: `Pressable` with pressed styles, `expo-haptics`, `lucide-react-native` icons
- iOS requires both Microphone + Speech Recognition permissions
- Android requires only Microphone permission
- Continuous mode works only on Android 13+

## Assumptions Made
- Device locale will be used for speech recognition language (no language picker for V1)
- Network-based recognition is acceptable (on-device is device-dependent)
- Development build workflow is acceptable (cannot use Expo Go)
- Tap-to-toggle is preferred over press-and-hold

## For Next Steps
- User should review plan at: `thoughts/shared/plans/PLAN-voice-dictation-keyboard-accessory.md`
- After approval, run `/implement_plan` with the plan path
- Note: Requires `npx expo run:ios` or `npx expo run:android` after adding the plugin (not Expo Go)
