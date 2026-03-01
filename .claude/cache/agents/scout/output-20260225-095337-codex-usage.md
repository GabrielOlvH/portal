# Codebase Report: Codex Bar / AI Usage Tracking
Generated: 2026-02-25T09:53:37

## Summary

"Portal" is a React Native (Expo) mobile app that lets you control remote Linux/macOS servers from your phone. It has a tmux-agent Node.js backend that runs on each server. The project includes a full Linux port of "Codex Bar" functionality — a live dashboard of AI tool usage (rate limits, token counts, credits remaining) for Claude Code, OpenAI Codex, GitHub Copilot, Cursor, and Kimi Code, displayed as compact ring-chart cards in the app's main Sessions tab.

## Project Structure

```
portal/
  app/                        # Expo Router screens
    (tabs)/
      index.tsx               # Sessions tab — hosts usage cards + session list
      more.tsx                # Settings tab — configure usage card visibility
      hosts.tsx               # Host management
      projects.tsx            # Projects tab
    hosts/[id]/               # Per-host views (docker, files, etc.)
  components/
    CompactUsageCard.tsx      # The "Codex Bar" UI — ring chart cards
    LaunchSheet.tsx           # Bottom sheet for launching sessions/agents
    SessionCard.tsx           # Per-session card
    HostCard.tsx              # Per-host card
  lib/
    api.ts                    # Frontend API client (calls agent REST API)
    types.ts                  # Shared TypeScript types
    store.ts                  # Zustand store (hosts, preferences, usage visibility)
  agent/                      # Node.js backend (runs on each Linux server)
    src/
      codex.ts                # OpenAI Codex usage fetcher
      claude.ts               # Claude Code usage fetcher
      cursor.ts               # Cursor usage fetcher
      kimi.ts                 # Kimi Code usage fetcher
      copilot.ts              # GitHub Copilot usage fetcher
      usage.ts                # Orchestrates all providers, exposes snapshot
      state.ts                # Shared in-memory caches
      binaries.ts             # Binary resolver (finds codex/claude on PATH)
      agents.ts               # Session-level agent detection (which tool is running)
      http/
        app.ts                # Hono app — route registration
        routes/core.ts        # GET /usage endpoint
        routes/sessions.ts    # GET /sessions endpoint
        ws.ts                 # WebSocket terminal bridge
      service/
        manager.ts            # systemd service management
        health.ts             # Health check
        updater.ts            # Auto-updater
```

## Questions Answered

### Q1: Where is "Codex Bar" implemented?

The UI component is `/home/gabriel/Projects/Personal/portal/components/CompactUsageCard.tsx`.

It renders a compact 40x40px circular ring chart (SVG DoubleRing) with a provider icon overlaid. An outer ring shows weekly quota remaining; the inner ring shows session quota remaining. Colors go green → orange → red as quota depletes. Tapping shows a tooltip with exact percentages and reset countdown.

This is the mobile-native equivalent of "Codex Bar" — a persistent status strip of AI tool usage.

### Q2: Which AI tools are tracked?

Five providers, all in `/home/gabriel/Projects/Personal/portal/agent/src/`:

| Provider | File | Auth Method | Data Source |
|----------|------|-------------|-------------|
| OpenAI Codex | `codex.ts` | None (local CLI) | Codex CLI RPC (`app-server` MCP protocol) or PTY (`/status` command) + `~/.codex/sessions/*.jsonl` |
| Claude Code | `claude.ts` | OAuth (`~/.claude/.credentials.json`) | Anthropic OAuth API + `~/.claude/projects/**/*.jsonl` |
| GitHub Copilot | `copilot.ts` | OAuth (stored via agent) | GitHub Copilot API |
| Cursor | `cursor.ts` | Cookie or access token | `https://cursor.com/api/usage-summary` |
| Kimi Code | `kimi.ts` | `KIMI_AUTH_TOKEN` env var | Kimi API |

### Q3: How is usage data collected?

**Backend data pipeline** (`agent/src/usage.ts`):

```
getUsageSnapshot()           ← called by GET /usage
  └── buildUsageSnapshot()
        ├── getCodexStatus()    → codex.ts: RPC → PTY fallback
        ├── getClaudeStatus()   → claude.ts: OAuth API
        ├── getCopilotStatus()  → copilot.ts: OAuth API
        ├── getCursorStatus()   → cursor.ts: cookie/token → cursor.com API
        └── getKimiStatus()     → kimi.ts: KIMI_AUTH_TOKEN → Kimi API
```

Cache strategy:
- Usage snapshot: 30-second TTL, served stale while refreshing
- Token counts (input/output/cached): 60-second TTL from JSONL logs
- OAuth caches: 60-second TTL per provider

**Codex-specific**: Two-path strategy:
1. Primary: Spawn `codex app-server` as MCP JSON-RPC server, call `account/rateLimits/read` method (returns `primary`/`secondary` windows with `usedPercent` + `resetsAt`)
2. Fallback: Run `codex -s read-only -a untrusted`, send `/status\n` to PTY, parse ANSI-stripped output for "5h", "week", percentage patterns

**Token usage from logs**:
- Codex: `~/.codex/sessions/YYYY/MM/DD/*.jsonl` → extracts `info.total_token_usage` or `info.last_token_usage`
- Claude: `~/.claude/projects/**/*.jsonl` → similar JSONL log scan

### Q4: How is usage data displayed?

**API endpoint**: `GET /usage` → `getUsageSnapshot()` → returns `UsageSnapshot`:
```typescript
{
  codex: { session: { percentLeft, reset }, weekly: { percentLeft, reset }, tokens, credits },
  claude: { session, weekly, tokens },
  copilot: { session, weekly },
  cursor: { session },
  kimi: { session, weekly },
  meta: { lastPolled, refreshing, error }
}
```

**Frontend flow** (`app/(tabs)/index.tsx`):
1. `refreshUsage()` calls `getUsage(host)` for every configured host
2. Aggregates across all hosts (takes most-recently-polled value per provider with valid `percentLeft`)
3. Passes `aggregatedUsage` and `usageVisibility` to the StatusBar/header area
4. Renders a `<CompactUsageCard>` per enabled provider

**CompactUsageCard** (`components/CompactUsageCard.tsx`):
- Outer SVG ring = weekly quota (provider brand color)
- Inner SVG ring = session quota (green/orange/red urgency color)
- Provider icon centered in rings
- Tap: spring-scale animation + Modal tooltip showing exact % + reset countdown

**Settings** (`app/(tabs)/more.tsx`):
- "Usage Cards" section with toggles for each provider
- Shows live detection status (Ready / error message)
- Controlled by `preferences.usageCards` in Zustand store

## Architecture Map

```
Mobile App (React Native/Expo)
         │
         │ HTTP REST (GET /usage, GET /sessions, etc.)
         │ WebSocket (terminal I/O)
         ▼
   tmux-agent (Hono HTTP server, port 4020)
         │
         ├── GET /usage
         │     └── usage.ts: buildUsageSnapshot()
         │           ├── codex.ts: RPC or PTY + JSONL logs
         │           ├── claude.ts: OAuth API + JSONL logs
         │           ├── cursor.ts: cursor.com API
         │           ├── copilot.ts: GitHub OAuth API
         │           └── kimi.ts: Kimi API
         │
         ├── GET /sessions (+ tmux list-panes introspection)
         │     └── agents.ts: detects which AI tool is in each tmux pane
         │
         └── WS /ws?session=<name>
               └── PTY bridge to tmux pane
```

## Key Files

| File | Purpose |
|------|---------|
| `components/CompactUsageCard.tsx` | Ring-chart UI card (the "Codex Bar" equivalent) |
| `agent/src/codex.ts` | Codex CLI RPC + PTY scraping + JSONL log parsing |
| `agent/src/claude.ts` | Claude OAuth API + JSONL log parsing |
| `agent/src/cursor.ts` | Cursor auth resolution + usage API |
| `agent/src/kimi.ts` | Kimi usage via KIMI_AUTH_TOKEN env var |
| `agent/src/usage.ts` | Provider orchestration, caching, snapshot |
| `agent/src/state.ts` | Shared types: UsageSnapshot, ProviderUsage, TokenUsage |
| `agent/src/binaries.ts` | Finds `codex`/`claude` binaries on PATH |
| `agent/src/agents.ts` | Per-session AI tool detection via `ps`/`pgrep` |
| `agent/src/http/routes/core.ts` | `GET /usage` HTTP endpoint |
| `app/(tabs)/index.tsx` | Sessions tab — aggregates + renders usage cards |
| `app/(tabs)/more.tsx` | Settings — toggles per-provider card visibility |
| `lib/types.ts` | ProviderUsage, UsageSnapshot, UsageCardsVisibility types |
| `lib/api.ts` | `getUsage(host)` frontend API function |
