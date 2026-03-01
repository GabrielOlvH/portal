# Plan: Android/Tablet Support Fixes

## Goal
Fix multiple Android and tablet-specific issues in the Portal app:
1. Native tabs icons/text not showing on Android
2. Keyboard instantly collapsing on Android
3. Keyboard accessory bar positioning issues
4. Cannot scroll between terminals on tablet
5. Add bottom session bar for tablet/larger screens

## Technical Choices
- **Tab Navigation**: Use platform-specific implementation - NativeTabs for iOS, standard Tabs for Android (expo-router unstable-native-tabs has known Android issues)
- **Tablet Detection**: Use `useWindowDimensions` with 600dp breakpoint (standard Material Design tablet threshold)
- **Keyboard Handling**: Add `react-native-keyboard-controller` for consistent cross-platform keyboard behavior
- **Session Bar**: New component that shows active sessions as a bottom bar on tablets

## Current State Analysis

### Key Files:
- `app/(tabs)/_layout.tsx` - Tab navigation using NativeTabs (iOS-only SF Symbols)
- `app/session/[hostId]/[name]/terminal.tsx` - Terminal screen with keyboard handling
- `components/TerminalWebView.tsx` - WebView wrapper with keyboard props
- `lib/terminal-html.ts` - Terminal HTML with scroll handling

### Issues Identified:
1. **NativeTabs Icons**: Uses SF Symbols (`sf: { default: 'terminal' }`) which are iOS-only. Android gets nothing.
2. **Keyboard Collapse**: Android WebView + keyboard events race condition. `keyboardDidShow` fires then keyboard immediately dismisses.
3. **Accessory Position**: `bottom: keyboardOffset` positioning may not account for Android differences.
4. **Terminal Scrolling**: Horizontal ScrollView with `pagingEnabled` should work, but may be blocked by WebView gesture handling on Android.
5. **No Tablet Session Bar**: No detection for larger screens exists.

## Tasks

### Task 1: Create Device Detection Hook
Create a reusable hook for detecting device type and screen size.

- [ ] Create `lib/useDeviceType.ts` with `useDeviceType()` hook
- [ ] Return `{ isTablet, isPhone, screenWidth, screenHeight }`
- [ ] Use 600dp minimum dimension as tablet threshold

**Files to create:**
- `lib/useDeviceType.ts`

### Task 2: Fix Tab Navigation for Android
Replace iOS-only NativeTabs with platform-specific implementation.

- [ ] Create Android-compatible icon components using lucide-react-native
- [ ] Use Platform.select to render NativeTabs on iOS, standard Tabs on Android
- [ ] Ensure both platforms have consistent icon/label styling

**Files to modify:**
- `app/(tabs)/_layout.tsx`

### Task 3: Fix Android Keyboard Handling
Address keyboard instantly collapsing issue on Android WebView.

- [ ] Add `android:windowSoftInputMode="adjustResize"` to AndroidManifest.xml
- [ ] Modify keyboard event handling with Android-specific debouncing
- [ ] Add `keyboardShouldPersistTaps="handled"` to any ScrollViews near inputs
- [ ] Consider adding fallback manual focus management for Android WebView

**Files to modify:**
- `android/app/src/main/AndroidManifest.xml`
- `app/session/[hostId]/[name]/terminal.tsx`
- `components/TerminalWebView.tsx`

### Task 4: Fix Keyboard Accessory Positioning
Ensure accessory bar appears correctly on Android.

- [ ] Use Platform.select for bottom offset calculations
- [ ] Account for Android navigation bar height
- [ ] Test with both gesture navigation and button navigation

**Files to modify:**
- `app/session/[hostId]/[name]/terminal.tsx`

### Task 5: Fix Terminal Horizontal Scrolling on Android
Ensure horizontal paging works on Android tablets.

- [ ] Add `nestedScrollEnabled` to ScrollView if not present
- [ ] Disable WebView gesture handling during pager scroll
- [ ] Use `scrollEnabled` prop tied to gesture state

**Files to modify:**
- `app/session/[hostId]/[name]/terminal.tsx`

### Task 6: Add Tablet Session Bar
Create bottom bar showing active sessions on larger screens.

- [ ] Create `components/TabletSessionBar.tsx` component
- [ ] Show horizontally scrollable list of active sessions
- [ ] Highlight current session, allow tap to switch
- [ ] Only render when `isTablet` is true
- [ ] Position at bottom of terminal screen

**Files to create:**
- `components/TabletSessionBar.tsx`

**Files to modify:**
- `app/session/[hostId]/[name]/terminal.tsx`

## Success Criteria

### Automated Verification:
- [ ] Type check passes: `pnpm typecheck`
- [ ] Lint passes: `pnpm lint`
- [ ] Build succeeds: `pnpm expo prebuild --clean && cd android && ./gradlew assembleDebug`

### Manual Verification:
- [ ] Android: Tab icons and labels visible
- [ ] Android: Keyboard opens and stays open when tapping terminal
- [ ] Android: Keyboard accessory bar positioned correctly above keyboard
- [ ] Android Tablet: Can swipe horizontally between terminal sessions
- [ ] Android Tablet: Bottom session bar visible with active sessions
- [ ] iOS: All existing functionality unchanged (regression test)

## Out of Scope
- iPad split-view support
- Keyboard shortcuts for physical keyboards
- react-native-keyboard-controller integration (can be added later if needed)
- Foldable phone detection edge cases

## Risks (Pre-Mortem)

### Tigers:
- **expo-router standard Tabs may look different from NativeTabs** (MEDIUM)
  - Mitigation: Style the Tabs component to match iOS appearance
- **Android WebView keyboard behavior varies by device/OS version** (HIGH)
  - Mitigation: Test on multiple Android versions, add version-specific workarounds if needed
- **Breaking iOS functionality while fixing Android** (MEDIUM)
  - Mitigation: Use Platform.OS checks, test iOS after each change

### Elephants:
- **expo-router/unstable-native-tabs is alpha** (MEDIUM)
  - Note: May need to revisit this entirely when stable version releases
