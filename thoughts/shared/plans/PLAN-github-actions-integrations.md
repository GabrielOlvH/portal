# Plan: GitHub Actions Management Feature

## Goal
Add a GitHub Actions management feature to the Portal app that allows users to:
- View workflow runs across configured repositories
- See run status, duration, and triggering info
- Re-run failed workflows
- Cancel in-progress workflows
- View job details and logs

## Technical Choices
- **Authentication**: GitHub Personal Access Token (PAT) stored in AsyncStorage
- **API Client**: Direct fetch to GitHub REST API (not through agent)
- **State Management**: React Query for caching and refetching
- **Token Scope**: `repo` (for private repos) or `public_repo` (for public only)

## Current State Analysis

### Existing Patterns to Follow
- **MenuItem/Card** pattern from `app/(tabs)/more.tsx` for navigation
- **React Query** already used throughout the app
- **AsyncStorage** for persistent storage (see `lib/store.tsx`)
- **Copilot integration** as reference for GitHub auth UX

### Key Files
- `lib/api.ts` - API utilities (won't use directly - GitHub API is external)
- `lib/types.ts` - Type definitions
- `lib/store.tsx` - App preferences and storage
- `app/(tabs)/more.tsx` - Where to add menu item (line 316 area)

### Navigation Structure
```
More Tab
├── Projects
├── Snippets
├── AI Sessions
├── CLI Sync
├── Ports
└── GitHub Actions  ← NEW
```

## Tasks

### Task 1: Create GitHub API Client
Create a dedicated GitHub API client for Actions endpoints.

- [ ] Create `lib/github.ts` with API client
- [ ] Implement token storage/retrieval from AsyncStorage
- [ ] Add endpoints: listWorkflowRuns, getWorkflowRun, rerunWorkflow, cancelWorkflow
- [ ] Add types for GitHub API responses

**Files to create:**
- `lib/github.ts`

**Types needed:**
```typescript
type GitHubRepo = { owner: string; repo: string; name?: string };
type WorkflowRun = {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  head_branch: string;
  head_sha: string;
  created_at: string;
  updated_at: string;
  actor: { login: string; avatar_url: string };
};
```

### Task 2: Add GitHub Settings to Store
Extend app preferences to store GitHub token and configured repositories.

- [ ] Add `githubToken` to preferences
- [ ] Add `githubRepos` array to preferences
- [ ] Add update functions for GitHub settings
- [ ] Add storage key `tmux.github.v1`

**Files to modify:**
- `lib/store.tsx`
- `lib/types.ts`

### Task 3: Create GitHub Actions List Screen
Main screen showing workflow runs across all configured repos.

- [ ] Create `app/github/index.tsx` (list view)
- [ ] Show runs grouped by repository
- [ ] Status indicators (success=green, failure=red, in_progress=yellow, queued=gray)
- [ ] Pull-to-refresh with React Query
- [ ] Filter by status (all, in_progress, completed, failed)
- [ ] Empty state when no repos configured

**Files to create:**
- `app/github/index.tsx`

### Task 4: Create Workflow Run Detail Screen
Detail view for a specific workflow run.

- [ ] Create `app/github/[owner]/[repo]/runs/[runId].tsx`
- [ ] Show run info: branch, commit, trigger, duration
- [ ] List jobs with status
- [ ] Re-run button (for completed runs)
- [ ] Cancel button (for in_progress runs)
- [ ] Link to view on GitHub

**Files to create:**
- `app/github/[owner]/[repo]/runs/[runId].tsx`

### Task 5: Create GitHub Settings Screen
Settings screen for token and repository configuration.

- [ ] Create `app/github/settings.tsx`
- [ ] Token input with secure storage
- [ ] Token validation (test API call)
- [ ] Add/remove repositories
- [ ] Repository search/autocomplete (optional)

**Files to create:**
- `app/github/settings.tsx`

### Task 6: Add Menu Item to More Tab
Add GitHub Actions entry point in the More tab.

- [ ] Add MenuItem for "GitHub Actions"
- [ ] Show connection status (configured repos count or "Not configured")
- [ ] Navigate to `/github`

**Files to modify:**
- `app/(tabs)/more.tsx`

### Task 7: Create Status Components
Reusable components for workflow status display.

- [ ] Create `components/github/WorkflowRunCard.tsx`
- [ ] Create `components/github/StatusBadge.tsx`
- [ ] Follow existing Card/AppText patterns

**Files to create:**
- `components/github/WorkflowRunCard.tsx`
- `components/github/StatusBadge.tsx`

## Success Criteria

### Automated Verification:
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] App builds: `npx expo prebuild --clean`

### Manual Verification:
- [ ] Can add GitHub PAT in settings
- [ ] Can add repositories to monitor
- [ ] Workflow runs load and display correctly
- [ ] Status colors are correct (green/red/yellow/gray)
- [ ] Can re-run a failed workflow
- [ ] Can cancel an in-progress workflow
- [ ] Pull-to-refresh works

## API Reference

### Endpoints Used
| Action | Method | Endpoint |
|--------|--------|----------|
| List runs | GET | `/repos/{owner}/{repo}/actions/runs` |
| Get run | GET | `/repos/{owner}/{repo}/actions/runs/{run_id}` |
| Re-run | POST | `/repos/{owner}/{repo}/actions/runs/{run_id}/rerun` |
| Cancel | POST | `/repos/{owner}/{repo}/actions/runs/{run_id}/cancel` |
| List jobs | GET | `/repos/{owner}/{repo}/actions/runs/{run_id}/jobs` |

### Required Headers
```
Authorization: Bearer {token}
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
```

## Risks (Pre-Mortem)

### Tigers:
- **Token security** (HIGH)
  - PAT stored in AsyncStorage (not Keychain/Keystore)
  - Mitigation: Use expo-secure-store for sensitive data instead
  - Consider: Token can be revoked if compromised

- **Rate limiting** (MEDIUM)
  - GitHub API: 5000 req/hour for authenticated requests
  - Mitigation: Use React Query caching, reasonable staleTime

### Elephants:
- **No push notifications for run completion** (MEDIUM)
  - Would require backend/webhook setup
  - Note: Out of scope for initial implementation

## Out of Scope
- Webhook integration for real-time updates
- Viewing workflow logs (would require streaming large files)
- Creating/editing workflows
- GitHub App authentication (using PAT instead)
- Secrets management
- Self-hosted runner management
