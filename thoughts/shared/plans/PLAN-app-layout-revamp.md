# Plan: App Layout Revamp - Projects Tab & Docker Integration

## Goal

Revamp the app layout to:
1. Move Docker functionality into host detail pages (already partially exists)
2. Replace the Docker tab with a new Projects tab
3. Improve the Projects page for easy launch, resume recent sessions, and view open sessions

## Technical Choices

- **Tab Structure**: Keep 4 tabs but replace Docker → Projects
- **Docker Access**: Via host detail page header (already has "Docker" link)
- **Projects Tab Design**: Multi-section layout with Recent Launches, Open Sessions, and Projects list
- **State Management**: Leverage existing `useProjects()` context + AI sessions query

## Current State Analysis

### Tab Structure (`app/(tabs)/_layout.tsx`)
- 4 tabs: Sessions, Hosts, **Docker**, More
- Using expo-router native tabs

### Docker Tab (`app/(tabs)/docker.tsx`)
- Shows ALL containers across ALL hosts grouped by compose project
- Has filtering by hostId query param
- Container actions (start/stop) and navigation to detail

### Host Detail Page (`app/hosts/[id]/index.tsx`)
- Already has "Docker" link in header that navigates to Docker tab with hostId filter
- Shows sessions, host info, service status
- Docker container detail routes already exist at `app/hosts/[id]/docker/[containerId]/`

### Projects Screen (`app/projects/index.tsx`)
- Groups projects by host
- Shows AI session counts per project
- Navigates to AI sessions filtered by project path
- Simple list view - no launch actions

### AI Sessions Screen (`app/ai-sessions/index.tsx`)
- Lists Claude, Codex, OpenCode sessions
- Search and filter capability
- Resume functionality

### Key Files:
- `app/(tabs)/_layout.tsx` - Tab configuration
- `app/(tabs)/docker.tsx` - Docker tab to be removed
- `app/(tabs)/more.tsx` - "More" tab with Projects menu item
- `app/projects/index.tsx` - Projects screen to be enhanced
- `app/ai-sessions/index.tsx` - AI sessions (for integration)
- `app/hosts/[id]/index.tsx` - Host detail (for Docker integration)
- `lib/projects-store.tsx` - Projects context with RecentLaunch
- `lib/docker-hooks.ts` - Docker hooks (useAllDocker, useDocker)

## Tasks

### Task 1: Update Tab Configuration
Replace Docker tab with Projects tab in the tab bar.

- [ ] Update `app/(tabs)/_layout.tsx` to replace Docker trigger with Projects
- [ ] Change icon from shippingbox to folder/briefcase icon
- [ ] Change label from "Docker" to "Projects"

**Files to modify:**
- `app/(tabs)/_layout.tsx`

### Task 2: Rename Docker Tab File to Projects
Move the docker.tsx tab file and create the new projects tab.

- [ ] Delete `app/(tabs)/docker.tsx` (no longer needed as a tab)
- [ ] Create new `app/(tabs)/projects.tsx` with the enhanced Projects layout

**Files to modify:**
- `app/(tabs)/docker.tsx` (delete)
- `app/(tabs)/projects.tsx` (create)

### Task 3: Enhance Host Detail Page with Docker Section
Add a Docker containers section directly on the host detail page.

- [ ] Add collapsible Docker section to host detail page
- [ ] Use `useDocker(host)` hook to fetch containers for that host
- [ ] Show container list with quick actions (start/stop)
- [ ] Keep navigation to full container detail pages
- [ ] Remove "Docker" header link (no longer needed - content is inline)

**Files to modify:**
- `app/hosts/[id]/index.tsx`

### Task 4: Build New Projects Tab with Three Sections
Create the new Projects tab with rich functionality.

- [ ] **Section 1: Recent Launches** - Show last 5 recent launches from `useProjects().recentLaunches`
  - Quick re-launch button
  - Project name, host, command preview
  - Timestamp
- [ ] **Section 2: Open Sessions** - Show running tmux sessions across all hosts
  - Use existing `useHostsLive()` hook
  - Filter to sessions with AI agents running (optional)
  - Quick attach button
- [ ] **Section 3: Projects List** - Enhanced project cards
  - Show AI session count badge
  - Quick launch button (opens LaunchSheet)
  - Project path
  - Host color indicator

**Files to modify:**
- `app/(tabs)/projects.tsx` (create)

### Task 5: Update More Tab Navigation
Remove Projects from More tab since it's now a main tab.

- [ ] Remove "Projects" MenuItem from More tab
- [ ] Keep "AI Sessions" in More tab for full session browsing
- [ ] Consider moving Snippets under Projects if needed

**Files to modify:**
- `app/(tabs)/more.tsx`

### Task 6: Add Quick Launch Actions to Project Cards
Enable launching directly from project cards.

- [ ] Add launch button to project cards in Projects tab
- [ ] Integrate with `useLaunchSheet()` hook
- [ ] Pre-select project when opening LaunchSheet

**Files to modify:**
- `app/(tabs)/projects.tsx`
- Possibly `components/LaunchSheet.tsx` (to accept pre-selected project)

### Task 7: Update Navigation References
Update any hardcoded references to the Docker tab.

- [ ] Search for `/docker` or `(tabs)/docker` references
- [ ] Update host detail page Docker link to navigate to inline section (or remove)
- [ ] Update any deep links

**Files to modify:**
- `app/hosts/[id]/index.tsx` (Docker link)
- Any other files with Docker tab references

## Success Criteria

### Automated Verification:
- [ ] TypeScript check: `pnpm typecheck`
- [ ] Lint check: `pnpm lint`
- [ ] Build check: `npx expo export --platform ios` (or web)

### Manual Verification:
- [ ] Projects tab appears in bottom navigation with correct icon
- [ ] Docker containers appear on host detail pages
- [ ] Recent launches show correctly and can be re-launched
- [ ] Open sessions show with attach functionality
- [ ] Projects list shows with launch capability
- [ ] Docker tab no longer exists
- [ ] Navigation from host detail to Docker container detail still works

## Out of Scope
- Redesigning the AI Sessions screen itself
- Adding new Docker features (images, volumes, networks)
- Changing the host detail page layout significantly beyond Docker section
- Multi-host Docker aggregation (now per-host only on detail pages)

## Risks (Pre-Mortem)

### Tigers:
- **Breaking Docker container navigation** (HIGH)
  - Container detail pages at `app/hosts/[id]/docker/[containerId]/` must remain accessible
  - Mitigation: Test navigation from host detail Docker section to container detail

- **Recent launches empty state** (MEDIUM)
  - If user has no recent launches, section looks empty
  - Mitigation: Add helpful empty state with "Launch your first session" CTA

### Elephants:
- **User expectation mismatch** (MEDIUM)
  - Users may expect Docker tab for quick cross-host container overview
  - Note: Consider adding "All Containers" link somewhere if feedback indicates need
