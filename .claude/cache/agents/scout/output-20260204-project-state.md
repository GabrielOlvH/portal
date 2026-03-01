# Codebase Report: Project Management and State Flow
Generated: 2026-02-04

## Summary

Projects in this React Native/Expo app are **device-local entities** stored in AsyncStorage. They reference remote hosts where actual project directories exist. There is **no sync mechanism** between devices - each device maintains its own project list independently. Projects are purely metadata (name, path, hostId) with dynamic data (scripts, icons, GitHub status) fetched on-demand from the agent running on the host.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    React Native App                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  AsyncStorage (Device-Local)                         │   │
│  │  - tmux.projects.v1                                  │   │
│  │  - tmux.recent-launches.v1                           │   │
│  └──────────────────────────────────────────────────────┘   │
│           │                                                   │
│           ▼                                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  ProjectsProvider (Context)                          │   │
│  │  - Loads projects on mount                           │   │
│  │  - Provides CRUD operations                          │   │
│  │  - Manages recent launches                           │   │
│  └──────────────────────────────────────────────────────┘   │
│           │                                                   │
│           ▼                                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  UI Components                                        │   │
│  │  - Projects Tab: List/browse projects                │   │
│  │  - New Project Screen: Add projects                  │   │
│  │  - Launch Sheet: Execute commands                    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ HTTP API Calls
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Agent (Node.js Server)                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  File Routes                                          │   │
│  │  - GET /project/scripts?path=...                     │   │
│  │  - GET /project/icon?path=...                        │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  GitHub Routes                                        │   │
│  │  - POST /github/status                               │   │
│  │  - POST /github/status/refresh                       │   │
│  │  - POST /github/branches                             │   │
│  └──────────────────────────────────────────────────────┘   │
│           │                                                   │
│           ▼                                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  File System + Git Integration                       │   │
│  │  - Reads package.json scripts                        │   │
│  │  - Searches for project icons                        │   │
│  │  - Queries git status via `git` CLI                  │   │
│  │  - Fetches GitHub status via `gh` CLI                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Key Data Structures

### Project Type
**Location:** `/home/gabriel/Projects/Personal/portal/lib/types.ts`

```typescript
export type Project = {
  id: string;          // Generated with createId('project')
  hostId: string;      // References Host.id
  name: string;        // Display name
  path: string;        // Absolute path on the host machine
  iconUrl?: string;    // Optional icon URL (fetched dynamically)
};
```

### RecentLaunch Type
**Location:** `/home/gabriel/Projects/Personal/portal/lib/types.ts`

```typescript
export type RecentLaunch = {
  id: string;
  hostId: string;
  projectId: string;
  projectName: string;
  hostName: string;
  command: Command;    // Contains command string and type
  timestamp: number;
};
```

## Storage Layer

### AsyncStorage Keys
| Key | Data | Max Size |
|-----|------|----------|
| `tmux.projects.v1` | `Project[]` | Unlimited |
| `tmux.recent-launches.v1` | `RecentLaunch[]` | 10 items (MAX_RECENT_LAUNCHES) |

### Storage Functions
**Location:** `/home/gabriel/Projects/Personal/portal/lib/projects-store.tsx`

```typescript
// Load/Save Projects
async function loadProjects(): Promise<Project[]>
async function saveProjects(projects: Project[]): Promise<void>

// Load/Save Recent Launches
async function loadRecentLaunches(): Promise<RecentLaunch[]>
async function saveRecentLaunches(launches: RecentLaunch[]): Promise<void>
```

**Migration Note:** The `loadProjects()` function strips legacy `customCommands` field for backward compatibility:
```typescript
const { customCommands: _customCommands, ...rest } = project as StoredProject;
return rest as Project;
```

## State Management

### ProjectsProvider Context
**Location:** `/home/gabriel/Projects/Personal/portal/lib/projects-store.tsx`

**Provides:**
```typescript
{
  projects: Project[];
  recentLaunches: RecentLaunch[];
  ready: boolean;  // True after initial load
  
  // CRUD Operations
  addProject: (draft: ProjectDraft) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  
  // Recent Launches
  addRecentLaunch: (launch: Omit<RecentLaunch, 'id' | 'timestamp'>) => Promise<void>;
  
  // Utilities
  getProjectsByHost: (hostId: string) => Project[];
}
```

**Lifecycle:**
1. Component mounts → loads from AsyncStorage
2. Operations update state + persist to AsyncStorage
3. Recent launches are deduplicated by projectId + command

## Data Flow: From Creation to Display

### Flow 1: Adding a Project

```
User Action: Fill form in /projects/new
    │
    ├─ Select Host (hostId)
    ├─ Enter Name
    ├─ Enter/Browse Path
    │
    ▼
ProjectsProvider.addProject()
    │
    ├─ Generate ID: createId('project')
    ├─ Create Project object
    │
    ▼
persistProjects([...projects, newProject])
    │
    ├─ Update React state
    └─ Save to AsyncStorage
    │
    ▼
Router navigates back to /projects
```

**Files Involved:**
- `/home/gabriel/Projects/Personal/portal/app/projects/new.tsx` (UI)
- `/home/gabriel/Projects/Personal/portal/lib/projects-store.tsx` (State)
- `/home/gabriel/Projects/Personal/portal/lib/defaults.ts` (ID generation)

### Flow 2: Displaying Projects

```
Projects Tab Loads
    │
    ▼
useProjects() hook
    │
    ├─ Returns projects array
    │
    ▼
Group by hostId (useMemo)
    │
    ▼
Render per-host sections
    │
    ├─ Show host dot (color)
    ├─ Show project name
    ├─ Show project path (muted)
    └─ Quick launch button
```

**Files Involved:**
- `/home/gabriel/Projects/Personal/portal/app/(tabs)/projects.tsx` (UI)
- `/home/gabriel/Projects/Personal/portal/lib/projects-store.tsx` (State)
- `/home/gabriel/Projects/Personal/portal/lib/store.tsx` (Host data)

### Flow 3: Launching a Project

```
User taps Launch button
    │
    ▼
LaunchSheet opens
    │
    ├─ Step 1: Select Host → filters projects by hostId
    ├─ Step 2: Select Project
    │   └─ Fetches icon: GET /project/icon?path={project.path}
    │   └─ Fetches scripts: GET /project/scripts?path={project.path}
    ├─ Step 3: Select Command
    │
    ▼
Execute launch
    │
    ├─ Create session via API
    ├─ Send command text to session
    │
    ▼
addRecentLaunch()
    │
    ├─ Create RecentLaunch object
    ├─ Deduplicate by projectId + command
    ├─ Trim to MAX_RECENT_LAUNCHES (10)
    └─ Save to AsyncStorage
```

**Files Involved:**
- `/home/gabriel/Projects/Personal/portal/components/LaunchSheet.tsx` (UI)
- `/home/gabriel/Projects/Personal/portal/lib/api.ts` (API calls)
- `/home/gabriel/Projects/Personal/portal/lib/projects-store.tsx` (Recent launches)

### Flow 4: Fetching Dynamic Project Data

```typescript
// Icon Fetch
fetchProjectIcon(host, project.path)
    │
    ▼
GET {host.baseUrl}/project/icon?path={path}
    │
    ▼
Agent: Uses ripgrep to find icon files (favicon/icon, png/svg/ico)
    │
    └─ Returns { found: boolean, path?: string, name?: string }

// Scripts Fetch
fetchProjectScripts(host, project.path)
    │
    ▼
GET {host.baseUrl}/project/scripts?path={path}
    │
    ▼
Agent: Reads package.json from {path}/package.json
    │
    └─ Returns { hasPackageJson: boolean, scripts: Record<string, string> }
```

## Host-Project Relationship

### Host Type
**Location:** `/home/gabriel/Projects/Personal/portal/lib/types.ts`

```typescript
export type Host = {
  id: string;
  name: string;
  baseUrl: string;     // Agent HTTP endpoint
  authToken?: string;
  color?: string;      // Visual identifier
  // ... other fields
};
```

### Relationship Model
- **One-to-Many:** One Host can have many Projects
- **Foreign Key:** `Project.hostId` references `Host.id`
- **No Cascade:** Deleting a host does NOT auto-delete its projects
- **Filtering:** Projects filtered by host using `getProjectsByHost(hostId)`

**Used in:**
- `/home/gabriel/Projects/Personal/portal/app/(tabs)/projects.tsx` - Groups projects by host
- `/home/gabriel/Projects/Personal/portal/app/projects/new.tsx` - Host selection dropdown
- `/home/gabriel/Projects/Personal/portal/components/LaunchSheet.tsx` - Filters projects by selected host

## Device-Specific Storage

### No Sync Mechanism
**Finding:** There is NO synchronization between devices. Each device maintains its own:
- Project list
- Recent launches
- Host configurations

**Evidence:**
- Storage is AsyncStorage only (device-local)
- No network sync code found
- No shared database (e.g., Firebase, Supabase)
- No export/import functionality

### Multi-Device Implications
| Scenario | Behavior |
|----------|----------|
| Add project on Device A | Only visible on Device A |
| Launch command on Device B | Recorded in Device B's recent launches only |
| Delete project on Device A | Device B still has it |
| Same host on both devices | Projects must be added separately on each |

## GitHub Integration

### Status Fetching
**Location:** `/home/gabriel/Projects/Personal/portal/lib/queries/github.ts`

```typescript
useGitHubStatus(hosts, projects, enabled)
  │
  ├─ Groups projects by hostId
  ├─ Calls getGitHubStatus() per host
  │   └─ POST {host.baseUrl}/github/status
  │       └─ Body: { projects: [{ id, hostId, path }], branches? }
  │
  └─ Returns GitHubCommitStatus[] (aggregated)
```

### Agent GitHub Routes
**Location:** `/home/gabriel/Projects/Personal/portal/agent/src/http/routes/github.ts`

```
POST /github/status           - Get cached status for projects
POST /github/status/refresh   - Force refresh (clears cache)
POST /github/branches         - Get branches for a project
GET  /github/config           - Get GitHub CLI auth status
```

### Agent GitHub Logic
**Location:** `/home/gabriel/Projects/Personal/portal/agent/src/github.ts`

**Key Functions:**
- `getRepoFromPath(projectPath)` - Parse GitHub repo from git remote
- `getCurrentBranch(projectPath)` - Get active branch
- `getLatestCommit(projectPath, branch)` - Get commit SHA
- `getGitDiffStats(projectPath, branch)` - Get ahead/behind counts
- `getProjectCommitStatus()` - Fetch GitHub status via `gh` CLI
- `getAllProjectStatuses()` - Batch process multiple projects

**Caching:**
- 30 second TTL per project+branch
- Max 200 entries in memory
- Cache key: `${projectId}:${branch}`

## API Endpoints

### Project-Related Endpoints (Agent)

| Method | Path | Purpose | Returns |
|--------|------|---------|---------|
| GET | `/project/scripts?path=...` | Fetch package.json scripts | `{ hasPackageJson, scripts }` |
| GET | `/project/icon?path=...` | Find project icon | `{ found, path?, name? }` |
| POST | `/github/status` | Get GitHub status | `{ authenticated, statuses }` |
| POST | `/github/status/refresh` | Refresh GitHub status | `{ authenticated, statuses }` |
| POST | `/github/branches` | Get git branches | `{ branches }` |

**Security:** All file paths validated against:
- `process.env.HOME`
- `/tmp`
- `/home`
- `process.cwd()`

Path traversal (`..`) is blocked.

## UI Components

### Projects Tab
**Location:** `/home/gabriel/Projects/Personal/portal/app/(tabs)/projects.tsx`

**Layout:**
```
┌─────────────────────────────────────┐
│ Projects              [+ Launch]    │
├─────────────────────────────────────┤
│ RECENT LAUNCHES                     │
│ ┌─────────────────────────────────┐ │
│ │ • my-app                        │ │
│ │   npm run dev               5m  │ │
│ ├─────────────────────────────────┤ │
│ │ • api-server                    │ │
│ │   pnpm start                2h  │ │
│ └─────────────────────────────────┘ │
│                                      │
│ ALL PROJECTS                [+]     │
│ ┌─────────────────────────────────┐ │
│ │ • LOCAL                      3  │ │
│ ├─────────────────────────────────┤ │
│ │   my-app                       ▶│ │
│ │   /home/user/projects/my-app    │ │
│ ├─────────────────────────────────┤ │
│ │   api-server                   ▶│ │
│ │   /home/user/projects/api       │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Features:**
- Pull-to-refresh (manual only, no auto-refresh)
- Empty state with "Add Project" CTA
- Quick launch button per project
- Host color dots for visual grouping
- Relative timestamps for recent launches

### New Project Screen
**Location:** `/home/gabriel/Projects/Personal/portal/app/projects/new.tsx`

**Form Fields:**
1. **Host Selection** (required) - Radio list of hosts
2. **Name** (required) - Text input
3. **Path** (required) - Text input + Browse button

**Browse Feature:**
- Opens DirectoryBrowser in modal
- Fetches directory listing from host
- Auto-fills name from selected directory

**Validation:**
- All fields required before submit
- Path validation happens on agent side

### Launch Sheet
**Location:** `/home/gabriel/Projects/Personal/portal/components/LaunchSheet.tsx`

**Multi-Step Wizard:**
```
Step 1: Select Host
    ↓
Step 2: Select Project
    ├─ Shows project icon (if found)
    ├─ Shows package.json scripts (if exists)
    └─ Option to browse for directory
    ↓
Step 3: Select Command
    ├─ Package scripts
    ├─ Recent commands
    ├─ Saved snippets
    └─ Custom command input
    ↓
Execute & Record
```

**State Management:**
- Uses bottom sheet from `@gorhom/bottom-sheet`
- Animated step transitions
- Progress dots for navigation
- Can jump back to previous steps

## Open Questions / Missing Features

### No Sync
- Projects are device-local only
- No export/import functionality
- No cloud backup
- No QR code sharing

### No Validation
- Path existence not checked until launch
- Host connectivity not verified before project creation
- No warning if host is deleted but projects exist

### No Project Settings
- Can't edit project after creation (must delete/recreate)
- No notes or tags
- No last-used timestamp tracking
- No usage statistics per project

### No Deduplication
- Same project path can be added multiple times with different names
- No detection of duplicate entries

## Key Files Reference

| File | Purpose | Lines |
|------|---------|-------|
| `/home/gabriel/Projects/Personal/portal/lib/projects-store.tsx` | Project state management | 169 |
| `/home/gabriel/Projects/Personal/portal/lib/types.ts` | Type definitions | ~150 |
| `/home/gabriel/Projects/Personal/portal/app/(tabs)/projects.tsx` | Projects tab UI | 291 |
| `/home/gabriel/Projects/Personal/portal/app/projects/new.tsx` | New project form | 258 |
| `/home/gabriel/Projects/Personal/portal/components/LaunchSheet.tsx` | Launch wizard | 1076 |
| `/home/gabriel/Projects/Personal/portal/lib/api.ts` | HTTP client | 630 |
| `/home/gabriel/Projects/Personal/portal/lib/queries/github.ts` | GitHub integration | 137 |
| `/home/gabriel/Projects/Personal/portal/agent/src/github.ts` | GitHub agent logic | 500+ |
| `/home/gabriel/Projects/Personal/portal/agent/src/http/routes/files.ts` | File routes | 267 |
| `/home/gabriel/Projects/Personal/portal/agent/src/http/routes/github.ts` | GitHub routes | 126 |

## Data Flow Summary

```
Device A (iPhone)                    Device B (iPad)
┌──────────────────┐                ┌──────────────────┐
│ AsyncStorage     │                │ AsyncStorage     │
│ - projects: [A]  │   NO SYNC      │ - projects: [B]  │
│ - launches: [1]  │ ◄─────────────►│ - launches: [2]  │
└──────────────────┘                └──────────────────┘
        │                                    │
        └─────────HTTP API Calls─────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │  Agent (Host)    │
              │  - File System   │
              │  - Git Repos     │
              │  - GitHub API    │
              └──────────────────┘
```

**Key Insight:** Projects are metadata pointers to remote host paths. The app stores what to launch, but the agent knows how to launch it.
