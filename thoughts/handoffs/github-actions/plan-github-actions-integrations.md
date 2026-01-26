---
date: 2026-01-23T12:30:00Z
type: plan
status: complete
plan_file: thoughts/shared/plans/PLAN-github-actions-integrations.md
---

# Plan Handoff: GitHub Actions Management Feature

## Summary
Created a 7-task plan to add GitHub Actions management to the Portal app - view workflow runs, re-run failed jobs, cancel in-progress runs, all from your phone.

## Plan Created
`thoughts/shared/plans/PLAN-github-actions-integrations.md`

## Key Technical Decisions
- **PAT Authentication**: Using GitHub Personal Access Token (simpler than GitHub App)
- **Direct API calls**: GitHub API called from app, not through agent
- **expo-secure-store**: Recommended for token storage (more secure than AsyncStorage)
- **React Query**: For caching and automatic refetching

## Task Overview
1. **GitHub API Client** - `lib/github.ts` with typed endpoints
2. **Store Extension** - Add GitHub token + repos to app preferences
3. **Actions List Screen** - Main view showing runs across repos
4. **Run Detail Screen** - Job details, re-run/cancel buttons
5. **Settings Screen** - Token input, repo configuration
6. **More Tab Entry** - Menu item to access the feature
7. **Status Components** - Reusable WorkflowRunCard, StatusBadge

## Research Findings
- App already uses **MenuItem/Card** pattern in More tab (line 285-324)
- **Copilot integration** provides reference for GitHub auth UX
- **React Query** already integrated for data fetching
- GitHub API requires `Authorization: Bearer {token}` header
- API version header: `X-GitHub-Api-Version: 2022-11-28`

## Assumptions Made
- User will create their own GitHub PAT (not OAuth flow)
- Initial version won't have push notifications for run completion
- Logs viewing is out of scope (large files, complex streaming)

## API Endpoints
| Action | Endpoint |
|--------|----------|
| List runs | `GET /repos/{owner}/{repo}/actions/runs` |
| Get run | `GET /repos/{owner}/{repo}/actions/runs/{run_id}` |
| Re-run | `POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun` |
| Cancel | `POST /repos/{owner}/{repo}/actions/runs/{run_id}/cancel` |

## For Next Steps
- User should review plan at: `thoughts/shared/plans/PLAN-github-actions-integrations.md`
- After approval, run `/implement_plan thoughts/shared/plans/PLAN-github-actions-integrations.md`
- User needs to generate a GitHub PAT with `repo` scope to test

## Sources
- [GitHub REST API - Workflow Runs](https://docs.github.com/en/rest/actions/workflow-runs)
- [GitHub REST API - Workflows](https://docs.github.com/en/rest/actions/workflows)
