# Codebase Report: CLI Sync Features
Generated: 2026-01-30

## Summary
The "CLI Sync" feature allows users to manage and synchronize AI CLI configuration assets (skills, rules, agents, and MCPs) across multiple AI providers (Claude, Codex, OpenCode) through a mobile interface. This is a complete CRUD system for managing configuration files that typically live in directories like `.claude/skills/`, `.codex/rules/`, etc.

## Project Structure

```
portal/
├── app/
│   ├── (tabs)/
│   │   └── more.tsx              # "More" tab with menu item linking to CLI Sync
│   └── cli-assets/
│       └── index.tsx              # Main CLI Assets management screen
├── lib/
│   ├── types.ts                   # CliAsset type definitions
│   └── api.ts                     # API client functions for CLI assets
└── agent/
    └── src/
        └── http/
            └── routes/
                └── cli-assets.ts  # Backend API routes and file operations
```

## Components

### 1. UI Entry Point
**File:** `/home/gabriel/Projects/Personal/portal/app/(tabs)/more.tsx`
**Purpose:** Settings/More tab that provides navigation to CLI Sync feature

**Key Code:**
```tsx
<MenuItem
  title="CLI Sync"
  subtitle="Skills, commands, and MCPs"
  onPress={() => router.push('/cli-assets')}
  styles={styles}
  chevronColor={colors.textSecondary}
/>
```

**Functionality:**
- Displays menu item in More tab
- Links to `/cli-assets` route
- Shows subtitle describing what can be synced

---

### 2. Main Management Screen
**File:** `/home/gabriel/Projects/Personal/portal/app/cli-assets/index.tsx`
**Purpose:** Full CRUD interface for managing CLI assets across providers

**Key Features:**
- **Multi-provider support**: Claude, Codex, OpenCode
- **Asset type filtering**: Skills, Rules, Agents, MCPs
- **Grouping logic**: Groups same asset across different providers
- **Search**: Filter assets by name/content
- **CRUD operations**: Create, view, edit, delete assets
- **Provider badges**: Visual indicators showing which providers have the asset
- **Smart preview**: Strips YAML frontmatter, shows meaningful content snippets

**Functions:**
```typescript
function groupAssetsByName(assets: CliAsset[]): GroupedAsset[]
// Groups assets with same filename across providers

function buildPreview(asset: CliAsset): string
// Creates preview text, handling YAML frontmatter and MCP JSON

export default function CliAssetsScreen()
// Main component with asset list, search, and bottom sheet editor
```

**UI Components:**
- Asset type tabs (Skills, Rules, Agents, MCPs)
- Search bar
- Asset cards showing name, providers (with colored badges), and preview
- Bottom sheet modal for create/edit/view
- Provider selection chips (multi-select for write operations)
- Content editor (multiline text input)

**State Management:**
- Selected host (which server to sync with)
- Asset type filter
- Search query
- Modal mode (new/edit/view)
- Target providers for save operations
- TanStack Query for data fetching and caching

---

### 3. Type Definitions
**File:** `/home/gabriel/Projects/Personal/portal/lib/types.ts`
**Purpose:** TypeScript types for CLI assets

**Types Defined:**
```typescript
export type CliAssetType = 'skill' | 'mcp' | 'rule' | 'agent';

export type CliAssetMeta = {
  filename?: string;         // Base filename
  raw?: boolean;             // For raw MCP JSON files
  source?: string;           // Which MCP key (mcpServers vs servers)
  description?: string;      // From YAML frontmatter
  userInvocable?: boolean;   // From YAML frontmatter
  keywords?: string[];       // From YAML frontmatter
};

export type CliAsset = {
  id: string;                // Format: "provider:type:name"
  provider: AiProvider;      // claude | codex | opencode
  type: CliAssetType;
  name: string;              // Asset name
  content: string;           // File content
  updatedAt?: number;        // File modification timestamp (ms)
  path?: string;             // Absolute file path on server
  meta?: CliAssetMeta;
};

export type CliAssetListResponse = {
  assets: CliAsset[];
};
```

---

### 4. API Client
**File:** `/home/gabriel/Projects/Personal/portal/lib/api.ts`
**Purpose:** Client-side API functions for communicating with backend

**Functions:**

```typescript
export type CliAssetsOptions = {
  type: CliAssetType;
  provider?: AiProvider;
};

export async function getCliAssets(
  host: Host,
  options: CliAssetsOptions
): Promise<CliAssetListResponse>
// GET /cli-assets?type={type}&provider={provider}
// Fetches all assets of a given type, optionally filtered by provider

export async function upsertCliAsset(
  host: Host,
  payload: { 
    provider: AiProvider; 
    type: CliAssetType; 
    name: string; 
    content: string 
  }
): Promise<{ ok: boolean }>
// POST /cli-assets
// Creates or updates an asset

export async function deleteCliAsset(
  host: Host,
  payload: { 
    provider: AiProvider; 
    type: CliAssetType; 
    name: string 
  }
): Promise<{ ok: boolean }>
// DELETE /cli-assets
// Removes an asset
```

---

### 5. Backend API Routes
**File:** `/home/gabriel/Projects/Personal/portal/agent/src/http/routes/cli-assets.ts`
**Purpose:** Backend HTTP routes and file system operations

**Provider Paths Configuration:**
```typescript
const PROVIDER_PATHS: Record<CliProvider, {
  skill: string[];
  rule: string[];
  agent: string[];
  mcp: string[];
}> = {
  claude: {
    skill: ['.claude/skills'],
    rule: ['.claude/rules'],
    agent: ['.claude/agents'],
    mcp: ['.claude/mcp.json', '.claude/mcp.jsonc'],
  },
  codex: {
    skill: ['.codex/skills'],
    rule: ['.codex/rules'],
    agent: [],
    mcp: ['.codex/mcp.json', '.codex/mcp.jsonc'],
  },
  opencode: {
    skill: ['.config/opencode/skills', '.opencode/skills'],
    rule: ['.config/opencode/instructions', '.opencode/instructions'],
    agent: [],
    mcp: ['.config/opencode/mcp.json', '.opencode/mcp.json'],
  },
};
```

**Key Functions:**

**Path Resolution:**
```typescript
function toAbsolutePath(path: string): string
// Converts ~/path to absolute path

async function resolveFirstExisting(paths: string[], wantDir: boolean)
// Finds first existing path from candidates

async function resolveAssetDir(provider, type, ensure)
// Gets directory for asset type, creates if ensure=true

async function resolveMcpFile(provider, ensure)
// Gets MCP config file path
```

**Asset Listing:**
```typescript
async function listFlatFileAssets(provider, type): Promise<CliAsset[]>
// Lists rule/agent assets (simple .md files in directory)

async function listSkillAssets(provider): Promise<CliAsset[]>
// Lists skill assets (folders with SKILL.md inside)
// Parses YAML frontmatter for metadata

async function listMcpAssets(provider): Promise<CliAsset[]>
// Parses mcp.json/mcp.jsonc
// Extracts individual server configs or returns raw file
```

**CRUD Operations:**
```typescript
async function upsertFlatFileAsset(provider, type, name, content)
// Writes rule/agent .md file

async function upsertSkillAsset(provider, name, content)
// Creates skill folder and SKILL.md file

async function upsertMcpAsset(provider, name, content)
// Updates MCP JSON, preserving structure

async function deleteFlatFileAsset(provider, type, name)
// Removes rule/agent file

async function deleteSkillAsset(provider, name)
// Removes entire skill folder

async function deleteMcpAsset(provider, name)
// Removes MCP server entry or raw file
```

**Frontmatter Parsing:**
```typescript
function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
}
// Parses YAML frontmatter from markdown
// Extracts description, userInvocable, keywords, etc.
```

**HTTP Routes:**
```typescript
app.get('/cli-assets', async (c) => { ... })
// Query params: type (required), provider (optional)
// Returns: { assets: CliAsset[] }

app.post('/cli-assets', async (c) => { ... })
// Body: { provider, type, name, content }
// Returns: { ok: true }

app.delete('/cli-assets', async (c) => { ... })
// Body: { provider, type, name }
// Returns: { ok: true }
```

**Route Registration:**
```typescript
export function registerCliAssetRoutes(app: Hono)
```

---

## Architecture

```
┌─────────────────┐
│  Mobile App UI  │
│  (React Native) │
│                 │
│  - More Tab     │
│  - CLI Assets   │
│    Screen       │
└────────┬────────┘
         │
         │ HTTP API
         │ (via @tanstack/query)
         │
         ▼
┌─────────────────┐
│   Backend API   │
│   (Hono/Node)   │
│                 │
│  /cli-assets    │
│  routes         │
└────────┬────────┘
         │
         │ File I/O
         │
         ▼
┌─────────────────┐
│   File System   │
│                 │
│  ~/.claude/     │
│  ~/.codex/      │
│  ~/.opencode/   │
└─────────────────┘
```

## Data Flow

### Read Flow
1. User navigates to CLI Sync screen
2. UI calls `getCliAssets(host, { type: 'skill' })`
3. API sends `GET /cli-assets?type=skill`
4. Backend reads from filesystem:
   - `.claude/skills/`, `.codex/skills/`, `.opencode/skills/`
5. Backend parses YAML frontmatter
6. Returns array of `CliAsset` objects
7. UI groups by filename, displays with provider badges

### Write Flow
1. User creates/edits asset in bottom sheet
2. User selects target providers (e.g., Claude + Codex)
3. UI calls `upsertCliAsset()` for each provider
4. API sends `POST /cli-assets` with payload
5. Backend writes to appropriate file/folder:
   - Skills: Creates `{name}/SKILL.md` folder structure
   - Rules/Agents: Creates `{name}.md` file
   - MCPs: Updates `mcp.json` with new server entry
6. Returns `{ ok: true }`
7. UI refreshes asset list

### Delete Flow
1. User long-presses asset, confirms deletion
2. UI calls `deleteCliAsset()` for each provider that has it
3. API sends `DELETE /cli-assets`
4. Backend removes file/folder
5. UI refreshes list

## Asset Type Differences

| Type | Storage | Structure | Providers |
|------|---------|-----------|-----------|
| **Skill** | Folder-based | `{name}/SKILL.md` | All 3 |
| **Rule** | Flat file | `{name}.md` | All 3 |
| **Agent** | Flat file | `{name}.md` | Claude only |
| **MCP** | JSON config | Entry in `mcp.json` | All 3 |

## Provider Support Matrix

| Asset Type | Claude | Codex | OpenCode |
|------------|--------|-------|----------|
| Skills | ✓ | ✓ | ✓ |
| Rules | ✓ | ✓ | ✓ |
| Agents | ✓ | ✗ | ✗ |
| MCPs | ✓ | ✓ | ✓ |

## Special Handling

### YAML Frontmatter (Skills)
Skills can have YAML frontmatter with metadata:
```yaml
---
description: Does something useful
user-invocable: true
keywords: [search, find, query]
---

Skill content here...
```

This is parsed and exposed via `meta`:
- `meta.description`
- `meta.userInvocable`
- `meta.keywords`

### MCP JSON Formats
MCPs support two JSON structures:
```json
{
  "mcpServers": { "name": {...} }
}
```
or
```json
{
  "servers": { "name": {...} }
}
```

Backend automatically detects and preserves the original structure.

### Raw MCP Mode
If MCP file can't be parsed, it's treated as "raw" and the entire file content is returned as a single asset with `meta.raw = true`.

## File Paths

### Claude
- Skills: `~/.claude/skills/{name}/SKILL.md`
- Rules: `~/.claude/rules/{name}.md`
- Agents: `~/.claude/agents/{name}.md`
- MCPs: `~/.claude/mcp.json` or `~/.claude/mcp.jsonc`

### Codex
- Skills: `~/.codex/skills/{name}/SKILL.md`
- Rules: `~/.codex/rules/{name}.md`
- MCPs: `~/.codex/mcp.json` or `~/.codex/mcp.jsonc`

### OpenCode
- Skills: `~/.config/opencode/skills/{name}/SKILL.md` or `~/.opencode/skills/{name}/SKILL.md`
- Rules: `~/.config/opencode/instructions/{name}.md` or `~/.opencode/instructions/{name}.md`
- MCPs: `~/.config/opencode/mcp.json` or `~/.opencode/mcp.json`

## Key Files Summary

| File | Purpose | Lines | Key Exports |
|------|---------|-------|-------------|
| `/app/(tabs)/more.tsx` | Navigation menu | ~400 | MoreTabScreen component |
| `/app/cli-assets/index.tsx` | Main UI screen | ~800+ | CliAssetsScreen component |
| `/lib/types.ts` | Type definitions | - | CliAsset, CliAssetType, CliAssetMeta |
| `/lib/api.ts` | API client | ~490 | getCliAssets, upsertCliAsset, deleteCliAsset |
| `/agent/src/http/routes/cli-assets.ts` | Backend routes | ~650 | registerCliAssetRoutes |

## Features

1. **Multi-provider sync**: Manage assets across Claude, Codex, and OpenCode simultaneously
2. **Provider-aware grouping**: Same asset across providers shown as one item with badges
3. **Smart preview generation**: Strips YAML frontmatter, extracts meaningful snippets
4. **Search**: Filter assets by name or content
5. **CRUD operations**: Full create, read, update, delete support
6. **Metadata extraction**: Parses YAML frontmatter for skills
7. **MCP JSON handling**: Intelligent parsing and merging of MCP configs
8. **Path resolution**: Supports multiple fallback paths per provider
9. **Auto-directory creation**: Creates missing directories when writing
10. **Type-safe**: Full TypeScript types throughout stack

## Error Handling

- Invalid names are sanitized (removes path separators, trims whitespace)
- Missing directories created automatically on write
- JSON parsing errors fallback to raw mode
- File read errors return empty arrays (graceful degradation)
- API errors returned with proper HTTP status codes

## Open Questions

None identified - the system appears complete and production-ready.
