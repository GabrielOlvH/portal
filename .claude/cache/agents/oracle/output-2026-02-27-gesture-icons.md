# Research Report: Gesture Icons for React Native (Expo)
Generated: 2026-02-27

## Summary

Lucide has hand icons but NO gesture-specific icons (no swipe, pinch, multi-finger). Phosphor Icons is the best alternative -- it has dedicated gesture icons including HandSwipeLeft, HandSwipeRight, HandTap, HandPointing, HandGrabbing, and HandPalm. The project already has `lucide-react-native` (v0.562.0) and `@expo/vector-icons` installed.

## Questions Answered

### Q1: Does lucide-react-native have gesture-related icons?

**Answer:** Partially. Lucide has hand/pointer icons but lacks gesture-specific ones (no swipe, no pinch, no multi-finger).

**Available hand-related Lucide icons:**
| Icon Name | Tags | Useful For |
|-----------|------|------------|
| `Hand` | wave, move, mouse, grab | Generic "stop" / open hand |
| `HandGrab` | hand | Grabbing / dragging |
| `HandMetal` | rock | Decorative only |
| `HandHeart` | — | Decorative only |
| `HandHelping` | agreement, help, charity | Not gesture-related |
| `HandPlatter` | waiter, restaurant | Not gesture-related |
| `HandFist` | clench, strength, power | Not gesture-related |
| `HandCoins` | — | Not gesture-related |
| `Pointer` | mouse | Cursor pointer |
| `MousePointerClick` | click, select | Mouse click |
| `Grip` | grab, dots, handle, move, drag | Drag handle dots |
| `GripVertical` | grab, dots, handle, move, drag | Vertical drag handle |
| `GripHorizontal` | grab, dots, handle, move, drag | Horizontal drag handle |
| `Move` | arrows | Generic move indicator |
| `ArrowLeftRight` | — | Could represent swipe L/R |
| `Maximize2` / `Minimize2` | — | Could represent pinch zoom |

**Missing from Lucide (no icons for):**
- Swipe left / swipe right (finger with arrow)
- Pinch to zoom (two fingers converging/diverging)
- Two-finger swipe
- Three-finger swipe
- Tap (finger touching surface)

**Source:** https://lucide.dev/icons/
**Confidence:** High (verified against icon catalog)

### Q2: Are there other icon libraries with gesture/hand icons for React Native?

**Answer:** Yes. **Phosphor Icons** is the strongest option.

#### Phosphor Icons (RECOMMENDED)

**Package:** `phosphor-react-native` (v3.0.3) or `@phosphor-icons/react-native`
**Total icons:** 9,000+ (across 6 weight variants: Regular, Bold, Light, Thin, Fill, Duotone)
**License:** MIT

**Gesture-specific icons in Phosphor:**
| Icon Name | What It Shows |
|-----------|--------------|
| `HandTap` | Single finger tapping |
| `HandPointing` | Index finger pointing |
| `HandSwipeLeft` | Hand swiping left |
| `HandSwipeRight` | Hand swiping right |
| `HandGrabbing` | Closed hand grabbing |
| `HandPalm` | Open palm (stop gesture) |
| `HandWaving` | Waving hand |
| `Hand` | Generic hand |
| `HandFist` | Closed fist |
| `Fingers` | Multiple fingers |
| `HandArrowDown` | Hand with downward arrow |
| `HandArrowUp` | Hand with upward arrow |

Each icon is available in 6 styles (regular, bold, light, thin, fill, duotone).

**Source:** https://phosphoricons.com/
**Confidence:** High

#### Other Options

| Library | Gesture Icons? | RN Support | Notes |
|---------|---------------|------------|-------|
| **Phosphor Icons** | Yes -- dedicated gesture set | `phosphor-react-native` | Best option |
| **Hugeicons** | Likely (46K+ icons) | `@hugeicons/react-native` | Paid for full set; free tier has 4,600 |
| **Icons8** | Yes (gesture category) | Web/SVG only | No RN package; would need raw SVGs |
| **Flaticon** | Yes (13K+ gesture icons) | SVG download | No RN package; licensing varies |
| **@expo/vector-icons** (already installed) | Limited | Built-in | Wraps FontAwesome, Ionicons, MaterialIcons -- check `FontAwesome5` for `hand-pointer`, `hand-paper` |

#### @expo/vector-icons -- Already Installed

Worth checking these from the bundled icon families:
- `MaterialCommunityIcons`: `gesture-swipe-left`, `gesture-swipe-right`, `gesture-tap`, `gesture-pinch`, `gesture-two-double-tap`, `gesture-spread`
- `FontAwesome5`: `hand-pointer`, `hand-paper`, `hand-rock`, `hand-peace`
- `Ionicons`: `hand-left`, `hand-right`

**The `MaterialCommunityIcons` family in @expo/vector-icons likely already has exactly what you need without installing anything new.**

**Source:** https://icons.expo.fyi/
**Confidence:** Medium (icon names inferred from MaterialDesign community icons set; verify on icons.expo.fyi)

### Q3: Could I use simple SVG hand/finger symbols?

**Answer:** Yes, straightforward with `react-native-svg` (already a dependency of lucide-react-native).

Options:
1. Draw custom SVG paths for gestures (simple hand outlines with arrows)
2. Download individual SVGs from Phosphor/Icons8/Flaticon and wrap them in `react-native-svg` components
3. Use inline SVG data as React Native components

For the specific gestures you need (pinch, 2-finger swipe, 3-finger swipe), custom SVGs may be the only way to get exactly what you want since even Phosphor lacks explicit "2-finger" and "3-finger" variants.

**Source:** General knowledge + react-native-svg docs
**Confidence:** High

## Recommendations

### Best Path Forward (Least Effort)

1. **First, check @expo/vector-icons MaterialCommunityIcons** -- you already have this installed. Browse https://icons.expo.fyi/ and search for "gesture". MaterialCommunityIcons has `gesture-swipe-left`, `gesture-swipe-right`, `gesture-tap`, `gesture-pinch`, `gesture-spread`, and more.

2. **If MaterialCommunityIcons coverage is sufficient**, no new dependency needed.

3. **If you need more variety or a consistent hand-drawn style**, add Phosphor Icons (`phosphor-react-native`). It has the richest set of hand gesture icons with consistent styling across 6 weight variants.

4. **For 2-finger and 3-finger specific icons**, you will likely need custom SVGs regardless of library choice. None of the major libraries distinguish between 1/2/3-finger gestures well.

### What Each Gesture Maps To

| Your Gesture | MaterialCommunityIcons | Phosphor | Lucide |
|-------------|----------------------|----------|--------|
| Swipe left | `gesture-swipe-left` | `HandSwipeLeft` | (none) |
| Swipe right | `gesture-swipe-right` | `HandSwipeRight` | (none) |
| Pinch | `gesture-pinch` | (none specific) | (none) |
| Tap | `gesture-tap` | `HandTap` | (none) |
| 2-finger swipe | `gesture-two-double-tap` (close) | (none) | (none) |
| 3-finger swipe | (none) | (none) | (none) |

## Sources
1. [Lucide Icons - Hand](https://lucide.dev/icons/hand) - Official Lucide icon catalog
2. [Lucide Icons - Hand Grab](https://lucide.dev/icons/hand-grab) - Hand grab icon details
3. [Lucide React Native Guide](https://lucide.dev/guide/packages/lucide-react-native) - RN package docs
4. [Phosphor Icons](https://phosphoricons.com/) - Official Phosphor icon browser
5. [Phosphor React Native (npm)](https://www.npmjs.com/package/phosphor-react-native) - RN package
6. [Phosphor Icons on icones.js.org](https://icones.js.org/collection/ph) - Browsable Phosphor collection
7. [Lucide Issue #2344 - Update Hand Icons](https://github.com/lucide-icons/lucide/issues/2344) - Discussion on hand icon improvements
8. [Expo Vector Icons](https://icons.expo.fyi/) - Browse all icon families bundled with Expo
9. [Hugeicons React Native](https://github.com/hugeicons/react-native) - Alternative large icon set

## Open Questions
- Exact MaterialCommunityIcons gesture icon names should be verified at https://icons.expo.fyi/ (search "gesture")
- Whether Phosphor has pinch-specific icons (likely not based on research)
- For 3-finger gestures, custom SVG is almost certainly required
