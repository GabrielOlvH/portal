# Task 3: API Client Functions - COMPLETE

## Summary

Added API client functions to `lib/api.ts` for fetching and managing AI sessions from the agent.

## Changes Made

### `/home/gabrielolv/Documents/Projects/ter/lib/api.ts`

1. **Updated imports** - Added `AiProvider`, `AiSessionDetail`, `AiSessionListResponse` from `@/lib/types`

2. **Added `AiSessionsOptions` type** - Options for filtering and pagination:
   ```typescript
   export type AiSessionsOptions = {
     provider?: AiProvider;
     limit?: number;
     offset?: number;
     refresh?: boolean;
   };
   ```

3. **Added `getAiSessions()` function** - Fetches paginated list of AI sessions:
   ```typescript
   export async function getAiSessions(
     host: Host,
     options?: AiSessionsOptions
   ): Promise<AiSessionListResponse>
   ```
   - Supports filtering by provider
   - Supports pagination with limit/offset
   - Supports refresh flag to bypass cache

4. **Added `getAiSessionDetail()` function** - Fetches detailed session info with messages:
   ```typescript
   export async function getAiSessionDetail(
     host: Host,
     provider: AiProvider,
     id: string
   ): Promise<AiSessionDetail>
   ```
   - Returns session info plus last 50 messages
   - Properly encodes provider and id in URL path

5. **Added `resumeAiSession()` function** - Resumes an AI session in a new tmux session:
   ```typescript
   export async function resumeAiSession(
     host: Host,
     provider: AiProvider,
     id: string
   ): Promise<void>
   ```
   - Creates a new tmux session named `{provider}-{id_prefix}`
   - Runs provider-specific resume command:
     - Claude: `claude --resume {id}`
     - Codex: `codex --resume {id}`
     - OpenCode: `opencode --resume {id}`

## API Endpoints Used

| Function | Endpoint | Method |
|----------|----------|--------|
| `getAiSessions` | `/ai-sessions?limit=&offset=&provider=&refresh=` | GET |
| `getAiSessionDetail` | `/ai-sessions/:provider/:id` | GET |
| `resumeAiSession` | `/sessions` | POST |

## Verification

- TypeScript typecheck passes for `lib/api.ts` (no errors)
- Pre-existing errors in other files are unrelated to this task

## Dependencies

- Task 1: Types in `lib/types.ts` (AiProvider, AiSession, AiSessionDetail, AiSessionListResponse)
- Task 2: Agent routes in `agent/src/http/routes/ai-sessions.ts`

## Next Task

Task 4 can now implement the React Native screen/component that uses these API functions to display AI sessions.
