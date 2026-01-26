# Plan: Expo SDK 55 Upgrade

## Goal
Upgrade from Expo SDK 54 to SDK 55 to get React Native 0.83, React 19.2, and latest features.

## Current State Analysis

### SDK Status
- **Current**: Expo SDK 54 (`~54.0.31`)
- **Target**: Expo SDK 55 (currently `55.0.0-preview.2`)
- **New Architecture**: Already enabled ✓

### Blockers Checked
| Breaking Change | Status |
|-----------------|--------|
| `expo-av` removed | ✓ Not used in codebase |
| `expo-file-system/legacy` removed | ✓ Not used in app code |
| New Architecture required | ✓ Already enabled |

### Dependencies (18 expo packages)
```
expo: ~54.0.31
expo-asset: ^12.0.12
expo-blur: ~15.0.8
expo-clipboard: ~8.0.7
expo-constants: ~18.0.13
expo-device: ~8.0.10
expo-font: ~14.0.10
expo-glass-effect: ~0.1.8
expo-haptics: ^15.0.8
expo-image-picker: ^17.0.10
expo-linear-gradient: ~15.0.7
expo-linking: ~8.0.11
expo-live-activity: ^0.4.2
expo-notifications: ~0.32.16
expo-router: ~6.0.21
expo-splash-screen: ~31.0.13
expo-status-bar: ~3.0.9
expo-web-browser: ~15.0.10
```

### Current Issues (from expo-doctor)
- Minor version mismatch: `react-native-gesture-handler` (2.30.0 vs expected 2.28.0)
- Multiple lock files: `package-lock.json` and `bun.lock`

## Technical Choices

- **Timing**: Wait for stable release (preview.2 available, stable expected soon)
- **Lock file**: Keep `bun.lock` only (remove `package-lock.json`)
- **Upgrade method**: Use `npx expo install expo@55 --fix` when stable

## Tasks

### Task 1: Clean Up Lock Files (Pre-requisite)
Remove duplicate lock file to prevent CI issues.

- [ ] Delete `package-lock.json` (keep `bun.lock` since using Bun)
- [ ] Run `bun install` to ensure `bun.lock` is up to date

**Files to modify:**
- Delete: `package-lock.json`

### Task 2: Fix Current SDK 54 Mismatches
Update packages to latest SDK 54 compatible versions before upgrading.

- [ ] Run `npx expo install --check` to see issues
- [ ] Run `npx expo install --fix` to auto-fix compatible versions
- [ ] Verify with `npx expo-doctor`

### Task 3: Upgrade to SDK 55 (When Stable)
Perform the actual SDK upgrade.

- [ ] Check if SDK 55 is stable: `npm view expo@latest version`
- [ ] Run upgrade: `npx expo install expo@55 --fix`
- [ ] Update all expo packages: `npx expo install --fix`
- [ ] Run `npx expo-doctor` to verify

**Expected package updates:**
- `expo` → 55.x
- `expo-router` → 7.x (expected)
- All other expo-* packages → SDK 55 compatible versions
- `react-native` → 0.83.x
- `react` → 19.x

### Task 4: Update Native Projects
Regenerate native code for the new SDK.

- [ ] Run `npx expo prebuild --clean`
- [ ] Verify iOS builds: `npx expo run:ios`
- [ ] Verify Android builds: `npx expo run:android`

### Task 5: Test Application
Verify everything works after upgrade.

- [ ] Test app launch on iOS simulator
- [ ] Test app launch on Android emulator
- [ ] Test key features: host connections, usage cards, sessions
- [ ] Check for deprecation warnings in console

## Success Criteria

### Automated Verification
- [ ] `npx expo-doctor` passes all checks
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] iOS build succeeds
- [ ] Android build succeeds

### Manual Verification
- [ ] App launches without crashes
- [ ] Usage cards display correctly
- [ ] Host connections work
- [ ] No visible UI regressions

## Risks (Pre-Mortem)

### Tigers
- **Third-party library compatibility** (MEDIUM)
  - `expo-live-activity` may not be SDK 55 ready
  - Mitigation: Check library issues/releases before upgrading

- **React 19 breaking changes** (LOW)
  - Some React patterns deprecated
  - Mitigation: Run app and check for warnings

### Elephants
- **Preview stability** (MEDIUM)
  - SDK 55 is still in preview
  - Note: Wait for stable or accept potential issues

## Out of Scope
- Migrating to new expo-router features (separate effort)
- Adopting new React 19 features like use() hook
- Performance optimization for RN 0.83

## Timeline Recommendation

| Phase | When |
|-------|------|
| Task 1-2 (cleanup) | Can do now |
| Task 3-5 (upgrade) | Wait for SDK 55 stable release |

The SDK 55 preview just dropped, so stable should be within 1-2 weeks typically.
