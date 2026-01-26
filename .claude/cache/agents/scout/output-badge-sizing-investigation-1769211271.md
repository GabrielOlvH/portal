# Badge Sizing Inconsistency Investigation
Generated: 2026-01-23

## Summary
Badge sizing inconsistency found on CLI sync and AI sessions screens. The badges in horizontal ScrollViews are missing the `alignSelf: 'flex-start'` property that prevents them from stretching to fill the ScrollView's height.

## Problem Screens (Badges Change Size)

### 1. CLI Sync Screen
**File:** `/home/gabrielolv/Documents/Projects/ter/app/cli-assets/index.tsx`

**Badge Rendering:** Lines 370-390
```tsx
<ScrollView
  horizontal
  showsHorizontalScrollIndicator={false}
  contentContainerStyle={styles.hostRow}
>
  {hosts.map((host) => (
    <Pressable
      key={host.id}
      style={[styles.chip, currentHost?.id === host.id && styles.chipActive]}
      onPress={() => setSelectedHostId(host.id)}
    >
      <View style={[styles.dot, { backgroundColor: host.color || colors.accent }]} />
      <AppText variant="label" style={currentHost?.id === host.id ? styles.chipTextActive : undefined}>
        {host.name}
      </AppText>
    </Pressable>
  ))}
</ScrollView>
```

**Styles:** Lines 636-659
```tsx
hostRow: {
  gap: theme.spacing.xs,
  marginBottom: theme.spacing.sm,
},
chip: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: theme.radii.md,
  backgroundColor: colors.card,
},
chipActive: {
  backgroundColor: colors.accent,
},
chipTextActive: {
  color: colors.accentText,
},
dot: {
  width: 8,
  height: 8,
  borderRadius: 4,
},
```

**ISSUE:** Missing `alignSelf: 'flex-start'` in `chip` style.

---

### 2. AI Sessions Screen
**File:** `/home/gabrielolv/Documents/Projects/ter/app/ai-sessions/index.tsx`

**Badge Rendering:** Lines 423-443
```tsx
<ScrollView
  horizontal
  showsHorizontalScrollIndicator={false}
  contentContainerStyle={styles.hostRow}
>
  {hosts.map((host, idx) => (
    <Pressable
      key={host.id}
      style={[
        styles.hostChip,
        (currentHost?.id === host.id) && styles.hostChipActive,
      ]}
      onPress={() => setSelectedHostId(host.id)}
    >
      <View style={[styles.hostDot, { backgroundColor: host.color || hostColors[idx % hostColors.length] }]} />
      <AppText variant="label" style={(currentHost?.id === host.id) ? styles.hostChipTextActive : undefined}>
        {host.name}
      </AppText>
    </Pressable>
  ))}
</ScrollView>
```

**Styles:** Lines 514-537
```tsx
hostRow: {
  paddingBottom: theme.spacing.sm,
  gap: theme.spacing.xs,
},
hostChip: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: theme.radii.md,
  backgroundColor: colors.card,
},
hostChipActive: {
  backgroundColor: colors.accent,
},
hostChipTextActive: {
  color: colors.accentText,
},
hostDot: {
  width: 8,
  height: 8,
  borderRadius: 4,
},
```

**ISSUE:** Missing `alignSelf: 'flex-start'` in `hostChip` style.

---

## Working Screens (Badges DO NOT Change Size)

### 3. Ports Screen (WORKING CORRECTLY)
**File:** `/home/gabrielolv/Documents/Projects/ter/app/ports/index.tsx`

**Badge Rendering:** Lines 261-281
```tsx
<ScrollView
  horizontal
  showsHorizontalScrollIndicator={false}
  contentContainerStyle={styles.hostSelector}
  style={styles.hostSelectorContainer}
>
  {hosts.map((host) => (
    <Pressable
      key={host.id}
      style={[
        styles.hostChip,
        currentHost?.id === host.id && styles.hostChipActive,
      ]}
      onPress={() => setSelectedHostId(host.id)}
    >
      <View style={[styles.hostDot, { backgroundColor: host.color || colors.accent }]} />
      <AppText variant="label" style={currentHost?.id === host.id ? styles.hostChipTextActive : undefined}>
        {host.name}
      </AppText>
    </Pressable>
  ))}
</ScrollView>
```

**Styles:** Lines 469-479
```tsx
hostChip: {
  flexDirection: 'row',
  alignItems: 'center',
  alignSelf: 'flex-start',  // ✓ THIS PREVENTS STRETCHING
  gap: 6,
  paddingVertical: 6,
  paddingHorizontal: 12,
  borderRadius: theme.radii.sm,
  backgroundColor: colors.cardPressed,
  marginRight: 8,
},
```

**WHY IT WORKS:** Has `alignSelf: 'flex-start'` property.

---

### 4. LaunchSheet Component (WORKING CORRECTLY)
**File:** `/home/gabrielolv/Documents/Projects/ter/components/LaunchSheet.tsx`

**Badge Rendering:** Lines 113-133
```tsx
<View style={styles.stepContainer}>
  <AppText variant="body" tone="muted" style={styles.stepInstruction}>
    Select a host
  </AppText>
  <View style={styles.chipsGrid}>
    {hosts.map((host, idx) => (
      <Pressable
        key={host.id}
        style={[
          styles.chip,
          selectedHostId === host.id && styles.chipSelected,
        ]}
        onPress={() => onSelect(host.id)}
      >
        <View style={[
          styles.chipDot,
          { backgroundColor: host.color || hostColors[idx % hostColors.length] },
          selectedHostId === host.id && styles.chipDotSelected,
        ]} />
        <AppText variant="label" style={selectedHostId === host.id ? styles.chipTextSelected : undefined}>
          {host.name}
        </AppText>
      </Pressable>
    ))}
  </View>
</View>
```

**Styles:** Lines 449-469
```tsx
chipsGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: theme.spacing.sm,
},
chip: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  paddingHorizontal: 16,
  paddingVertical: 12,
  borderRadius: theme.radii.md,
  backgroundColor: colors.card,
  borderWidth: 2,
  borderColor: colors.separator,
},
chipSelected: {
  backgroundColor: colors.accent,
  borderColor: colors.accent,
},
```

**WHY IT WORKS:** Not in a horizontal ScrollView - uses a flex wrap container instead. Badges naturally size to content.

---

## Root Cause Analysis

### The Problem: Horizontal ScrollView Stretching

When components are placed in a **horizontal ScrollView**, React Native's default flex behavior causes children to stretch to fill the cross-axis (vertical height in this case).

**Behavior:**
- Without `alignSelf: 'flex-start'`: Badge stretches to full ScrollView height
- With `alignSelf: 'flex-start'`: Badge only takes up its content height

### Why Some Screens Work

| Screen | Container Type | Has alignSelf | Badge Behavior |
|--------|---------------|---------------|----------------|
| CLI Sync | Horizontal ScrollView | ❌ No | Stretches |
| AI Sessions | Horizontal ScrollView | ❌ No | Stretches |
| Ports | Horizontal ScrollView | ✓ Yes | Correct size |
| LaunchSheet | Flex wrap View | N/A | Correct size |

---

## Solution

Add `alignSelf: 'flex-start'` to the badge/chip styles on the problematic screens:

### CLI Sync Screen Fix
**File:** `app/cli-assets/index.tsx` (Line ~640)
```tsx
chip: {
  flexDirection: 'row',
  alignItems: 'center',
  alignSelf: 'flex-start',  // ADD THIS LINE
  gap: 6,
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: theme.radii.md,
  backgroundColor: colors.card,
},
```

### AI Sessions Screen Fix
**File:** `app/ai-sessions/index.tsx` (Line ~518)
```tsx
hostChip: {
  flexDirection: 'row',
  alignItems: 'center',
  alignSelf: 'flex-start',  // ADD THIS LINE
  gap: 6,
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: theme.radii.md,
  backgroundColor: colors.card,
},
```

---

## Additional Observations

### Style Naming Inconsistency
- CLI Sync uses: `chip`, `chipActive`, `chipTextActive`, `dot`
- AI Sessions uses: `hostChip`, `hostChipActive`, `hostChipTextActive`, `hostDot`
- Ports uses: `hostChip`, `hostChipActive`, `hostChipTextActive`, `hostDot`

Consider standardizing to `hostChip` pattern across all screens for consistency.

### Container Style Differences
- CLI Sync `hostRow`: `marginBottom` property
- AI Sessions `hostRow`: `paddingBottom` property
- Both use `gap: theme.spacing.xs`

Minor difference but functionally similar.

---

## Files Affected

| File | Line | Component | Action |
|------|------|-----------|--------|
| `app/cli-assets/index.tsx` | 640 | `chip` style | Add `alignSelf: 'flex-start'` |
| `app/ai-sessions/index.tsx` | 518 | `hostChip` style | Add `alignSelf: 'flex-start'` |

---

## Verification Steps

After applying fixes:
1. Navigate to CLI Sync screen (`/cli-assets`)
2. Observe host selection badges - should maintain consistent size
3. Navigate to AI Sessions screen (`/ai-sessions`)
4. Observe host selection badges - should maintain consistent size
5. Compare with Ports screen (`/ports`) - all should behave identically
