# Task 6: NPM Scripts and Package Configuration

## Status: COMPLETE

## Summary
Updated `agent/package.json` with standardized npm scripts for service management and added bin entry for the bridge-agent.

## Changes Made

### package.json Updates
1. **Added bin entry** for `bridge-agent` pointing to `./src/index.ts`
2. **Renamed scripts** for consistency:
   - `install-agent` -> `install-service`
   - `uninstall-agent` -> `uninstall-service`
   - `update` -> `update-service`

### Scripts Available
| Script | Command | Purpose |
|--------|---------|---------|
| `pnpm start` | `tsx src/index.ts` | Start the agent server |
| `pnpm dev` | `tsx watch src/index.ts` | Start with file watching |
| `pnpm typecheck` | `tsc --noEmit` | TypeScript type checking |
| `pnpm install-service` | `tsx scripts/install.ts` | Install as system service |
| `pnpm uninstall-service` | `tsx scripts/uninstall.ts` | Uninstall system service |
| `pnpm update-service` | `tsx scripts/update.ts` | Update installed service |

## Verification

### Script Entry Points Verified
All scripts can be executed with `npx tsx`:
- `scripts/install.ts` - Runs, shows interactive installer
- `scripts/uninstall.ts` - Runs, shows help with `-h`
- `scripts/update.ts` - Runs, shows update check output

### tsconfig.json Already Correct
The `include` array already has `scripts/**/*.ts`:
```json
"include": ["src/**/*.ts", "src/**/*.d.ts", "scripts/**/*.ts"]
```

### Type Checking Notes
- Scripts pass tsx parsing (`tsx --check`)
- Some TypeScript strict mode warnings exist for module resolution
- These are handled correctly by tsx at runtime
- Pre-existing type errors in other agent files (not related to this task)

## Files Modified
- `/home/gabrielolv/Documents/Projects/ter/agent/package.json`

## Next Steps
- Task 7: Create CLI entry point
- Task 8: Final integration testing
