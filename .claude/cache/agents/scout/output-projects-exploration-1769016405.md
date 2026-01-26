# Codebase Report: Projects Feature Exploration
Generated: 2026-01-21

## Summary
The Projects feature is a key organizational concept in this React Native/Expo app that allows users to associate development projects with SSH hosts. Projects enable quick launching of commands and sessions, with deep integration into the LaunchSheet component for streamlined workflow.

## Project Structure

```
app/projects/
  index.tsx          # Projects listing screen (grouped by host)
  new.tsx            # Create new project form

lib/
  types.ts           # Project type definitions
  projects-store.tsx # React Context store for projects
  storage.ts         # AsyncStorage persistence (hosts/preferences only)

components/
  LaunchSheet.tsx    # Main launch interface with project selection
  DirectoryBrowser.tsx  # Browse host directories for project paths
```

## Questions Answered

### Q1: Where are the Projects screen(s) and their navigation?

**Screens:**
- `/home/gabrielolv/Documents/Projects/ter/app/projects/index.tsx` - Main projects listing
- `/home/gabrielolv/Documents/Projects/ter/app/projects/new.tsx` - Create new project

**Navigation:**
- **From More Tab**: `app/(tabs)/more.tsx` has a menu item that routes to `/projects`
- **Not in Tab Bar**: Projects are NOT a primary tab (tabs are: Sessions, Hosts, Docker, More)
- **Stack Routes**: Registered in `app/_layout.tsx` as:
  ```tsx
  <Stack.Screen name="projects/index" />
  <Stack.Screen name="projects/new" />
  ```
- **Internal Navigation**: 
  - Projects index → "Add Project" button → `/projects/new`
  - New project form → "Cancel" → `router.back()`

### Q2: Project data types and storage

**Type Definition** (`lib/types.ts`):
```typescript
export type Project = {
  id: string;           // Generated with createId('project')
  hostId: string;       // FK to Host
  name: string;         // Display name (e.g., "my-app")
  path: string;         // Absolute path on host (e.g., "/home/user/projects/my-app")
};

export type RecentLaunch = {
  id: string;
  hostId: string;
  projectId: string;
  projectName: string;
  hostName: string;
  command: Command;
  timestamp: number;
};
```

**Storage Implementation** (`lib/projects-store.tsx`):
- **Store Type**: React Context (`ProjectsContext`) with `ProjectsProvider`
- **Persistence**: AsyncStorage key `tmux.projects.v1`
- **State**: In-memory array of `Project[]` + `RecentLaunch[]`
- **Migration Note**: Strips deprecated `customCommands` field from stored projects

**Storage Location**:
- Projects: `@react-native-async-storage/async-storage` (mobile local storage)
- NOT stored in `lib/storage.ts` (that handles hosts/preferences only)

### Q3: How projects are created, listed, and displayed

#### Creating Projects (`app/projects/new.tsx`)

**Flow:**
1. **Host Selection**: User picks a host from configured hosts
2. **Project Details**: Enter name and path
3. **Directory Browser**: Optional modal to browse host filesystem via `DirectoryBrowser` component
4. **Submission**: Calls `addProject({ hostId, name, path })` → generates ID → persists

**API Integration:**
- Uses `DirectoryBrowser` component which calls host API to browse directories
- No direct project API - projects are client-side only

**UI Features:**
- Host selection with colored dots matching host theme
- Path input with "Browse" button (disabled if no host selected)
- Form validation: requires host + name + path
- Link to "Add Host First" if no hosts configured

#### Listing Projects (`app/projects/index.tsx`)

**Display Logic:**
```typescript
// Groups projects by hostId
const projectsByHost = useMemo(() => {
  const grouped = new Map<string, typeof projects>();
  projects.forEach((project) => {
    const existing = grouped.get(project.hostId) || [];
    grouped.set(project.hostId, [...existing, project]);
  });
  return grouped;
}, [projects]);
```

**UI Structure:**
- **Empty State**: Icon + "No projects yet" + CTA button
- **Grouped by Host**: Each host section shows:
  - Host name with colored dot
  - Badge with project count
  - List of project cards
- **Project Card**: Shows name + path (mono font)
- **Header**: "Projects" title + "+" button to add

**Visual Design:**
- Staggered animations (`FadeIn` with `delay={hostIdx * 50}`)
- Uses host colors for visual grouping
- Read-only cards (no swipe actions or editing shown)

### Q4: Relationship to hosts and sessions

**Host Relationship:**
- **Foreign Key**: `Project.hostId` references `Host.id`
- **Dependency**: Cannot create project without selecting a host first
- **Display**: Projects are grouped/organized by host
- **Helper**: `getProjectsByHost(hostId: string)` filters projects for a host

**Session Relationship:**
- **LaunchSheet Integration**: Projects are step 2 in the launch flow:
  1. Select Host
  2. **Select Project** (or "Blank Session")
  3. Select Command (from project's package.json scripts)
  4. Launch session
- **Project Commands**: When project selected, `fetchProjectScripts(host, project.path)` loads package.json scripts
- **Recent Launches**: Tracks project → command launches with full context

**LaunchSheet Flow** (`components/LaunchSheet.tsx`):
```typescript
// Projects filtered by selected host
const hostProjects = selectedHostId
  ? projects.filter(p => p.hostId === selectedHostId)
  : [];

// Steps:
// 1. HostStep → select host
// 2. ProjectStep → select project OR blank session
// 3. CommandStep → select command from project scripts + global snippets
// 4. Launch → createSession + sendText
```

**Session Creation:**
- **With Project**: Creates session, fetches project scripts, launches selected command
- **Blank Session**: Creates session without project context, can still use global snippets

## Conventions Discovered

### Naming
- **Files**: kebab-case (`projects-store.tsx`)
- **Components**: PascalCase (`ProjectsScreen`, `ProjectStep`)
- **Types**: PascalCase (`Project`, `ProjectDraft`)
- **Hooks**: camelCase with `use` prefix (`useProjects`)

### Patterns
| Pattern | Usage | Example |
|---------|-------|---------|
| Context Store | Client-side state management | `ProjectsProvider` + `useProjects()` |
| AsyncStorage | Mobile persistence | `tmux.projects.v1` key |
| Draft Types | Creation without ID | `ProjectDraft = Omit<Project, 'id'>` |
| Migration | Backward compatibility | Strip `customCommands` from stored data |
| Grouped Display | Organize by relationship | `projectsByHost` Map |

### Storage
- **Hosts/Preferences**: `lib/storage.ts` + `AsyncStorage`
- **Projects**: `lib/projects-store.tsx` + `AsyncStorage` (separate keys)
- **Sessions**: Server-side (not persisted locally)

## Architecture Map

```
[User] → [More Tab] → [Projects Index] → [New Project]
                           ↓                    ↓
                      [ProjectsProvider]  [DirectoryBrowser]
                           ↓                    ↓
                    [AsyncStorage]        [Host API /browse]
                           
[User] → [LaunchSheet] → [Host] → [Project] → [Command] → [Session]
              ↓
        [useProjects()]
              ↓
        [AsyncStorage]
```

## Key Files

| File | Purpose | Entry Points |
|------|---------|--------------|
| `app/projects/index.tsx` | Projects listing screen | `ProjectsScreen()` |
| `app/projects/new.tsx` | Create project form | `NewProjectScreen()` |
| `lib/projects-store.tsx` | State + persistence | `useProjects()`, `ProjectsProvider` |
| `lib/types.ts` | Type definitions | `Project`, `RecentLaunch` |
| `components/LaunchSheet.tsx` | Launch workflow | `ProjectStep()` component |
| `components/DirectoryBrowser.tsx` | Browse host filesystem | Used in new project form |

## Data Flow

### Creation Flow
```
NewProjectScreen
  → User inputs (host, name, path)
  → addProject(draft)
  → createId('project')
  → persistProjects([...projects, newProject])
  → saveProjects(nextProjects)
  → AsyncStorage.setItem('tmux.projects.v1', JSON.stringify())
  → router.back()
```

### Launch Flow
```
LaunchSheet
  → Select host
  → Filter projects by hostId
  → Select project
  → fetchProjectScripts(host, project.path)
    → GET /api/projects/scripts?path={path}
    → Parse package.json
  → Select command
  → createSession(host, name)
  → sendText(host, sessionName, command)
  → addRecentLaunch({ projectId, command, ... })
  → Navigate to session terminal
```

### Recent Launches
```
addRecentLaunch({ projectId, command })
  → Create RecentLaunch with timestamp
  → Deduplicate (same project + same command)
  → Keep MAX_RECENT_LAUNCHES (10) most recent
  → Persist to AsyncStorage ('tmux.recent-launches.v1')
```

## Integration Points

### With Hosts
- Projects require a host (`hostId` FK)
- Host selection filters available projects
- Host API used for directory browsing
- Host color scheme used in project display

### With Sessions
- Projects provide context for session creation
- Package.json scripts become launchable commands
- Project path becomes working directory
- Session inherits project context

### With Commands/Snippets
- **Project Commands**: Loaded dynamically from package.json
- **Global Snippets**: Available in all launches (project or blank)
- **Recent Launches**: Track project → command usage

### With LaunchSheet
- Projects are core to the 4-step launch wizard
- Alternative: "Blank Session" bypasses project selection
- Project scripts combined with global snippets in command selection

## API Endpoints Referenced

```bash
# Fetch project scripts (package.json)
GET /api/projects/scripts?path=/home/user/project

# Browse directories (for project path selection)
GET /api/browse?path=/home/user&host={hostId}

# Create session (uses project as context)
POST /api/sessions
{
  "name": "session-name",
  "command": "cd /project/path && npm run dev"
}
```

## Open Questions
- No project detail/edit screen found - projects appear read-only after creation
- No delete functionality visible in UI (may need swipe actions)
- No project → session history view (only recent launches tracked)
- Package.json script parsing happens server-side - format not shown
- DirectoryBrowser component implementation not explored in detail
