# Codebase Report: Navigation and Tab Structure
Generated: 2026-01-21

## Summary

This is a React Native Expo app using the native tabs pattern with 4 main tabs plus secondary features accessed via the "More" tab. The app manages SSH hosts, sessions, Docker containers, and provides AI/automation features.

## Tab Structure (4 Tabs)

Located in `app/(tabs)/_layout.tsx`:

| Tab | Icon | Route | Lines | Prominence |
|-----|------|-------|-------|------------|
| **Sessions** | terminal | `index` | 823 | PRIMARY - Home screen |
| **Hosts** | server.rack | `hosts` | 458 | PRIMARY - Core feature |
| **Docker** | shippingbox | `docker` | 561 | PRIMARY - Core feature |
| **More** | ellipsis | `more` | 716 | OVERFLOW - Settings & secondary features |

### Design Pattern: Prominent vs Hidden

**Prominent Features (Main Tabs):**
- Sessions - Active SSH/terminal sessions with live updates
- Hosts - Server management and connection
- Docker - Container management across all hosts

**Hidden in More Tab:**
- Projects
- Snippets  
- AI Sessions
- Ports
- Settings (theme, notifications, etc.)

## 1. Sessions Tab (index.tsx)

**Location:** `/home/gabrielolv/Documents/Projects/ter/app/(tabs)/index.tsx`

**Purpose:** Home screen showing active SSH sessions and AI provider usage

**Key Features:**
- Live session list with status indicators
- Provider usage cards (Claude, Codex, Copilot)
- Session management (rename, kill)
- LaunchSheet integration for quick actions
- Pull-to-refresh for live updates

**Navigation Patterns:**
```typescript
// Only navigation: Create new host when no hosts exist
router.push('/hosts/new')
```

**Components:**
- `SessionsScreen` - Main component
- `CompactUsageCard` - Shows AI provider usage/limits
- Uses `SwipeableRow` for session actions
- Integrates with `useHostsLive()` for real-time updates

**State Management:**
- `useStore` - Global host/session state
- `useHostsLive` - WebSocket live updates
- `useTaskLiveUpdates` - Task status updates
- `useLaunchSheet` - Quick action sheet

## 2. Hosts Tab (hosts.tsx)

**Location:** `/home/gabrielolv/Documents/Projects/ter/app/(tabs)/hosts.tsx`

**Purpose:** Manage SSH host connections and discovery

**Key Features:**
- Host list with status indicators (online/offline)
- Network discovery for agents
- Update checker for agent software
- Add new hosts
- Empty state with CTA

**Navigation Patterns:**
```typescript
router.push('/hosts/new')           // Add new host
router.push(`/hosts/${host.id}`)    // Host detail page
```

**Components:**
- `HostsTabScreen` - Main component
- `HostCard` - Host status and info
- Uses `scanForAgents()` for network discovery
- `checkForUpdate` / `applyUpdate` for agent updates

**Host Detail Pages:**
- `/hosts/[id]/index.tsx` - Host overview with sessions and Docker containers
- `/hosts/[id]/edit.tsx` - Edit host configuration
- `/hosts/[id]/docker/[containerId]/` - Docker container management

## 3. Docker Tab (docker.tsx)

**Location:** `/home/gabrielolv/Documents/Projects/ter/app/(tabs)/docker.tsx`

**Purpose:** Unified view of all Docker containers across all hosts

**Key Features:**
- Aggregated container list from all hosts
- Grouped by host
- Collapsible host sections
- Container actions (start/stop)
- Quick terminal access
- Status indicators (running/stopped)

**Navigation Patterns:**
```typescript
router.push(`/hosts/${host.id}/docker/${encodeURIComponent(container.id)}/terminal`)
router.push(`/hosts/${host.id}/docker/${encodeURIComponent(container.id)}/logs`)
```

**Components:**
- `DockerTabScreen` - Main component
- Uses `useAllDocker()` hook - aggregates containers from all hosts
- Container grouping by host
- Real-time status updates

**Docker Detail Pages:**
- `/hosts/[id]/docker/[containerId]/index.tsx` - Container overview
- `/hosts/[id]/docker/[containerId]/terminal.tsx` - Interactive terminal
- `/hosts/[id]/docker/[containerId]/logs.tsx` - Container logs

## 4. More Tab (more.tsx)

**Location:** `/home/gabrielolv/Documents/Projects/ter/app/(tabs)/more.tsx`

**Purpose:** Settings and secondary features overflow

### Sections in More Tab

#### Features Section
```typescript
<MenuItem title="Projects" subtitle="Quick-launch commands and agents" → /projects />
<MenuItem title="Snippets" subtitle="Global commands to reuse anywhere" → /snippets />
<MenuItem title="AI Sessions" subtitle="Claude, Codex, and OpenCode sessions" → /ai-sessions />
<MenuItem title="Ports" subtitle="View and manage active ports" → /ports />
```

#### Provider Integration Section
- **Claude Code** - Usage display (no auth needed)
- **Codex** - Usage display (no auth needed)  
- **GitHub Copilot** - Auth required, connect/disconnect flow

#### Settings Section
```typescript
<ToggleItem title="Push notifications" subtitle="Alerts when a task pauses" />
<ToggleItem title="Live updates" subtitle="Live Activity on iOS..." />
<ToggleItem title="Hide usage cards" subtitle="Hide Claude/Copilot cards on home" />
```

#### Appearance Section
- **Theme selector** - Light / Dark / System
- **Font family** - JetBrains Mono / SF Mono / Menlo
- **Font size slider** - 10-20px

#### Debug Section
- Test local notification
- Test push notification

**Components:**
- `MenuItem` - Navigable menu item with chevron
- `ToggleItem` - Switch toggle for settings
- `ThemeOption` - Theme selector buttons
- `FontOption` - Font selector buttons
- `FontSizeSelector` - Slider for font size

## Secondary Features (Accessed via More)

### Projects (/projects/)
**Location:** `/home/gabrielolv/Documents/Projects/ter/app/projects/`

**Purpose:** Quick-launch commands and agent configurations

**Files:**
- `index.tsx` - Project list (5924 bytes)
- `new.tsx` - Create new project (10851 bytes)
- `[id]/` - Project detail (directory exists)

### Snippets (/snippets/)
**Location:** `/home/gabrielolv/Documents/Projects/ter/app/snippets/`

**Purpose:** Global command snippets reusable across sessions

**Files:**
- `index.tsx` - Snippet manager (9630 bytes)

### AI Sessions (/ai-sessions/)
**Location:** `/home/gabrielolv/Documents/Projects/ter/app/ai-sessions/`

**Purpose:** Manage Claude Code, Codex, and other AI sessions

**Files:**
- `index.tsx` - AI session list (14417 bytes)
- `[provider]/[id].tsx` - Individual AI session detail

### Ports (/ports/)
**Location:** `/home/gabrielolv/Documents/Projects/ter/app/ports/`

**Purpose:** View and manage port forwarding/tunnels

**Files:**
- `index.tsx` - Port management (17336 bytes)

### Session Detail (/session/)
**Location:** `/home/gabrielolv/Documents/Projects/ter/app/session/[hostId]/[name]/`

**Purpose:** Individual SSH session management

**Files:**
- `index.tsx` - Session overview
- `terminal.tsx` - Terminal interface

## Root Layout (_layout.tsx)

**Location:** `/home/gabrielolv/Documents/Projects/ter/app/_layout.tsx`

**Provider Stack:**
```typescript
<ThemeSettingProvider>
  <StoreProvider>          // Global state
    <ProjectsProvider>     // Projects context
      <SnippetsProvider>   // Snippets context
        <QueryProvider>    // React Query
          <LaunchSheetProvider>  // Quick actions
            <ThemeProvider>      // Navigation theme
              <SafeAreaProvider>
                <GestureHandlerRootView>
                  <Stack />      // Navigation
                  <LaunchSheet /> // Global sheet
```

**Functions:**
- `RootLayout` - Font loading and splash screen
- `RootBootstrap` - Notification registration
- `ThemedApp` - Theme switching
- `NavigationRoot` - Stack navigator config
- `GlobalLaunchSheet` - Global action sheet

## Navigation Patterns

### Entry Points to Hosts
```typescript
// Multiple CTAs lead to host creation:
/hosts/new           ← From Hosts tab
/hosts/new           ← From Projects (when no hosts)
/hosts/new           ← From Ports (when no hosts)
/hosts/new           ← From AI Sessions (when no hosts)
```

### Host → Features Flow
```typescript
Hosts tab → /hosts/[id] → {
  Sessions list
  Docker containers
  Edit host
  Docker detail pages
}
```

### Docker Access Pattern
```typescript
// Two paths to Docker containers:
1. Docker tab → Aggregated view → Container detail
2. Hosts tab → Host detail → Docker containers → Container detail
```

### Session Access Pattern
```typescript
Sessions tab → Session card → /session/[hostId]/[name]/ → {
  index.tsx    - Overview
  terminal.tsx - Interactive terminal
}
```

## Design Decisions

### Why 4 Tabs?
- **Sessions** - Primary use case (terminal access)
- **Hosts** - Core infrastructure management
- **Docker** - Key feature worth dedicated tab
- **More** - Everything else to avoid tab overload

### Prominent Feature Criteria
Features get a dedicated tab if they are:
1. Frequently accessed (Sessions, Hosts)
2. Primary app purpose (terminal management)
3. Real-time monitoring needed (Docker containers)

### Hidden Feature Criteria  
Features go in More tab if they are:
1. Configuration/settings (theme, notifications)
2. Secondary workflows (Projects, Snippets)
3. Occasional use (AI Sessions, Ports)
4. Provider integrations (Copilot auth)

### Navigation Philosophy
- **Flat hierarchy** - Most screens 1-2 taps away
- **Contextual CTAs** - Empty states always offer next action
- **No host? Create one** - Multiple entry points to `/hosts/new`
- **Swipe actions** - Primary actions on session cards
- **Sheet patterns** - Quick actions via LaunchSheet

## Connection Between Features

### Hosts are Central
```
Hosts → Sessions (SSH connections)
Hosts → Docker (container management)
Hosts → Projects (host-specific commands)
Hosts → AI Sessions (provider auth)
Hosts → Ports (port forwarding)
```

### Live Updates Flow
```
WebSocket connections → useHostsLive()
→ Updates sessions, Docker status, host status
→ Drives real-time UI updates across all tabs
```

### LaunchSheet Pattern
```
Global FloatingActionButton → LaunchSheet
→ Quick access to common actions
→ Available from any tab
```

## Architecture Map

```
[Root Layout]
    |
    ├─ Providers (Theme, Store, Query, LaunchSheet)
    |
    ├─ [Tab Navigator]
    |   ├─ Sessions (index)
    |   ├─ Hosts
    |   ├─ Docker  
    |   └─ More
    |
    └─ [Stack Routes]
        ├─ /hosts/[id]
        ├─ /session/[hostId]/[name]
        ├─ /projects
        ├─ /snippets
        ├─ /ai-sessions
        ├─ /ports
        └─ /copilot/auth
```

## Key Files Summary

| File | Purpose | Entry Points |
|------|---------|--------------|
| `app/_layout.tsx` | Root provider setup | App initialization |
| `app/(tabs)/_layout.tsx` | Tab bar config | Tab navigation |
| `app/(tabs)/index.tsx` | Sessions home screen | `SessionsScreen()` |
| `app/(tabs)/hosts.tsx` | Hosts management | `HostsTabScreen()` |
| `app/(tabs)/docker.tsx` | Docker aggregation | `DockerTabScreen()` |
| `app/(tabs)/more.tsx` | Settings & features | `MoreTabScreen()` |
| `app/hosts/[id]/index.tsx` | Host detail | Individual host view |
| `app/session/[hostId]/[name]/terminal.tsx` | Terminal UI | SSH session terminal |

## Conventions Discovered

### Naming
- Tabs use simple names: `index`, `hosts`, `docker`, `more`
- Dynamic routes use brackets: `[id]`, `[hostId]`, `[name]`, `[containerId]`
- Screen components named `*Screen` or `*TabScreen`

### File Organization
- Tabs in `(tabs)/` directory (route group)
- Feature modules in own directories (`/projects`, `/snippets`, `/ai-sessions`)
- Nested resources: `/hosts/[id]/docker/[containerId]/`

### Component Patterns
- `Screen` wrapper for consistent layout
- `Card` for grouped content
- `MenuItem` for navigation items
- `SwipeableRow` for list actions
- `FadeIn` for animations

### State Management
- Global state via `useStore()` hook
- Live updates via `useHostsLive()` WebSocket hook
- Feature-specific providers (Projects, Snippets)
- React Query for API calls

### Styling
- StyleSheet.create() with theme colors
- Memoized styles: `useMemo(() => createStyles(colors), [colors])`
- Theme accessed via `useTheme()` hook
- Dynamic colors from `ThemeColors` type

## Open Questions

None - structure is clear and well-organized.
