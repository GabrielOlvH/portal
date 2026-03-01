# Research Report: Smooth Zoom Transitions Between Overview Grid and Focused View
Generated: 2026-02-27

## Summary

There are four main approaches to implementing smooth zoom transitions between an overview grid and a focused view: (1) pure CSS `transform: scale()` with `transform-origin`, (2) the FLIP animation technique (manually or via libraries), (3) the View Transitions API (browser-native), and (4) layout animation libraries like Motion (formerly Framer Motion). Since the target project is React Native / Expo, the web-native APIs (View Transitions) won't apply directly, but the underlying math and `transform: scale()` approach works perfectly with React Native's `Animated` or `react-native-reanimated`.

## Questions Answered

### Q1: CSS transform: scale() based approaches
**Answer:** The core technique is straightforward: the overview grid applies `transform: scale(0.25)` (or whatever ratio) to shrink content, and zooming in animates `scale` back to `1`. The critical insight from Jake Archibald's 2025 article is that **transform order matters** -- combining `scale` and `translate` in a single `transform` property causes "swooping" because scale acts as a multiplier for translate values. The fix is to use **separate CSS properties** (`scale` and `translate` independently) or carefully order transforms.
**Source:** [Jake Archibald - Animating zooming using CSS](https://jakearchibald.com/2025/animating-zooming/)
**Confidence:** High

### Q2: FLIP animation technique
**Answer:** FLIP (First, Last, Invert, Play) is the gold standard for layout transitions. Record element position/size before change (First), apply the change (Last), calculate the difference and apply inverse transforms (Invert), then animate removal of those transforms (Play). Libraries: GSAP Flip plugin, `animate-css-grid`, David Khourshid's `flipping` library. The key advantage is that it works with any layout system (grid, flex, absolute) because it operates on computed positions.
**Source:** [CSS-Tricks - Animating Layouts with FLIP](https://css-tricks.com/animating-layouts-with-the-flip-technique/), [Paul Lewis - FLIP Your Animations](https://aerotwist.com/blog/flip-your-animations/)
**Confidence:** High

### Q3: View Transitions API
**Answer:** The View Transitions API (Baseline 2025) automates FLIP at the browser level. Assign matching `view-transition-name` values to elements before and after DOM changes, and the browser morphs between them. React 19 added `<ViewTransition>` component. However, this is **web-only** and not available in React Native.
**Source:** [React docs - ViewTransition](https://react.dev/reference/react/ViewTransition), [Chrome DevRel - View Transitions 2025](https://developer.chrome.com/blog/view-transitions-in-2025)
**Confidence:** High

### Q4: Best practices for grid-to-fullscreen
**Answer:** Key practices: (1) Only animate `transform` and `opacity` for GPU compositing, (2) Use `will-change: transform` sparingly on elements about to animate, (3) Capture source element bounds before transition, (4) Calculate scale factor as `viewport / element` dimensions, (5) Use `transform-origin` at the element's center or top-left depending on layout, (6) For the "same content zooming" feel, keep the content rendered and only change the transform.
**Source:** Multiple sources cross-referenced
**Confidence:** High

### Q5: Android/iOS overview animations
**Answer:** Android's Recents/Overview uses a zoom animation where the view's bounds animate from thumbnail bounds to full laid-out bounds. The key insight: it's not re-rendering content at different sizes -- it's the **same rendered content** being scaled. iOS uses similar spring-based zoom transitions (available via SwiftUI's `.zoom` transition).
**Source:** [Android Developers - Zooming a View](https://stuff.mit.edu/afs/sipb/project/android/docs/training/animation/zoom.html), [Expo - Zoom transition](https://docs.expo.dev/router/advanced/zoom-transition/)
**Confidence:** High

### Q6: React/TypeScript libraries
**Answer:** For React Native specifically: `react-native-reanimated` is the primary choice. For web React: Motion (Framer Motion) with `layout` and `layoutId` props, GSAP Flip plugin, `animate-css-grid`. For React Native, the FLIP math must be done manually with `react-native-reanimated` shared values.
**Source:** [Motion - Layout Animations](https://motion.dev/docs/react-layout-animations)
**Confidence:** High

## Detailed Findings

### Finding 1: Pure CSS/JS Transform Scale Approach (Most Relevant for React Native)

**Source:** [Jake Archibald - Animating Zooming](https://jakearchibald.com/2025/animating-zooming/)

**Key Points:**
- The "same content just zoomed" effect requires keeping content rendered and only animating `transform: scale()`
- Transform order is critical: `scale` then `translate` vs `translate` then `scale` produce very different interpolation paths
- Using separate `scale` and `translate` properties (CSS individual transform properties) gives linear interpolation (smooth zoom)
- Combining them in a single `transform` gives matrix interpolation (can cause swooping)

**Implementation Pattern for Workspace Switcher:**

```typescript
// React Native / Reanimated approach
// Overview mode: all screens rendered at small scale in a grid
// Focused mode: selected screen at scale(1)

interface ScreenPosition {
  x: number;      // grid position X
  y: number;      // grid position Y  
  width: number;  // grid cell width
  height: number; // grid cell height
}

// Calculate transform to go from grid position to fullscreen
function calculateZoomTransform(
  screenPos: ScreenPosition,
  viewportWidth: number,
  viewportHeight: number
) {
  const scaleX = viewportWidth / screenPos.width;
  const scaleY = viewportHeight / screenPos.height;
  const scale = Math.min(scaleX, scaleY); // or Math.max for cover
  
  // Translate to center the element
  const translateX = (viewportWidth / 2) - (screenPos.x + screenPos.width / 2);
  const translateY = (viewportHeight / 2) - (screenPos.y + screenPos.height / 2);
  
  return { scale, translateX, translateY };
}
```

### Finding 2: FLIP Animation Technique (Manual Implementation)

**Source:** [Paul Lewis - FLIP Your Animations](https://aerotwist.com/blog/flip-your-animations/), [CSS-Tricks - FLIP Technique](https://css-tricks.com/animating-layouts-with-the-flip-technique/)

**Key Points:**
- Works with any rendering framework including React Native
- Performance: all expensive work (layout reads) happens before animation starts
- 60fps because animation only uses `transform` and `opacity`
- The "invert" step is the clever part: you make it look like nothing changed, then animate to the real position

**Code Example (Vanilla JS, adaptable to React Native):**

```typescript
// FLIP implementation for grid-to-fullscreen

function flipZoomIn(element: HTMLElement, container: HTMLElement) {
  // FIRST: Record current position
  const first = element.getBoundingClientRect();
  
  // LAST: Apply the final state (fullscreen)
  element.classList.add('fullscreen');
  const last = element.getBoundingClientRect();
  
  // INVERT: Calculate the difference
  const deltaX = first.left - last.left;
  const deltaY = first.top - last.top;
  const deltaW = first.width / last.width;
  const deltaH = first.height / last.height;
  
  // Apply inverse transform (element appears to be in original position)
  element.style.transformOrigin = 'top left';
  element.style.transform = `
    translate(${deltaX}px, ${deltaY}px) 
    scale(${deltaW}, ${deltaH})
  `;
  
  // PLAY: Animate to final state (remove the inverse transform)
  requestAnimationFrame(() => {
    element.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
    element.style.transform = 'none';
  });
}

// Reverse: fullscreen to grid
function flipZoomOut(element: HTMLElement, targetRect: DOMRect) {
  const first = element.getBoundingClientRect();
  
  element.classList.remove('fullscreen');
  const last = element.getBoundingClientRect();
  
  const deltaX = first.left - last.left;
  const deltaY = first.top - last.top;
  const deltaW = first.width / last.width;
  const deltaH = first.height / last.height;
  
  element.style.transformOrigin = 'top left';
  element.style.transform = `
    translate(${deltaX}px, ${deltaY}px) 
    scale(${deltaW}, ${deltaH})
  `;
  
  requestAnimationFrame(() => {
    element.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    element.style.transform = 'none';
  });
}
```

### Finding 3: React Native Reanimated Implementation

**Source:** Cross-referenced from Motion docs and React Native Reanimated patterns

**Key Points:**
- React Native doesn't have CSS transitions or View Transitions API
- `react-native-reanimated` with shared values is the equivalent
- Use `useSharedValue`, `useAnimatedStyle`, and `withTiming`/`withSpring`
- The "overview container" approach: wrap all screens in a single container and scale the container

**Code Example (React Native Reanimated):**

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { Dimensions } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Approach 1: Scale the entire container
// All screens are laid out at full size, container is scaled down for overview

interface WorkspaceZoomProps {
  screenCount: number;
  columns: number;
}

function useWorkspaceZoom({ screenCount, columns }: WorkspaceZoomProps) {
  const rows = Math.ceil(screenCount / columns);
  const overviewScale = 1 / columns; // e.g., 0.5 for 2-col, 0.33 for 3-col
  
  // 0 = overview, 1 = focused
  const progress = useSharedValue(0);
  const focusedIndex = useSharedValue(0);
  
  const containerStyle = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 1], [overviewScale, 1]);
    
    // Calculate translation to center on focused screen
    const col = focusedIndex.value % columns;
    const row = Math.floor(focusedIndex.value / columns);
    
    const targetX = -col * SCREEN_W;
    const targetY = -row * SCREEN_H;
    
    const translateX = interpolate(progress.value, [0, 1], [0, targetX]);
    const translateY = interpolate(progress.value, [0, 1], [0, targetY]);
    
    return {
      transform: [
        { translateX },
        { translateY },
        { scale },
      ],
    };
  });
  
  const zoomIn = (index: number) => {
    focusedIndex.value = index;
    progress.value = withSpring(1, {
      damping: 20,
      stiffness: 200,
      mass: 0.8,
    });
  };
  
  const zoomOut = () => {
    progress.value = withSpring(0, {
      damping: 20,
      stiffness: 200,
      mass: 0.8,
    });
  };
  
  return { containerStyle, zoomIn, zoomOut, progress };
}
```

```typescript
// Approach 2: Individual screen transforms (FLIP-style)
// Each screen animates independently from grid position to fullscreen

function useScreenZoom(
  index: number,
  columns: number,
  totalScreens: number,
) {
  const progress = useSharedValue(0); // 0=grid, 1=full
  
  const gridCol = index % columns;
  const gridRow = Math.floor(index / columns);
  const cellW = SCREEN_W / columns;
  const cellH = SCREEN_H / Math.ceil(totalScreens / columns);
  
  const animatedStyle = useAnimatedStyle(() => {
    // Grid position (overview)
    const gridX = gridCol * cellW;
    const gridY = gridRow * cellH;
    const gridScale = 1 / columns;
    
    // Fullscreen position
    const fullX = 0;
    const fullY = 0;
    const fullScale = 1;
    
    return {
      position: 'absolute',
      left: 0,
      top: 0,
      width: SCREEN_W,
      height: SCREEN_H,
      transform: [
        {
          translateX: interpolate(
            progress.value, [0, 1], [gridX, fullX]
          ),
        },
        {
          translateY: interpolate(
            progress.value, [0, 1], [gridY, fullY]
          ),
        },
        {
          scale: interpolate(
            progress.value, [0, 1], [gridScale, fullScale]
          ),
        },
      ],
      transformOrigin: 'top left', // RN 0.73+ / Reanimated 3+
    };
  });
  
  return { animatedStyle, progress };
}
```

### Finding 4: View Transitions API (Web Reference)

**Source:** [React docs - ViewTransition](https://react.dev/reference/react/ViewTransition), [FreeCodeCamp - View Transitions](https://www.freecodecamp.org/news/how-to-use-the-view-transition-api/)

**Key Points:**
- Browser-native, zero JS animation code needed
- Supported in Chrome 111+, Edge 111+, Firefox 133+, Safari 18+ (Baseline Oct 2025)
- React 19 has `<ViewTransition>` component (experimental)
- The browser creates snapshots, calculates transforms, and animates automatically
- Not available in React Native, but useful reference for how the effect should feel

**Code Example (Web/React -- for reference):**

```tsx
// React 19 ViewTransition component
import { ViewTransition } from 'react';

function WorkspaceSwitcher() {
  const [focusedScreen, setFocusedScreen] = useState<number | null>(null);
  
  return (
    <ViewTransition>
      {focusedScreen === null ? (
        <OverviewGrid onSelect={(i) => setFocusedScreen(i)} />
      ) : (
        <FocusedScreen 
          index={focusedScreen}
          onBack={() => setFocusedScreen(null)} 
        />
      )}
    </ViewTransition>
  );
}

// Each screen gets a unique view-transition-name
function ScreenThumbnail({ index, onSelect }) {
  return (
    <div
      style={{ viewTransitionName: `screen-${index}` }}
      onClick={() => onSelect(index)}
    >
      {/* Screen content */}
    </div>
  );
}

function FocusedScreen({ index, onBack }) {
  return (
    <div style={{ viewTransitionName: `screen-${index}` }}>
      {/* Same content, fullscreen */}
    </div>
  );
}
```

```css
/* Customize the zoom transition */
::view-transition-group(screen-*) {
  animation-duration: 0.35s;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

/* Override default crossfade with a scale effect */
::view-transition-old(screen-*) {
  animation: none;
}
::view-transition-new(screen-*) {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*) {
    animation-duration: 0s;
  }
}
```

### Finding 5: GSAP Flip Plugin (Web Reference)

**Source:** [GSAP Flip Docs](https://gsap.com/docs/v3/Plugins/Flip/), [Codrops - Grid Layout Transitions](https://tympanus.net/codrops/2026/01/20/animating-responsive-grid-layout-transitions-with-gsap-flip/)

**Key Points:**
- Most robust web solution for FLIP animations
- Handles nested transforms, absolute positioning during flip
- Can animate multiple elements simultaneously
- Premium plugin (requires GSAP license for commercial use)
- Web-only, not applicable to React Native

**Code Example (Web, for reference):**

```javascript
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
gsap.registerPlugin(Flip);

function expandScreen(screenEl) {
  // Record current state
  const state = Flip.getState(screenEl);
  
  // Apply fullscreen styles
  screenEl.classList.add('fullscreen');
  
  // Animate from recorded state to new state
  Flip.from(state, {
    duration: 0.4,
    ease: 'power2.inOut',
    scale: true,
    absolute: true, // Use position:absolute during flip
    onComplete: () => {
      // Cleanup
    },
  });
}
```

### Finding 6: Motion (Framer Motion) Layout Animations

**Source:** [Motion - Layout Animations](https://motion.dev/docs/react-layout-animations), [Maxime Heckel - Layout Animations](https://blog.maximeheckel.com/posts/framer-motion-layout-animations/)

**Key Points:**
- `layout` prop enables automatic FLIP animation on any `motion` component
- `layoutId` enables shared element transitions between different components
- Performs all layout animations using CSS `transform` for performance
- Available for React web; React Native support via `moti` library (wraps Reanimated)

**Code Example (React Web):**

```tsx
import { motion, AnimatePresence } from 'motion/react';

function WorkspaceSwitcher() {
  const [selected, setSelected] = useState<number | null>(null);
  
  return (
    <div className="grid">
      {screens.map((screen, i) => (
        <motion.div
          key={screen.id}
          layoutId={`screen-${screen.id}`}
          onClick={() => setSelected(i)}
          layout
          style={{
            // Grid item styles
          }}
          transition={{
            type: 'spring',
            stiffness: 350,
            damping: 25,
          }}
        >
          <ScreenContent screen={screen} />
        </motion.div>
      ))}
      
      <AnimatePresence>
        {selected !== null && (
          <motion.div
            layoutId={`screen-${screens[selected].id}`}
            className="fullscreen"
            onClick={() => setSelected(null)}
            transition={{
              type: 'spring',
              stiffness: 350,
              damping: 25,
            }}
          >
            <ScreenContent screen={screens[selected]} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

### Finding 7: animate-css-grid Library

**Source:** [GitHub - animate-css-grid](https://github.com/aholachek/animate-css-grid)

**Key Points:**
- Lightweight, uses FLIP internally
- Automatically animates CSS Grid property changes
- Applies counter-scale to children to prevent distortion
- Web-only, not for React Native

### Finding 8: Easing and Timing Best Practices

**Sources:** Cross-referenced from multiple articles

**Key Points:**
- Android Material Design uses `cubic-bezier(0.4, 0, 0.2, 1)` (standard easing)
- iOS uses spring physics (damping ~20-25, stiffness ~200-350)
- Duration: 300-400ms for zoom transitions
- For "same content zooming" feel, use spring animations (they feel more physical)
- `will-change: transform` on elements about to animate (remove after)
- Avoid animating `width`/`height` -- always use `transform: scale()`

**Recommended Spring Parameters (Reanimated):**

```typescript
// Snappy, responsive feel (like iOS)
const springConfig = {
  damping: 20,
  stiffness: 200,
  mass: 0.8,
};

// Smooth, deliberate feel (like Android)
const springConfig = {
  damping: 25,
  stiffness: 150,
  mass: 1,
};

// Bouncy, playful feel
const springConfig = {
  damping: 12,
  stiffness: 180,
  mass: 0.5,
};
```

## Comparison Matrix

| Approach | Complexity | Performance | React Native | Best For |
|----------|-----------|-------------|--------------|----------|
| Pure transform: scale() | Low | Excellent (GPU) | YES | Simple zoom, same container |
| FLIP (manual) | Medium | Excellent | YES (with Reanimated) | Grid-to-fullscreen, layout changes |
| View Transitions API | Low | Excellent | NO (web only) | Web apps, future-proof |
| GSAP Flip | Low-Medium | Excellent | NO (web only) | Complex web animations |
| Motion/Framer Motion | Low | Good | Partial (via moti) | React web apps |
| animate-css-grid | Very Low | Good | NO (web only) | CSS Grid animations |
| Reanimated shared values | Medium | Excellent | YES (native) | React Native production apps |

## Recommendations

### For This Codebase (React Native / Expo)

1. **Use Approach 1: Container-level scale** -- Render all workspace screens at full size inside a single container. In overview mode, scale the container down and translate to show all screens in a grid. On tap, animate scale to 1 and translate to center the selected screen. This gives the "same content just zoomed" feel naturally because it IS the same content being scaled.

2. **Use `react-native-reanimated` shared values** -- This project already uses Expo 54, which includes Reanimated. Use `useSharedValue` for the zoom progress (0=overview, 1=focused), `interpolate` for scale/translate values, and `withSpring` for the animation.

3. **Transform order matters** -- In React Native, the transform array order is `[translateX, translateY, scale]`. Put translates BEFORE scale so that translations are in screen-space coordinates, not scaled coordinates.

4. **Spring physics over timing** -- Use spring animations (`withSpring`) rather than timed animations (`withTiming`) for the zoom transition. Springs feel more natural and handle interruptions (user taps during animation) gracefully.

### Implementation Notes

- **Transform origin in React Native:** RN 0.73+ supports `transformOrigin` style prop. For older versions, you need to manually offset with translate. Since this is Expo 54 (SDK 54, likely RN 0.76+), `transformOrigin` should be available.
- **Content rendering during overview:** Keep all screens rendered but consider reducing update frequency for off-screen screens during overview (e.g., lower terminal refresh rate).
- **Gesture integration:** The pinch-to-overview gesture (already mentioned in recent commits) should drive the same `progress` shared value, allowing the user to interactively zoom in/out.
- **Z-index during transition:** The zooming-in screen should have a higher z-index during the transition to appear above siblings.
- **Interruption handling:** Spring animations handle mid-animation taps naturally. If user taps another screen while zooming in, just update `focusedIndex` and the spring will redirect.

## Sources

1. [Jake Archibald - Animating zooming using CSS](https://jakearchibald.com/2025/animating-zooming/) - Transform order affects zoom interpolation path
2. [Paul Lewis - FLIP Your Animations](https://aerotwist.com/blog/flip-your-animations/) - Original FLIP technique article
3. [CSS-Tricks - Animating Layouts with FLIP](https://css-tricks.com/animating-layouts-with-the-flip-technique/) - Comprehensive FLIP tutorial with examples
4. [Motion - Layout Animations](https://motion.dev/docs/react-layout-animations) - React layout animation library docs
5. [GSAP Flip Docs](https://gsap.com/docs/v3/Plugins/Flip/) - GSAP Flip plugin documentation
6. [React docs - ViewTransition](https://react.dev/reference/react/ViewTransition) - React 19 ViewTransition component
7. [Chrome DevRel - View Transitions 2025](https://developer.chrome.com/blog/view-transitions-in-2025) - Latest View Transitions API updates
8. [Codrops - Grid Layout Transitions with GSAP Flip](https://tympanus.net/codrops/2026/01/20/animating-responsive-grid-layout-transitions-with-gsap-flip/) - Grid animation tutorial
9. [GitHub - animate-css-grid](https://github.com/aholachek/animate-css-grid) - Lightweight grid animation library
10. [Maxime Heckel - Framer Motion Layout Animations](https://blog.maximeheckel.com/posts/framer-motion-layout-animations/) - Deep dive into layout animations
11. [Android Developers - Zooming a View](https://stuff.mit.edu/afs/sipb/project/android/docs/training/animation/zoom.html) - Android's zoom animation pattern
12. [Expo - Zoom transition](https://docs.expo.dev/router/advanced/zoom-transition/) - Expo Router zoom transitions
13. [Smashing Magazine - View Transitions API Part 2](https://www.smashingmagazine.com/2024/01/view-transitions-api-ui-animations-part2/) - Grid-to-detail view transitions
14. [FreeCodeCamp - View Transitions API](https://www.freecodecamp.org/news/how-to-use-the-view-transition-api/) - Tutorial with code examples
15. [Bram.us - Animate CSS Grid with View Transitions](https://www.bram.us/2023/05/09/rearrange-animate-css-grid-layouts-with-the-view-transition-api/) - Grid rearrangement animations
16. [HN Discussion - Jake Archibald zooming](https://news.ycombinator.com/item?id=44297564) - Community discussion on zoom animation gotchas

## Open Questions

- How does Expo's `react-native-reanimated` handle `transformOrigin` in the current SDK 54?
- Should the overview use a FlatList/ScrollView for many workspaces, or fixed grid positions?
- What is the interaction between the existing pinch gesture (mentioned in commit 1b82f1f) and the zoom animation progress value?
