# Research Report: React Native Android Best Practices (2024-2025)
Generated: 2026-02-04

## Summary

This research covers four key areas for React Native Android development: keyboard handling issues (especially instant collapse), WebView keyboard interactions, expo-router native tabs on Android, and tablet vs phone detection. The findings reveal that many Android-specific issues stem from `react-native-screens` versions, `windowSoftInputMode` configuration conflicts, and immature native tab support on Android.

---

## 1. Android Keyboard Instantly Collapses After Opening

### Q: Why does the keyboard instantly collapse on Android?

**Answer:** This is a known issue primarily caused by `react-native-screens` versions 3.12+ when used with stack navigation. The keyboard opens and immediately dismisses, preventing user input.

**Confidence:** High

### Root Causes

| Cause | Description | Fix |
|-------|-------------|-----|
| `react-native-screens` version | Versions 3.12+ introduced a regression | Downgrade to 3.11.x |
| `keyboardDismissMode="on-drag"` | ScrollView property triggers keyboard dismissal | Remove this prop |
| Component re-renders | Parent component re-rendering causes TextInput to lose focus | Memoize parent components |
| Stack navigation interaction | Navigation state changes trigger keyboard dismiss | Update all navigation packages |

### Recommended Solutions

**Solution 1: Downgrade react-native-screens (Quick Fix)**
```bash
npm install react-native-screens@3.11.0
# or
yarn add react-native-screens@3.11.0
```

**Solution 2: Use react-native-keyboard-controller (Recommended Long-term)**
```bash
npm install react-native-keyboard-controller
```

```typescript
import { KeyboardProvider, KeyboardAvoidingView } from 'react-native-keyboard-controller';

// Wrap app with provider
export default function App() {
  return (
    <KeyboardProvider>
      <YourApp />
    </KeyboardProvider>
  );
}

// Use enhanced KeyboardAvoidingView
<KeyboardAvoidingView behavior="padding">
  <TextInput />
</KeyboardAvoidingView>
```

**Solution 3: Dynamic windowSoftInputMode**
```typescript
import { KeyboardController, AndroidSoftInputModes } from 'react-native-keyboard-controller';

// Set dynamically per screen
KeyboardController.setInputMode(AndroidSoftInputModes.SOFT_INPUT_ADJUST_RESIZE);
```

### Pitfalls to Avoid

1. **Do NOT use `adjustResize` with translucent status bar** - causes layout issues
2. **Do NOT rely solely on `KeyboardAvoidingView`** - inconsistent on Android
3. **Do NOT cache `Dimensions` values** - use `useWindowDimensions` instead

---

## 2. Android WebView Keyboard Interaction Issues

### Q: Why does keyboard misbehave in WebView on Android?

**Answer:** WebView keyboard issues manifest as: shaking/flickering, content scrolling away, or input fields being covered. These are device-specific and exacerbated by New Architecture.

**Confidence:** High

### Common Issues and Fixes

| Issue | Symptoms | Solution |
|-------|----------|----------|
| Keyboard shaking | Opens/closes rapidly | Device-specific, test on multiple devices |
| Content scrolls away | WebView becomes invisible | Avoid wrapping in KeyboardAvoidingView |
| Input covered | Keyboard overlaps input | Use `nestedScrollEnabled={true}` |
| New Architecture bug | Content disappears on focus | Disable New Architecture or wait for fix |

### Recommended WebView Configuration

```typescript
import { WebView } from 'react-native-webview';

<WebView
  source={{ uri: 'https://example.com' }}
  nestedScrollEnabled={true}  // Important for Android
  // Do NOT wrap in KeyboardAvoidingView - causes double-adjustment
/>
```

### AndroidManifest.xml Setting

```xml
<activity
  android:name=".MainActivity"
  android:windowSoftInputMode="adjustResize">
  <!-- Use adjustResize for WebView input handling -->
</activity>
```

### Known Device Issues

- Samsung Galaxy S23 Ultra (Android 13): Keyboard shaking reported
- Works fine on same URLs in Chrome browser
- Issue is WebView-specific, not content-specific

---

## 3. expo-router/unstable-native-tabs Android Support

### Q: What's the state of native tabs on Android?

**Answer:** Native tabs are alpha/beta quality. Android has significant icon rendering issues and lacks the visual benefits iOS gets (Liquid Glass). Recommendation: Use NativeTabs only for iOS, fall back to standard Tabs for Android.

**Confidence:** High

### Android-Specific Limitations

| Limitation | Description |
|------------|-------------|
| Max 5 tabs | Material Design constraint |
| Icons not rendering | Known issue in production builds (not dev) |
| `hidden` prop broken | Works on iOS, ignored on Android |
| No Liquid Glass | Android uses Material Design (no visual benefit) |

### Recommended Platform-Specific Implementation

```typescript
// app/(tabs)/_layout.tsx
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function TabLayout() {
  // Use NativeTabs only on iOS where it provides value
  if (Platform.OS === 'ios') {
    return (
      <NativeTabs>
        <NativeTabs.Screen name="index" />
        <NativeTabs.Screen name="explore" />
      </NativeTabs>
    );
  }
  
  // Fall back to standard Tabs on Android
  return (
    <Tabs>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
    </Tabs>
  );
}
```

### Icon Configuration for Android (if using NativeTabs)

```typescript
<NativeTabs.Trigger
  name="home"
  sf={{ name: 'house' }}           // iOS SF Symbols
  md={{ name: 'home' }}            // Android Material Symbols
  drawable={{ name: 'ic_home' }}   // Android drawable fallback
/>
```

### Known GitHub Issues

- [#41031](https://github.com/expo/expo/issues/41031): Icons missing in production builds
- [#41048](https://github.com/expo/expo/issues/41048): Icons not displaying in dev client
- [#41781](https://github.com/expo/expo/issues/41781): `hidden` prop not working on Android

---

## 4. Detecting Tablet vs Phone in React Native

### Q: What's the best way to detect tablet vs phone?

**Answer:** Use `useWindowDimensions` hook for reactive detection, optionally combined with `react-native-device-info` for explicit device type. Breakpoint threshold is typically 600-768dp width.

**Confidence:** High

### Method Comparison

| Method | Pros | Cons | Use Case |
|--------|------|------|----------|
| `useWindowDimensions` | Reactive, updates on rotation | Width-based, not device-based | Responsive layouts |
| `react-native-device-info` | Explicit `isTablet()` | Static, foldable phone issues | Feature flags |
| `Dimensions` API | Simple, one-time | Not reactive | Class components |

### Recommended Implementation: Custom Hook

```typescript
import { useWindowDimensions } from 'react-native';

const TABLET_BREAKPOINT = 600; // or 768 for stricter

export function useDeviceType() {
  const { width, height } = useWindowDimensions();
  
  const isTablet = Math.min(width, height) >= TABLET_BREAKPOINT;
  const isLandscape = width > height;
  
  return {
    isTablet,
    isPhone: !isTablet,
    isLandscape,
    isPortrait: !isLandscape,
    width,
    height,
  };
}

// Usage
function MyComponent() {
  const { isTablet, isLandscape } = useDeviceType();
  
  return (
    <View style={isTablet ? styles.tabletContainer : styles.phoneContainer}>
      {isTablet && <SideNavigation />}
      <MainContent columns={isTablet ? 2 : 1} />
    </View>
  );
}
```

### Using react-native-device-info (Explicit Detection)

```bash
npm install react-native-device-info
```

```typescript
import DeviceInfo from 'react-native-device-info';

// Synchronous
const isTablet = DeviceInfo.isTablet();

// Or device type
const deviceType = DeviceInfo.getDeviceType(); // 'tablet', 'handset', 'TV', 'desktop', 'unknown'
```

### Caveats with Device Detection

1. **Foldable phones**: `isTablet()` may return `true` when unfolded
2. **iPad Mini**: May register as phone based on width alone
3. **Split screen**: Window dimensions change, device type doesn't

### Best Practice: Combine Both

```typescript
import { useWindowDimensions } from 'react-native';
import DeviceInfo from 'react-native-device-info';

export function useResponsiveLayout() {
  const { width } = useWindowDimensions();
  const isDeviceTablet = DeviceInfo.isTablet();
  
  // Use width for layout decisions
  const showSidebar = width >= 768;
  const columns = width >= 600 ? 2 : 1;
  
  // Use device type for feature decisions
  const enableTabletFeatures = isDeviceTablet;
  
  return { showSidebar, columns, enableTabletFeatures };
}
```

---

## Implementation Recommendations for Portal Project

### For Keyboard Handling

1. Install `react-native-keyboard-controller` for consistent Android behavior
2. If using WebView with input, add `nestedScrollEnabled={true}`
3. Check your `react-native-screens` version - downgrade if >= 3.12 causing issues

### For Tab Navigation

Since the project appears to use expo-router:
- Use standard `<Tabs>` for now on Android
- Only use `<NativeTabs>` on iOS for Liquid Glass effects
- Implement platform-specific `_layout.tsx`

### For Tablet Detection

Create a `useDeviceType` hook in `lib/hooks/` that:
- Uses `useWindowDimensions` for responsive layouts
- Optionally adds `react-native-device-info` for explicit tablet detection
- Returns `isTablet`, `isPhone`, `isLandscape` flags

---

## Sources

### Keyboard Issues
- [react-native-screens Issue #1447](https://github.com/software-mansion/react-native-screens/issues/1447) - Keyboard immediately closes
- [react-native-screens Issue #1342](https://github.com/software-mansion/react-native-screens/issues/1342) - Keyboard closes in stack screen
- [react-native-keyboard-controller Docs](https://kirillzyusko.github.io/react-native-keyboard-controller/docs/api/components/keyboard-avoiding-view)
- [Expo Keyboard Handling Guide](https://docs.expo.dev/guides/keyboard-handling/)

### WebView Issues
- [WebView Issue #3454](https://github.com/react-native-webview/react-native-webview/issues/3454) - Keyboard shaking
- [WebView Issue #3816](https://github.com/react-native-webview/react-native-webview/issues/3816) - No scroll on keyboard open
- [WebView Issue #3848](https://github.com/react-native-webview/react-native-webview/issues/3848) - New Architecture issues

### Native Tabs
- [Expo Native Tabs Docs](https://docs.expo.dev/router/advanced/native-tabs/)
- [GitHub Issue #41031](https://github.com/expo/expo/issues/41031) - Android missing images
- [GitHub Issue #41781](https://github.com/expo/expo/issues/41781) - hidden prop not working
- [Expo SDK 54 Changelog](https://expo.dev/changelog/sdk-54)

### Tablet Detection
- [react-native-device-info GitHub](https://github.com/react-native-device-info/react-native-device-info)
- [React Native Dimensions Docs](https://reactnative.dev/docs/dimensions)
- [useWindowDimensions Guide](https://medium.com/@saundhkulwindar/mastering-the-dimensions-hook-in-react-native-a-guide-6cd5c354009f)

---

## Open Questions

- Will `react-native-screens` 3.12+ keyboard issues be fixed in upcoming releases?
- When will expo-router native tabs exit alpha for stable Android support?
- How to handle foldable devices that switch between phone/tablet modes?
