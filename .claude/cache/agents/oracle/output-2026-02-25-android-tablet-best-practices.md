# Research Report: React Native / Expo Android Tablet Best Practices (2024-2025)
Generated: 2026-02-25

## Summary

Android tablet development in React Native/Expo requires careful attention to platform-specific behaviors that diverge significantly from iOS. The major pain points are: (1) keyboard handling in WebViews, (2) gesture conflict between nested scrollable/pageable components, (3) edge-to-edge display enforcement starting with Android 15/SDK 35, (4) dimension APIs returning incorrect values in certain Android modes, and (5) expo-router's unstable-native-tabs having known icon rendering bugs on Android. The ecosystem has matured with libraries like `react-native-keyboard-controller`, `react-native-edge-to-edge`, and `react-native-external-keyboard` specifically addressing tablet/Android gaps.

## Questions Answered

### Q1: Tab Navigation and Terminal Switching on Tablets
**Answer:** For tablets, use a combination of approaches:
- **Bottom tabs** for primary navigation (use standard `Tabs` from expo-router on Android, not `NativeTabs` which relies on iOS-only SF Symbols)
- **Material Top Tabs** (`@react-navigation/material-top-tabs` + `react-native-tab-view` + `react-native-pager-view`) for terminal/session switching
- **Permanent drawer** (`drawerType: "permanent"`) for always-visible sidebar on tablets
- On Android, `react-native-pager-view` backs tab-view swiping natively

**Key API props:**
```tsx
// For tab-view based terminal switching
<TabView
  swipeEnabled={true}
  lazy={true}
  renderLazyPlaceholder={() => <ActivityIndicator />}
  // IMPORTANT: on Android tablets, use overdrag to prevent gesture conflicts
  overdrag={Platform.OS === 'android'}
/>

// For permanent drawer on tablets
<Drawer.Navigator
  screenOptions={{
    drawerType: isTablet ? 'permanent' : 'front',
    drawerStyle: isTablet ? { width: 280 } : undefined,
  }}
/>
```

**Source:** [React Navigation Tab View](https://reactnavigation.org/docs/tab-view/), [Drawer Navigator](https://reactnavigation.org/docs/drawer-navigator/)
**Confidence:** High

---

### Q2: Touch Event Handling Differences (Android Tablets vs iOS)
**Answer:** Critical platform differences:

1. **Transparent overlay views**: On Android, touch events pass through transparent Views to underlying Views. On iOS they do NOT. Fix: `pointerEvents="box-none"` on overlays.

2. **Absolute positioned nested touchables**: Android renders children correctly but does NOT handle touch events in nested absolute-positioned views. iOS works fine. Workaround: flatten the view hierarchy or use `elevation` on Android.

3. **Ripple feedback**: Use `TouchableNativeFeedback` (Android-only) for ink ripple effects. `TouchableOpacity` as cross-platform fallback. In modern RN, prefer `Pressable` with `android_ripple` prop:
```tsx
<Pressable
  android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
  style={({ pressed }) => [
    { opacity: Platform.OS === 'ios' && pressed ? 0.7 : 1 }
  ]}
/>
```

4. **Touch slop**: Android has a larger default touch slop (8dp) compared to iOS. For small touch targets on tablets (where precision is higher with larger fingers/stylus), consider adjusting `hitSlop`.

**Source:** [React Native Touches](https://reactnative.dev/docs/handling-touches), [GitHub Issue #12360](https://github.com/facebook/react-native/issues/12360), [GitHub Issue #27333](https://github.com/facebook/react-native/issues/27333)
**Confidence:** High

---

### Q3: Keyboard Handling on Android Tablets
**Answer:** Three separate concerns:

#### Software Keyboard
- **react-native-keyboard-controller** (v1.20.6, actively maintained) is the recommended library. It works identically on iOS and Android.
- Provides `KeyboardController.setWindowSoftInputMode()` for runtime mode switching
- Expo SDK 54 compatible via `expo-keyboard-controller`
- Key APIs: `useKeyboardHandler`, `KeyboardAvoidingView` (from the library, NOT React Native's), `KeyboardExtender`

```tsx
import { KeyboardController } from 'react-native-keyboard-controller';

// Per-screen soft input mode (critical for terminal screens)
KeyboardController.setWindowSoftInputMode(
  AndroidSoftInputModes.SOFT_INPUT_ADJUST_RESIZE
);
```

#### Hardware/External Keyboard
- **react-native-external-keyboard** provides physical keyboard support
- Captures keyCode, unicode, modifier keys (Alt, Shift, Ctrl), CapsLock
- For Android: requires overriding `onKeyDown`, `onKeyUp`, `onKeyMultiple` in MainActivity
- Alternative: **react-native-keyevent** for simpler key capture

```tsx
// react-native-external-keyboard pattern
import { ExternalKeyboard } from 'react-native-external-keyboard';

<ExternalKeyboard
  onKeyDown={(event) => {
    // event.keyCode, event.unicode, event.modifiers
    if (event.modifiers.ctrl && event.keyCode === 67) {
      // Ctrl+C
    }
  }}
/>
```

#### WebView Keyboard Issues (CRITICAL for Portal)
- **Known bug**: Android WebView keyboard "shaking" (opens/closes rapidly) - documented in react-native-webview issues #3454 and #3567
- Affects Samsung devices especially (Galaxy S23 Ultra on Android 13 confirmed)
- `windowSoftInputMode="adjustResize"` and `adjustPan` do NOT reliably fix this
- **Workaround**: Use `onMessage` bridge to manage focus from React Native side, add debouncing to keyboard events

**Source:** [Expo Keyboard Handling](https://docs.expo.dev/guides/keyboard-handling/), [react-native-keyboard-controller](https://github.com/kirillzyusko/react-native-keyboard-controller), [react-native-external-keyboard](https://github.com/ArturKalach/react-native-external-keyboard), [WebView Issue #3454](https://github.com/react-native-webview/react-native-webview/issues/3454)
**Confidence:** High

---

### Q4: Safe Area Insets on Android Tablets
**Answer:**

#### Library: `react-native-safe-area-context`
The standard and recommended approach. Two main APIs:

```tsx
// Hook approach (preferred for fine control)
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function Screen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{
      paddingTop: insets.top,
      paddingBottom: insets.bottom,
      paddingLeft: insets.left,    // Important for tablets in landscape!
      paddingRight: insets.right,  // Important for tablets in landscape!
    }}>
      {children}
    </View>
  );
}
```

#### Android-Specific Issues
1. **Android 15+ (SDK 35) bug**: `SafeAreaProvider` top inset does NOT correctly account for status bar and display cutouts on some devices (Samsung S21 Ultra, OnePlus 11R). Tracked in [issue #634](https://github.com/AppAndFlow/react-native-safe-area-context/issues/634).

2. **Edge-to-edge interaction**: With `edgeToEdgeEnabled: true` in app.json (which Portal has), safe area insets become essential since content extends behind system bars.

3. **`adjustPan` + safe area bug**: When `windowSoftInputMode="adjustPan"`, the top inset changes on keyboard dismissal on Android ([issue #29](https://github.com/AppAndFlow/react-native-safe-area-context/issues/29)).

4. **Tablet landscape**: Android tablets in landscape report LEFT and RIGHT insets for camera cutouts and rounded corners. Always use `insets.left` and `insets.right`, not just top/bottom.

#### Setup Required
```tsx
// Must wrap app root AND modal roots
<SafeAreaProvider>
  <NavigationContainer>
    {/* app content */}
  </NavigationContainer>
</SafeAreaProvider>
```

**Source:** [Expo Safe Areas](https://docs.expo.dev/develop/user-interface/safe-areas/), [react-native-safe-area-context](https://github.com/AppAndFlow/react-native-safe-area-context)
**Confidence:** High

---

### Q5: Viewport/Window Sizing Issues on Android Tablets
**Answer:** Multiple documented issues:

#### `useWindowDimensions` Problems
1. **Translucent system UI / edge-to-edge**: Window height does NOT include navigation bar height when translucent. This affects Portal since `edgeToEdgeEnabled: true` is set. ([Issue #41918](https://github.com/facebook/react-native/issues/41918))

2. **Android 14/15 inconsistency**: `Dimensions.get('window').height` returns inconsistent values across Android 14 and 15. ([Issue #47080](https://github.com/facebook/react-native/issues/47080))

3. **Split-screen/multi-window**: On Android tablets, `Dimensions.get('window')` may not update when entering split-screen mode. `useWindowDimensions` is supposed to fix this but had bugs in certain RN versions. ([Issue #30371](https://github.com/facebook/react-native/issues/30371))

4. **Fullscreen landscape**: Wrong height reported when status bar and nav bar are hidden. ([Issue #33735](https://github.com/facebook/react-native/issues/33735))

5. **Picture-in-Picture**: Returns PiP window dimensions instead of main window. ([Issue #34324](https://github.com/facebook/react-native/issues/34324))

#### Recommended Solution
```tsx
import { useSafeAreaFrame } from 'react-native-safe-area-context';

function MyComponent() {
  // MORE RELIABLE than useWindowDimensions on Android
  const { width, height, x, y } = useSafeAreaFrame();

  const isTablet = Math.min(width, height) >= 600;
  // ...
}
```

`useSafeAreaFrame()` returns the frame of the nearest SafeAreaProvider and is NOT affected by the edge-to-edge / translucent system UI bugs that plague `useWindowDimensions`.

#### Tablet Detection Pattern
```tsx
import { useSafeAreaFrame } from 'react-native-safe-area-context';
import { PixelRatio } from 'react-native';

function useDeviceType() {
  const { width, height } = useSafeAreaFrame();
  const minDimension = Math.min(width, height);

  // Material Design tablet breakpoint: 600dp
  const isTablet = minDimension >= 600;
  const isLargeTablet = minDimension >= 840;

  return { isTablet, isLargeTablet, width, height };
}
```

**Source:** [RN Dimensions docs](https://reactnative.dev/docs/dimensions), [useSafeAreaFrame API](https://appandflow.github.io/react-native-safe-area-context/api/use-safe-area-frame/), multiple GitHub issues linked above
**Confidence:** High

---

### Q6: Common Pitfalls with Gesture Handlers on Android Tablets
**Answer:**

#### 1. SDK 35 Crash
**react-native-gesture-handler** crashes on Android SDK 35 (`NoSuchMethodError` in `GestureHandlerOrchestrator`). Fix: upgrade to latest RNGH version (2.20+). ([Issue #3594](https://github.com/software-mansion/react-native-gesture-handler/issues/3594))

#### 2. Pressable Stops Working (Intermittent)
On Android, `Pressable` components from RNGH can randomly stop responding. Reported April 2025. ([Issue #3476](https://github.com/software-mansion/react-native-gesture-handler/issues/3476))

#### 3. Nested Gesture Conflicts
Buttons inside swipeable cards become unresponsive on Android (work fine on iOS). Fix: use `disallowInterruption` and explicit gesture composition.

#### 4. ScrollView + Pan Gesture
Pan gestures inside ScrollView block scrolling on Android. Fix:
```tsx
import { ScrollView } from 'react-native-gesture-handler'; // NOT from react-native!

// Use RNGH's ScrollView + simultaneousHandlers
const scrollRef = useRef();

const panGesture = Gesture.Pan()
  .simultaneousWithExternalGesture(scrollRef)
  .onUpdate((e) => { /* ... */ });

<GestureDetector gesture={panGesture}>
  <ScrollView ref={scrollRef} waitFor={panGesture}>
    {/* content */}
  </ScrollView>
</GestureDetector>
```

#### 5. PagerView + Horizontal Scroll Conflict (RELEVANT for Portal terminal paging)
`react-native-pager-view` inside or alongside horizontal ScrollViews causes gesture stealing on Android. The PagerView intercepts horizontal swipes even when a nested horizontal FlatList should handle them.

**Workaround**:
```tsx
// Option A: Use PagerView's onPageScrollStateChanged to coordinate
<PagerView
  onPageScrollStateChanged={(e) => {
    // 'idle' | 'dragging' | 'settling'
    setScrollEnabled(e.nativeEvent.pageScrollState === 'idle');
  }}
/>

// Option B: For WebView inside PagerView, disable WebView scrolling during page transitions
<WebView
  scrollEnabled={!isPagerDragging}
  nestedScrollEnabled={true}
/>
```

#### 6. WebView Gesture Interception
WebViews consume all touch events on Android, making it impossible for parent gesture handlers to receive them. This is the ROOT CAUSE of "cannot swipe between terminals on tablet".

**Workaround approaches**:
- Use an invisible overlay `View` with `pointerEvents="box-none"` that captures horizontal swipes and passes through taps
- Use `PagerView` (native Android ViewPager) which handles page-level swipes at the native level, OUTSIDE the WebView's touch handling
- Inject JavaScript to detect horizontal swipe start in WebView and call `window.ReactNativeWebView.postMessage()` to signal RN

**Source:** [RNGH GitHub Issues](https://github.com/software-mansion/react-native-gesture-handler/issues), [PagerView Issue #1049](https://github.com/callstack/react-native-pager-view/issues/1049), [PagerView Issue #450](https://github.com/callstack/react-native-pager-view/issues/450)
**Confidence:** High

---

### Q7: Best Practices for Layouts (iOS Mobile + Android Tablets)
**Answer:**

#### Core Principles
1. **Never use fixed pixel sizes** for layout dimensions
2. **Use `useSafeAreaFrame()`** instead of `useWindowDimensions()` for reliable sizing on Android
3. **Use breakpoints** based on minimum dimension (dp), not platform detection
4. **Use Flexbox** with `flex: 1` for main containers, percentage widths for columns

#### Breakpoint System
```tsx
const BREAKPOINTS = {
  phone: 0,      // < 600dp min dimension
  tablet: 600,   // >= 600dp (Material Design standard)
  largeTablet: 840,
  desktop: 1200,
};

function useBreakpoint() {
  const { width, height } = useSafeAreaFrame();
  const minDim = Math.min(width, height);
  const maxDim = Math.max(width, height);

  if (minDim >= 840) return 'largeTablet';
  if (minDim >= 600) return 'tablet';
  return 'phone';
}
```

#### Adaptive Layout Pattern
```tsx
function AppLayout({ children }) {
  const breakpoint = useBreakpoint();

  if (breakpoint === 'phone') {
    return <Stack>{children}</Stack>;  // Full-screen stacked
  }

  // Tablet: sidebar + content
  return (
    <View style={{ flexDirection: 'row', flex: 1 }}>
      <View style={{ width: 280 }}>
        <Sidebar />
      </View>
      <View style={{ flex: 1 }}>
        {children}
      </View>
    </View>
  );
}
```

#### Platform-Specific Navigation
```tsx
// Android tablets: burger menu / drawer pattern
// iOS: bottom tabs pattern
// Use both conditionally:
const tabPosition = Platform.select({
  ios: 'bottom',
  android: isTablet ? 'left' : 'bottom',  // Side rail on Android tablets
});
```

#### Orientation Handling
```tsx
// In app.json, for tablets allow all orientations:
{
  "expo": {
    "orientation": "default",  // NOT "portrait" for tablet support
    // Or use platform-specific:
    "ios": { "requireFullScreen": false },
    "android": {
      // Remove android:screenOrientation="portrait" from AndroidManifest
    }
  }
}
```

**IMPORTANT for Portal**: The current `app.json` has `"orientation": "portrait"` and `AndroidManifest.xml` has `android:screenOrientation="portrait"`. For tablet support, these should be changed to allow landscape.

**Source:** [LogRocket Adaptive UIs](https://blog.logrocket.com/creating-adaptive-responsive-uis-react-native/), [BrowserStack Responsive Guide](https://www.browserstack.com/guide/how-to-make-react-native-app-responsive)
**Confidence:** High

---

### Q8: React Navigation Tablet Patterns
**Answer:**

#### Permanent Drawer for Tablets
```tsx
import { createDrawerNavigator } from '@react-navigation/drawer';

const Drawer = createDrawerNavigator();

function RootNavigator() {
  const { isTablet } = useDeviceType();

  return (
    <Drawer.Navigator
      screenOptions={{
        drawerType: isTablet ? 'permanent' : 'front',
        drawerStyle: {
          width: isTablet ? 280 : '80%',
        },
        overlayColor: isTablet ? 'transparent' : 'rgba(0,0,0,0.5)',
      }}
    >
      <Drawer.Screen name="Home" component={HomeScreen} />
      <Drawer.Screen name="Terminal" component={TerminalScreen} />
    </Drawer.Navigator>
  );
}
```

#### Tab + Drawer Hybrid (Tablet)
```tsx
// Phone: Bottom tabs
// Tablet: Side drawer (permanent) + content area

function Navigation() {
  const { isTablet } = useDeviceType();

  if (isTablet) {
    return (
      <Drawer.Navigator screenOptions={{ drawerType: 'permanent' }}>
        {/* screens */}
      </Drawer.Navigator>
    );
  }

  return (
    <Tab.Navigator>
      {/* same screens, different container */}
    </Tab.Navigator>
  );
}
```

#### React Navigation 8.0 (Alpha, late 2025)
- New `createDrawerScreen` helper
- Feature request exists for "Tablet dual pane support" ([Canny](https://react-navigation.canny.io/feature-requests/p/tablet-dual-pane-support)) but not yet implemented natively
- For now, dual-pane must be implemented manually with flexDirection row layout

**Source:** [React Navigation Drawer](https://reactnavigation.org/docs/drawer-navigator/), [React Navigation 8.0 Alpha](https://reactnavigation.org/blog/2025/12/19/react-navigation-8.0-alpha/)
**Confidence:** High

---

### Q9: KeyboardAvoidingView Behavior Differences on Android Tablets
**Answer:**

#### The Core Problem
`KeyboardAvoidingView` from React Native is UNRELIABLE on Android, especially with:
- `behavior="height"` + `windowSoftInputMode="adjustResize"` (broken, [Issue #36019](https://github.com/facebook/react-native/issues/36019))
- Android 15 / SDK 35 with edge-to-edge (broken, [Issue #49759](https://github.com/facebook/react-native/issues/49759))
- Any mode in combination with transparent/translucent system bars

#### Platform Behavior Matrix

| Config | iOS | Android (adjustResize) | Android (adjustPan) |
|--------|-----|----------------------|---------------------|
| `behavior="padding"` | Works | Partially works | May double-offset |
| `behavior="height"` | Works | BROKEN | Partially works |
| `behavior="position"` | Works | Works for simple forms | Works for simple forms |
| With edge-to-edge | N/A | BROKEN on SDK 35 | May work |

#### Recommended Solution: react-native-keyboard-controller
```tsx
import {
  KeyboardAvoidingView,
  KeyboardProvider,
} from 'react-native-keyboard-controller';

// Wrap app root
<KeyboardProvider>
  <App />
</KeyboardProvider>

// In screens (replaces RN's KeyboardAvoidingView)
<KeyboardAvoidingView
  behavior="padding"
  keyboardVerticalOffset={0}
>
  {/* content */}
</KeyboardAvoidingView>
```

#### For WebView-based terminals specifically
```tsx
// Don't use KeyboardAvoidingView at all for WebView terminals.
// Instead, use windowSoftInputMode per-screen:
import { KeyboardController, AndroidSoftInputModes } from 'react-native-keyboard-controller';

useEffect(() => {
  if (Platform.OS === 'android') {
    // adjustResize lets the WebView resize with keyboard
    KeyboardController.setWindowSoftInputMode(
      AndroidSoftInputModes.SOFT_INPUT_ADJUST_RESIZE
    );
    return () => {
      // Reset to default when leaving screen
      KeyboardController.setWindowSoftInputMode(
        AndroidSoftInputModes.SOFT_INPUT_ADJUST_UNSPECIFIED
      );
    };
  }
}, []);
```

#### Alternative: react-native-avoid-softinput
For cases where react-native-keyboard-controller is too heavy:
```tsx
import { AvoidSoftInput } from 'react-native-avoid-softinput';

// Enable per-screen
AvoidSoftInput.setEnabled(true);
AvoidSoftInput.setAvoidOffset(16); // extra padding above keyboard
```

**Source:** [KeyboardAvoidingView docs](https://reactnative.dev/docs/keyboardavoidingview), [Issue #36019](https://github.com/facebook/react-native/issues/36019), [Issue #49759](https://github.com/facebook/react-native/issues/49759), [react-native-keyboard-controller](https://kirillzyusko.github.io/react-native-keyboard-controller/)
**Confidence:** High

---

### Q10: Known Issues with Expo Router on Android Tablets
**Answer:**

#### 1. NativeTabs Icons Missing on Android
`expo-router/unstable-native-tabs` does NOT render icons on Android production builds. The `sf` prop only works with iOS SF Symbols. For Android, you must use the `md` (Material Design) or `drawable` prop.

**Fix**: Use platform-specific icon props:
```tsx
<NativeTabs.Screen
  name="terminal"
  options={{
    tabBarIcon: Platform.select({
      ios: { sf: { default: 'terminal' } },
      android: { md: { default: 'terminal' } },
    }),
  }}
/>
```

Or better: **abandon NativeTabs on Android entirely** and use standard `Tabs` from expo-router with custom icon components.

([Issue #41031](https://github.com/expo/expo/issues/41031), [Issue #41049](https://github.com/expo/expo/issues/41049))

#### 2. Predictive Back Gesture Breaks Navigation
On Android devices with predictive back gesture enabled, back navigation with swipe does not work with Expo Router. Portal has `"predictiveBackGestureEnabled": false` in app.json which avoids this.

([Issue #39092](https://github.com/expo/expo/issues/39092))

#### 3. Screen Flickering on Tab Change
`expo-router/ui` tab changes can cause screen flickering, particularly with complex nested navigators.

([Issue #35116](https://github.com/expo/expo/issues/35116))

#### 4. Modal White Flash on Android
`presentation: 'modal'` causes a white flash on Android. This is an Android-specific rendering issue.

([Issue #27099](https://github.com/expo/expo/issues/27099))

#### 5. Edge-to-Edge with Expo SDK 53+
SDK 53+ enables edge-to-edge by default for new Android projects. Portal already has `"edgeToEdgeEnabled": true`. This interacts with safe area insets and keyboard handling.

#### 6. NativeTabs `hidden` Prop
The `hidden` prop on `NativeTabs.Trigger` does not work on Android.

([Issue #41781](https://github.com/expo/expo/issues/41781))

**Source:** Multiple Expo GitHub issues linked above, [Expo Native Tabs docs](https://docs.expo.dev/router/advanced/native-tabs/)
**Confidence:** High

---

## Detailed Findings

### Finding 1: Edge-to-Edge Display (Android 15 / SDK 35)

**Source:** [Expo Blog](https://expo.dev/blog/edge-to-edge-display-now-streamlined-for-android), [react-native-edge-to-edge](https://github.com/zoontek/react-native-edge-to-edge)

**Key Points:**
- Apps targeting SDK 35 MUST support edge-to-edge (enforced August 31, 2025 for Play Store)
- Apps targeting SDK 36 (Android 16) CANNOT opt out at all
- Portal already has `"edgeToEdgeEnabled": true` in app.json - good
- `react-native-edge-to-edge` by @zoontek provides the cleanest setup
- Expo SDK 53 makes edge-to-edge the default for new projects
- This BREAKS `windowSoftInputMode="adjustResize"` behavior
- Use `react-native-keyboard-controller` or `react-native-avoid-softinput` as replacement
- Use `react-native-safe-area-context` to prevent content from rendering behind transparent system bars

**Configuration:**
```xml
<!-- android/app/src/main/res/values/styles.xml -->
<style name="AppTheme" parent="Theme.EdgeToEdge">
    <!-- your theme customizations -->
</style>
```

### Finding 2: WebView Keyboard Shaking on Android

**Source:** [react-native-webview Issue #3454](https://github.com/react-native-webview/react-native-webview/issues/3454), [Issue #3567](https://github.com/react-native-webview/react-native-webview/issues/3567)

**Key Points:**
- Keyboard opens then immediately closes in a loop when tapping input fields in WebView
- Particularly affects Samsung devices (Galaxy S23 Ultra, Android 13+)
- Neither `adjustResize` nor `adjustPan` reliably fixes it
- Root cause appears to be a race condition between WebView layout and keyboard events

**Recommended workarounds for terminal WebView:**
1. Debounce keyboard show/hide events (300ms minimum)
2. Use `injectedJavaScript` to manage focus from the JS side
3. Set `overScrollMode="never"` on WebView
4. Consider `androidLayerType="hardware"` for rendering stability
5. Use `react-native-keyboard-controller` to get accurate keyboard state instead of relying on RN's Keyboard API

### Finding 3: PagerView + WebView Gesture Architecture

**Source:** [PagerView GitHub](https://github.com/callstack/react-native-pager-view), multiple issues

**Key Points:**
- `react-native-pager-view` wraps Android's native `ViewPager2` which handles horizontal swipe at the native level
- This is the BEST approach for terminal tab switching because ViewPager2 intercepts horizontal swipes BEFORE they reach the WebView
- Key props:
```tsx
<PagerView
  style={{ flex: 1 }}
  initialPage={0}
  orientation="horizontal"
  overdrag={true}              // Android: allows over-scrolling at edges
  offscreenPageLimit={1}       // Keep adjacent terminals alive
  onPageSelected={(e) => setCurrentPage(e.nativeEvent.position)}
  onPageScrollStateChanged={(e) => {
    // Use this to coordinate with WebView gesture handling
    const state = e.nativeEvent.pageScrollState;
    // 'idle' | 'dragging' | 'settling'
  }}
>
  {terminals.map((term, i) => (
    <View key={term.id} collapsable={false}>
      <TerminalWebView session={term} />
    </View>
  ))}
</PagerView>
```

- IMPORTANT: Each page child must have `collapsable={false}` on Android or the view may be optimized away
- DO NOT nest PagerView inside TabView (Material Top Tabs) - they both use PagerView internally and will conflict


## Portal-Specific Recommendations

### For This Codebase

1. **Replace `useWindowDimensions` with `useSafeAreaFrame`** in the device type detection hook. The current plan mentions using `useWindowDimensions` with 600dp breakpoint, but `useSafeAreaFrame` is more reliable on Android with edge-to-edge enabled.

2. **Use `react-native-pager-view` directly** for terminal switching instead of a horizontal ScrollView with pagingEnabled. PagerView uses Android's native ViewPager2 which handles the gesture interception with WebView correctly at the native level.

3. **Add `react-native-keyboard-controller`** for keyboard management. The current `windowSoftInputMode="adjustResize"` will break with edge-to-edge on SDK 35. The library allows per-screen mode switching which is critical (terminal screen needs resize, other screens may need pan).

4. **Fix orientation lock**: Change `app.json` `"orientation"` from `"portrait"` to `"default"` and remove `android:screenOrientation="portrait"` from AndroidManifest.xml. Without this, tablets cannot rotate to landscape.

5. **Use standard Tabs (not NativeTabs) on Android**: The plan already identifies this. Use `Platform.select` in the tab layout to conditionally render NativeTabs (iOS) vs Tabs (Android) with lucide-react-native icons.

6. **Add left/right safe area padding**: With tablet landscape support, content can render behind camera cutouts on the sides. Always use `insets.left` and `insets.right` from `useSafeAreaInsets`.

### Implementation Notes
- Portal has `"edgeToEdgeEnabled": true` and `"predictiveBackGestureEnabled": false` already set - these are correct
- Portal uses `react-native-reanimated` ~4.1.1 and `react-native-screens` ~4.16.0 - both compatible with latest gesture-handler
- Portal does NOT currently have `react-native-gesture-handler` as a direct dependency (it comes through expo) - may need explicit install for gesture composition
- Portal does NOT have `react-native-pager-view` - needs install: `pnpm add react-native-pager-view`
- Portal does NOT have `react-native-keyboard-controller` - needs install: `pnpm add react-native-keyboard-controller`
- The `configChanges` in AndroidManifest includes `keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode` which is correct for handling configuration changes without activity restart

## Sources
1. [Expo Keyboard Handling Guide](https://docs.expo.dev/guides/keyboard-handling/) - Official Expo keyboard handling documentation
2. [react-native-keyboard-controller](https://github.com/kirillzyusko/react-native-keyboard-controller) - Cross-platform keyboard manager (v1.20.6)
3. [react-native-external-keyboard](https://github.com/ArturKalach/react-native-external-keyboard) - Physical keyboard support library
4. [react-native-safe-area-context](https://github.com/AppAndFlow/react-native-safe-area-context) - Safe area insets library
5. [react-native-edge-to-edge](https://github.com/zoontek/react-native-edge-to-edge) - Android edge-to-edge display library
6. [React Navigation Drawer](https://reactnavigation.org/docs/drawer-navigator/) - Permanent drawer for tablets
7. [React Navigation Tab View](https://reactnavigation.org/docs/tab-view/) - Tab switching with react-native-pager-view
8. [react-native-pager-view](https://github.com/callstack/react-native-pager-view) - Native Android ViewPager2 wrapper
9. [Expo Safe Areas Guide](https://docs.expo.dev/develop/user-interface/safe-areas/) - Official safe area documentation
10. [RN Issue #41918](https://github.com/facebook/react-native/issues/41918) - useWindowDimensions + translucent UI incorrect dimensions
11. [RN Issue #47080](https://github.com/facebook/react-native/issues/47080) - Dimensions inconsistency Android 14/15
12. [RN Issue #36019](https://github.com/facebook/react-native/issues/36019) - KeyboardAvoidingView broken with adjustResize
13. [RN Issue #49759](https://github.com/facebook/react-native/issues/49759) - KeyboardAvoidingView broken on SDK 35
14. [WebView Issue #3454](https://github.com/react-native-webview/react-native-webview/issues/3454) - Keyboard shaking on Android
15. [RNGH Issue #3594](https://github.com/software-mansion/react-native-gesture-handler/issues/3594) - SDK 35 crash
16. [Expo Issue #41031](https://github.com/expo/expo/issues/41031) - NativeTabs icons missing on Android
17. [Expo Issue #39092](https://github.com/expo/expo/issues/39092) - Predictive back gesture breaks Expo Router
18. [Expo Edge-to-Edge Blog](https://expo.dev/blog/edge-to-edge-display-now-streamlined-for-android) - Edge-to-edge setup guide
19. [RN Community Discussion #827](https://github.com/react-native-community/discussions-and-proposals/discussions/827) - Android 15 edge-to-edge enforcement
20. [useSafeAreaFrame API](https://appandflow.github.io/react-native-safe-area-context/api/use-safe-area-frame/) - Alternative to useWindowDimensions

## Open Questions
- How does `react-native-pager-view` perform with heavy WebView content (multiple terminal instances)? The `offscreenPageLimit` prop controls memory vs performance tradeoff but real-world testing is needed.
- Will `react-native-keyboard-controller` conflict with expo-router's own keyboard handling? The library replaces RN's KeyboardAvoidingView which expo-router may depend on internally.
- What is the minimum Android version that reliably handles edge-to-edge + keyboard + safe areas? Testing on Android 12-15 range would be prudent.
- Does `react-native-external-keyboard` work with Expo's managed workflow or require a config plugin?
