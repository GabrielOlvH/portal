# Plan: Multi-Device Project Synchronization

## Goal

Fix the issue where projects don't sync across devices. Currently, projects are stored in AsyncStorage on each device, meaning a project added on your phone won't appear on your tablet.

**Solution:** Move project storage to the agent/host side. Since each project is already associated with a `hostId`, store projects on the respective host. When the app connects to a host, it fetches that host's projects.

## Technical Choices

- **Storage Location**: Agent-side JSON file (`~/.config/ter/projects.json`) - Simple, persistent, no external dependencies
- **Sync Strategy**: Fetch on connect + cache locally - Projects fetched when host becomes reachable, cached in AsyncStorage for offline viewing
- **Migration**: Automatic - On first connect, push any local projects for that host to the agent

## Current State Analysis

### Local Storage (Problem)
- `lib/projects-store.tsx` - AsyncStorage with key `tmux.projects.v1`
- Each device has its own project list
- No sync mechanism exists

### Key Files:
- `lib/projects-store.tsx` - Main project state management
- `lib/api.ts` - API client functions
- `agent/src/http/routes/files.ts` - File-related routes (will add project routes here)
- `agent/src/http/app.ts` - Route registration

## Tasks

### Task 1: Add Project Routes to Agent

Add CRUD endpoints for projects on the agent side.

- [ ] Create new route file `agent/src/http/routes/projects.ts`
- [ ] Add GET `/projects` - List all projects for this host
- [ ] Add POST `/projects` - Add a new project
- [ ] Add PUT `/projects/:id` - Update a project
- [ ] Add DELETE `/projects/:id` - Remove a project
- [ ] Register routes in `agent/src/http/app.ts`

**Storage format** (`~/.config/ter/projects.json`):
```json
{
  "projects": [
    {
      "id": "project-xxx",
      "name": "My Project",
      "path": "/home/user/project",
      "iconUrl": "data:image/png;base64,..."
    }
  ]
}
```

Note: `hostId` is implicit (it's this host).

**Files to modify:**
- `agent/src/http/routes/projects.ts` (new)
- `agent/src/http/app.ts`

### Task 2: Add API Functions to App

Add client-side API functions to interact with new endpoints.

- [ ] Add `getProjects(host)` - Fetch projects from host
- [ ] Add `addProject(host, project)` - Add project to host
- [ ] Add `updateProject(host, id, updates)` - Update project on host
- [ ] Add `removeProject(host, id)` - Remove project from host

**Files to modify:**
- `lib/api.ts`

### Task 3: Update Projects Store for Hybrid Storage

Modify `projects-store.tsx` to:
1. Fetch projects from connected hosts on startup
2. Merge with local cache
3. Push local-only projects to their respective hosts
4. Keep local cache for offline access

- [ ] Add `syncProjectsWithHost(host)` function
- [ ] Modify `loadProjects()` to merge local + remote
- [ ] Modify `addProject()` to save to host (primary) and local (cache)
- [ ] Modify `updateProject()` to update on host first
- [ ] Modify `removeProject()` to remove from host first
- [ ] Add migration logic for existing local projects

**Files to modify:**
- `lib/projects-store.tsx`

### Task 4: Integrate Sync into App Lifecycle

Trigger project sync when hosts come online.

- [ ] In `HostsProvider` or relevant component, trigger sync when host status changes to "online"
- [ ] Handle offline gracefully (use cached data)
- [ ] Show sync indicator while fetching

**Files to modify:**
- `app/(tabs)/_layout.tsx` or provider component that manages host connectivity

### Task 5: Handle Edge Cases

- [ ] Conflict resolution: If same project ID exists locally and remotely with different data, prefer remote
- [ ] Duplicate detection: Warn if adding project with same path
- [ ] Offline mode: Queue changes when offline, sync when back online
- [ ] Error handling: Show toast if sync fails, don't lose local data

**Files to modify:**
- `lib/projects-store.tsx`
- Potentially add error toast component

## Success Criteria

### Automated Verification:
- [ ] Agent builds: `cd agent && pnpm build`
- [ ] App builds: `pnpm build`
- [ ] Type check: `pnpm typecheck`

### Manual Verification:
- [ ] Add project on Device A, appears on Device B after Device B connects to same host
- [ ] Delete project on Device A, disappears from Device B on next sync
- [ ] App works offline with cached projects
- [ ] Existing local projects migrate to agent on first sync

## Out of Scope

- Real-time sync (WebSocket push) - Can add later, polling/fetch-on-connect is sufficient
- Conflict resolution UI - Auto-prefer remote for now
- Project sharing between hosts - Each host has its own project list
- Snippets/preferences sync - Same approach can be applied later

## Alternative Considered

**Cloud sync (e.g., Convex, Firebase)**: Would require external infrastructure, user accounts, more complexity. Host-side storage is simpler and keeps data local to the user's network.
