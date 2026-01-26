# Codebase Report: CLI Sync Feature Exploration
Generated: 2026-01-21

## Summary
The CLI Sync feature allows users to synchronize CLI assets (skills, commands, and MCP servers) across different AI providers (Claude, Codex, OpenCode). It provides a mobile interface for viewing, creating, editing, and syncing configuration files that live in the user's home directory.

## Project Structure

```
ter/
├── app/
│   ├── cli-assets/
│   │   └── index.tsx              # Main CLI sync screen (652 lines)
│   ├── (tabs)/
│   │   └── more.tsx               # Navigation entry point
│   └── _layout.tsx                # Route registration
├── agent/src/http/
│   ├── app.ts                     # Route registration
│   └── routes/
│       └── cli-assets.ts          # Backend API (395 lines)
└── lib/
    ├── api.ts                     # API client methods
    └── types.ts                   # Type definitions

```

## Questions Answered

### Q1: What files handle CLI sync functionality?

**Core Files:**

| File | Purpose | Lines | Key Exports |
|------|---------|-------|-------------|
| `app/cli-assets/index.tsx` | Main UI screen | 652 | `CliAssetsScreen` component |
| `agent/src/http/routes/cli-assets.ts` | Backend API routes | 395 | `registerCliAssetRoutes()` |
| `lib/api.ts` (lines 460-489) | API client | 30 | `getCliAssets()`, `upsertCliAsset()`, `deleteCliAsset()` |
| `lib/types.ts` (lines 266-330) | Type definitions | 65 | `CliAsset`, `AiProvider`, `CliAssetType` |

**Supporting Files:**
- `app/(tabs)/more.tsx` (lines 310-312) - Navigation menu entry
- `app/_layout.tsx` (line 100) - Route registration

### Q2: The current layout/UI structure

**Screen Hierarchy:**

```
CliAssetsScreen
├── Header
│   ├── Back Button
│   ├── Title ("CLI Sync - Skills + Commands")
│   └── Add Button (+)
├── Host Selector (horizontal scroll, if multiple hosts)
├── Asset Type Filter (Skills | Commands | MCPs)
├── Provider Filter (All | Claude | Codex | OpenCode)
├── Search Bar
├── Asset List (ScrollView)
│   └── Asset Cards
│       ├── Provider Badge (colored letter)
│       ├── Asset Info (name, filename, timestamp)
│       ├── Content Preview (first 2 lines)
│       └── Action Buttons (View | Edit | Sync | Delete)
└── Bottom Sheet Modal
    ├── Form Fields (Name, Content, Provider Selection)
    └── Actions (Cancel | Save)
```

**UI Features:**
- **Host Selection**: Multi-host support with colored dots
- **Triple Filtering**: Asset type → Provider → Search query
- **Asset Cards**: Show provider badge, name, path, preview, and timestamp
- **Modal Modes**: `new` | `edit` | `sync` | `view`
- **Pull-to-Refresh**: Refetch assets on pull down
- **Sorting**: Assets sorted by provider order, then alphabetically

**Visual Elements:**
- Provider color coding: Claude (orange), Codex (green), OpenCode (purple)
- Relative timestamps (e.g., "2h", "5m", "now")
- Expandable bottom sheet with snap points at 60%/90% or 45%/90%

### Q3: Screens, components, and routes

**Routes:**

| Route | Screen | Navigation From |
|-------|--------|----------------|
| `/cli-assets` | `app/cli-assets/index.tsx` | `app/(tabs)/more.tsx` line 312 |

**Route Registration:**
- Registered in `app/_layout.tsx` line 100: `<Stack.Screen name="cli-assets/index" />`

**Components Used:**
- `Screen` - Base screen wrapper
- `AppText` - Styled text (variants: title, subtitle, label, body, mono, caps)
- `Card` - Container with background/border
- `Field` - Form input field
- `FadeIn` - Animated entrance
- `SearchBar` - Search input
- `BottomSheet` - Modal from `@gorhom/bottom-sheet`

**No dedicated sub-components** - all UI is inline in the main screen file.

### Q4: Data flow and API calls

**Data Flow Architecture:**

```
[User Action] 
    ↓
[React Component]
    ↓
[API Client (lib/api.ts)]
    ↓
[HTTP Request to Agent]
    ↓
[Agent Routes (agent/src/http/routes/cli-assets.ts)]
    ↓
[Filesystem Operations]
    ↓
[User's Home Directory]
```

**API Endpoints:**

| Method | Endpoint | Purpose | Query/Body |
|--------|----------|---------|------------|
| GET | `/cli-assets?type=X&provider=Y` | List assets | `type` (required), `provider` (optional) |
| POST | `/cli-assets` | Create/update asset | `{ provider, type, name, content }` |
| DELETE | `/cli-assets` | Delete asset | `{ provider, type, name }` |

**API Client Methods:**

```typescript
// lib/api.ts

getCliAssets(host: Host, options: CliAssetsOptions): Promise<CliAssetListResponse>
// Fetches assets filtered by type and optionally provider

upsertCliAsset(host: Host, payload: {
  provider: AiProvider;
  type: CliAssetType;
  name: string;
  content: string;
}): Promise<{ ok: boolean }>
// Creates or updates an asset

deleteCliAsset(host: Host, payload: {
  provider: AiProvider;
  type: CliAssetType;
  name: string;
}): Promise<{ ok: boolean }>
// Deletes an asset
```

**React Query Integration:**

```typescript
const { data, isFetching, refetch } = useQuery({
  queryKey: ['cli-assets', currentHost?.id, assetType],
  queryFn: async () => {
    if (!currentHost) return { assets: [] };
    return getCliAssets(currentHost, { type: assetType });
  },
  enabled: ready && !!currentHost,
  staleTime: 10_000,
});
```

**Backend Filesystem Paths:**

The backend maps AI providers to filesystem locations:

```typescript
const PROVIDER_PATHS: Record<CliProvider, ...> = {
  claude: {
    skill: ['.claude/skills', '.claude/skill'],
    command: ['.claude/commands'],
    mcp: ['.claude/mcp.json', '.claude/mcp.jsonc'],
  },
  codex: {
    skill: ['.codex/skills'],
    command: ['.codex/commands'],
    mcp: ['.codex/mcp.json', '.codex/mcp.jsonc'],
  },
  opencode: {
    skill: ['.config/opencode/skills', '.opencode/skills'],
    command: ['.config/opencode/commands', '.opencode/commands'],
    mcp: ['.config/opencode/mcp.json', '.opencode/mcp.json'],
  },
};
```

**File Operations:**

1. **Skills & Commands**: 
   - Stored as individual `.md` files in provider-specific directories
   - Files created in `~/.<provider>/<type>/`
   - Filename sanitized and `.md` extension ensured

2. **MCP Servers**:
   - Stored as JSON/JSONC config files
   - Support two formats: `mcpServers` or `servers` keys
   - Individual servers extracted as separate assets
   - "Raw" mode for editing entire config file

**State Management:**

```typescript
// Local component state (no global store)
const [assetType, setAssetType] = useState<CliAssetType>('skill');
const [providerFilter, setProviderFilter] = useState<AiProvider | 'all'>('all');
const [searchQuery, setSearchQuery] = useState('');
const [editingAsset, setEditingAsset] = useState<CliAsset | null>(null);
const [selectedProviders, setSelectedProviders] = useState<AiProvider[]>([]);
```

**Filtering Pipeline:**

```
Raw Assets
  ↓ Filter by provider (if not 'all')
  ↓ Filter by search query (name or content)
  ↓ Sort by provider order → alphabetically
  → Displayed Assets
```

## Key Data Types

```typescript
export type AiProvider = 'claude' | 'codex' | 'opencode';

export type CliAssetType = 'skill' | 'command' | 'mcp';

export type CliAssetMeta = {
  filename?: string;    // Original filename on disk
  raw?: boolean;        // True if entire MCP config file
  source?: string;      // 'mcpServers' or 'servers' key
};

export type CliAsset = {
  id: string;           // Format: "provider:type:name"
  provider: AiProvider;
  type: CliAssetType;
  name: string;
  content: string;
  updatedAt?: number;   // File mtime in milliseconds
  path?: string;        // Absolute filesystem path
  meta?: CliAssetMeta;
};

export type CliAssetListResponse = {
  assets: CliAsset[];
};
```

## User Workflows

### Create New Asset

1. User taps "+" button in header
2. Bottom sheet opens in `new` mode
3. User enters name and content
4. User selects target providers (default: all or current filter)
5. User taps "Save"
6. Asset created for each selected provider via parallel `POST` requests
7. Asset list refreshes

### Edit Existing Asset

1. User taps "Edit" on asset card
2. Bottom sheet opens in `edit` mode with pre-filled data
3. Provider locked to asset's provider
4. User modifies name/content
5. User taps "Save"
6. Asset updated via `POST` (overwrites file)

### Sync Across Providers

1. User taps "Sync" on asset card
2. Bottom sheet opens in `sync` mode
3. All providers selected by default
4. User can deselect providers
5. User taps "Save"
6. Asset copied to all selected providers

### Delete Asset

1. User taps "Delete" on asset card
2. Alert confirmation dialog appears
3. User confirms
4. Asset deleted via `DELETE` request
5. Asset list refreshes

## Backend Implementation Details

**Path Resolution:**
- Supports `~`, `~/path`, and absolute paths
- Checks multiple fallback locations per provider
- Creates directories on demand when `ensure: true`

**File Operations:**
- **Skills/Commands**: Direct file read/write/delete
- **MCP Config**: JSON parsing with comment stripping support
- Sanitizes filenames (removes slashes, trims whitespace)
- Ensures `.md` extension for skills/commands

**MCP Handling:**
- Parses `mcp.json` or `mcp.jsonc`
- Extracts individual server configs as separate assets
- Supports `mcpServers` (Claude) and `servers` (generic) keys
- "Raw" mode for editing entire config
- Preserves other JSON keys when updating individual servers

**Error Handling:**
- Returns 400 for missing/invalid parameters
- Returns JSON errors via `jsonError()` helper
- File not found returns empty arrays (graceful degradation)

## Navigation Integration

**Entry Point:**
- Located in `app/(tabs)/more.tsx` line 310-312
- Menu item title: "CLI Sync"
- Menu item subtitle: "Skills, commands, and MCPs"
- Routes to `/cli-assets` on press

**Stack Registration:**
- Registered in `app/_layout.tsx` line 100
- Uses default stack screen behavior (no custom options)

## Conventions Discovered

### Naming
- Files: kebab-case (`cli-assets.ts`)
- Components: PascalCase (`CliAssetsScreen`)
- Functions: camelCase (`getCliAssets`)
- Types: PascalCase (`CliAsset`)

### Patterns
- **Data Fetching**: React Query with `['cli-assets', hostId, type]` keys
- **API Client**: Centralized in `lib/api.ts` with typed responses
- **Styling**: `useMemo(() => createStyles(colors))` pattern
- **State**: Local component state (no global store for this feature)
- **Modals**: Bottom sheets with snap points, not full-screen modals

### Testing
- No test files found for this feature

## Architecture Insights

**Separation of Concerns:**
- UI logic in `app/cli-assets/index.tsx`
- API contracts in `lib/types.ts`
- HTTP client in `lib/api.ts`
- Backend routes in `agent/src/http/routes/cli-assets.ts`

**Multi-Provider Design:**
- Generic abstraction over 3 AI providers
- Single UI for all providers
- Parallel operations when syncing

**Filesystem as Database:**
- No database persistence
- Reads directly from `~/.claude/`, `~/.codex/`, etc.
- Filesystem mtime used for timestamps

**Mobile-First UI:**
- Bottom sheets for modals
- Horizontal scroll for filters
- Pull-to-refresh
- Touch-optimized action buttons

## Open Questions

1. **Authentication**: No authentication/authorization checks in routes - relies on local network trust?
2. **Conflict Resolution**: What happens if file changes externally while app is open?
3. **Validation**: Content validation for MCPs (JSON schema)?
4. **Offline Support**: Does it cache assets for offline viewing?
5. **File Watching**: Does the backend watch for external file changes?

## Related Features

Based on git status, similar patterns exist for:
- **AI Sessions** (`app/ai-sessions/`) - session management
- **Ports** (`app/ports/`) - port forwarding/tunnels
- **Projects** (`app/projects/`) - project management

These likely follow similar architectural patterns (React Query + API client + agent routes).
