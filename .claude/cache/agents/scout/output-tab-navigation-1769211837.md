# Codebase Report: Tab Navigation Structure
Generated: 2026-01-23

## Summary
This Expo/React Native app uses expo-router's native tabs with 4 main tabs. The app has a clear separation between tab-based navigation (persistent bottom bar) and modal/stack screens (full-screen).

## Tab Navigation Architecture

### Main Tab Bar Configuration
**Location:** `/home/gabrielolv/Documents/Projects/ter/app/(tabs)/_layout.tsx`

```
NativeTabs (4 tabs):
├── index (Sessions)
├── hosts (Hosts)  
├── docker (Docker)
└── more (More)
```

**Key Features:**
- Uses `expo-router/unstable-native-tabs`
- SF Symbols for icons (iOS-style)
- Minimize behavior on scroll down
- Theme-aware tint color

### Tab Files

| Tab Route | File | Purpose | Key Features |
|-----------|------|---------|-------------|
| `index` | `app/(tabs)/index.tsx` (26KB) | Sessions list | Main session management, usage cards |
| `hosts` | `app/(tabs)/hosts.tsx` (14KB) | Host management | List all connected hosts |
| `docker` | `app/(tabs)/docker.tsx` (16KB) | Docker containers | Grouped by compose project |
| `more` | `app/(tabs)/more.tsx` (24KB) | Settings/extras | Projects, snippets, CLI assets, usage stats |

## Docker Integration

### Docker Tab (`app/(tabs)/docker.tsx`)
**Features:**
- Lists all Docker containers across all hosts
- Groups by compose project (detected from labels)
- Shows standalone containers separately
- Container states: running/stopped counts
- Uses `useAllDocker` hook from `@/lib/docker-hooks`

**Related Files:**
- `/home/gabrielolv/Documents/Projects/ter/lib/docker-hooks.ts` - React hooks for Docker state
- `/home/gabrielolv/Documents/Projects/ter/agent/src/docker.ts` - Backend Docker integration
- `/home/gabrielolv/Documents/Projects/ter/agent/src/http/routes/docker.ts` - API routes

**Container Details (Modal Routes):**
```
app/hosts/[id]/docker/[containerId]/
├── index.tsx      # Container overview
├── terminal.tsx   # Attached terminal
└── logs.tsx       # Container logs
```

## Projects & Sessions Integration

### Projects
**Main Screen:** `/home/gabrielolv/Documents/Projects/ter/app/projects/index.tsx`
- Accessed from "More" tab
- Groups projects by host
- Shows AI session counts per project
- Quick-launch commands and agents

**Related:**
- `app/projects/new.tsx` - Create project form
- `@/lib/projects-store` - Zustand store for project state

### AI Sessions
**Main Screen:** `/home/gabrielolv/Documents/Projects/ter/app/ai-sessions/index.tsx`
- Not in main tabs (accessed from projects or more tab)
- Lists all AI sessions (Claude, Codex, OpenCode)
- Search, filter, resume sessions
- Shows provider, project, last modified

**Features:**
- Provider-specific colors (Claude=orange, Codex=green, OpenCode=purple)
- Relative time formatting ("2h ago")
- Project name extraction from directory path

### Regular Sessions (Terminal)
**Main Screen:** `app/(tabs)/index.tsx` (Sessions tab)
- Primary tab for terminal sessions
- Swipeable rows (delete, rename)
- Launch new sessions
- Shows host, session name, status

**Session Details:**
```
app/session/[hostId]/[name]/
├── index.tsx     # Session overview
└── terminal.tsx  # Terminal UI with WebView
```

## Navigation Structure

### Root Layout
**File:** `/home/gabrielolv/Documents/Projects/ter/app/_layout.tsx`

**Stack Routes (Full Screen):**
```
Stack:
├── (tabs)                                    # Tab navigator
├── session/[hostId]/[name]/terminal         # Terminal session
├── hosts/[id]/index                         # Host details
├── hosts/new                                # Add host
├── hosts/[id]/edit                          # Edit host
├── hosts/[id]/docker/[containerId]/index    # Container details
├── projects/index                           # Projects list
├── projects/new                             # Create project
├── snippets/index                           # Snippets library
├── cli-assets/index                         # CLI asset manager
├── ports/index                              # Port forwarding
└── session/[hostId]/[name]/index            # Session details
```

**Providers:**
- `ProjectsProvider` - Project state
- `SnippetsProvider` - Snippet state  
- `LaunchSheetProvider` - Launch sheet UI
- `ThemeProvider` - Theme context

## App Directory Structure

```
app/
├── (tabs)/                    # Tab navigator
│   ├── _layout.tsx           # Tab configuration
│   ├── index.tsx             # Sessions tab
│   ├── hosts.tsx             # Hosts tab
│   ├── docker.tsx            # Docker tab
│   └── more.tsx              # More tab
├── ai-sessions/
│   └── index.tsx             # AI sessions list
├── cli-assets/
│   └── index.tsx             # CLI asset manager
├── copilot/
│   └── (auth flows)
├── hosts/
│   ├── [id]/
│   │   ├── index.tsx         # Host details
│   │   ├── edit.tsx          # Edit host
│   │   └── docker/
│   │       └── [containerId]/
│   │           ├── index.tsx
│   │           ├── logs.tsx
│   │           └── terminal.tsx
│   └── new.tsx               # Add host
├── ports/
│   └── index.tsx             # Port forwarding
├── projects/
│   ├── [id]/                 # Project details (if exists)
│   ├── index.tsx             # Projects list
│   └── new.tsx               # Create project
├── session/
│   └── [hostId]/[name]/
│       ├── index.tsx         # Session overview
│       └── terminal.tsx      # Terminal UI
├── snippets/
│   └── index.tsx             # Snippets list
└── _layout.tsx               # Root stack navigator
```

## More Tab Contents

**File:** `app/(tabs)/more.tsx`

**Menu Items:**
1. **Projects** → `/projects`
   - "Quick-launch commands and agents"
   
2. **Snippets** → `/snippets`
   - "Global commands to reuse anywhere"
   
3. **CLI Assets** → `/cli-assets`
   - CLI tools and binaries
   
4. **Ports** → `/ports`
   - Port forwarding management
   
5. **Usage Cards** (inline)
   - Claude, Codex, Copilot usage stats
   - API limits, resets
   - Authentication status

## Key Patterns Observed

### Navigation Pattern
- **Tabs:** Persistent bottom navigation (Sessions, Hosts, Docker, More)
- **Stack:** Full-screen modals for detail views
- **Deep Links:** URL-based routing with params `[hostId]`, `[name]`, `[containerId]`

### State Management
- **Zustand Stores:** `useStore()`, `useProjects()`, `useSnippets()`
- **React Query:** API data fetching with caching
- **Live Updates:** `useHostsLive()`, `useTaskLiveUpdates()`

### Component Patterns
- **Screen wrapper:** `<Screen>` component for consistent layout
- **Cards:** `<Card>` for grouped content
- **Swipeable rows:** Delete/edit actions
- **Skeleton loading:** `<SkeletonList>` for loading states
- **Theme-aware:** All use `useTheme()` hook

### Docker-Specific Patterns
- **Compose grouping:** Containers grouped by `com.docker.compose.project` label
- **Multi-host:** Aggregates containers from all connected hosts
- **State management:** `useAllDocker()` hook provides real-time state
- **Color coding:** Host colors from `hostColors` mapping

## Docker Files Deep Dive

### Frontend (`app/(tabs)/docker.tsx`)
**Line 23-27:** Imports Docker hooks
```typescript
import {
  useAllDocker,
  ContainerWithHost,
  isContainerRunning,
  formatBytes,
} from '@/lib/docker-hooks';
```

**Line 34-43:** ComposeGroup type definition
```typescript
type ComposeGroup = {
  key: string;
  title: string;
  hostName: string;
  hostColor: string | undefined;
  containers: ContainerWithHost[];
  running: number;
  stopped: number;
  isStandalone: boolean;
};
```

### Backend Integration
- **API Client:** `dockerContainerAction()` from `@/lib/api`
- **Hooks:** `@/lib/docker-hooks` - container state management
- **Agent Routes:** `agent/src/http/routes/docker.ts` - REST API
- **Docker Service:** `agent/src/docker.ts` - Docker SDK integration

## Open Questions
None - structure is clear and well-organized.

## Recommendations
1. Consider adding AI Sessions to main tab bar (currently buried in More → Projects)
2. Docker tab could benefit from filter/search (many containers)
3. Projects might deserve its own tab if heavily used
