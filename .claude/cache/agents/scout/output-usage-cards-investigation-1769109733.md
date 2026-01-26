# Codebase Report: Usage Cards Disappearing with Multiple Hosts
Generated: 2026-01-22

## Summary
The usage cards on the main page stop appearing after adding a second host. Investigation reveals the issue is related to how usage data is aggregated from multiple hosts and the conditions for displaying cards.

## Root Cause Analysis

### 1. Where Usage Cards Are Rendered
**Location:** `/home/gabrielolv/Documents/Projects/ter/app/(tabs)/index.tsx`

**Entry Point:** Lines 445-459
```typescript
{hasUsageCards && (
  <FadeIn>
    <View style={styles.usageCardsRow}>
      {usageVisibility.claude && aggregatedUsage.claude && (
        <CompactUsageCard provider="claude" usage={aggregatedUsage.claude} />
      )}
      {usageVisibility.codex && aggregatedUsage.codex && (
        <CompactUsageCard provider="codex" usage={aggregatedUsage.codex} />
      )}
      {usageVisibility.copilot && aggregatedUsage.copilot && (
        <CompactUsageCard provider="copilot" usage={aggregatedUsage.copilot} />
      )}
    </View>
  </FadeIn>
)}
```

### 2. Display Condition Logic
**Lines 275-279:**
```typescript
const usageVisibility = preferences.usageCards;
const hasUsageCards =
  (usageVisibility.claude && aggregatedUsage.claude) ||
  (usageVisibility.codex && aggregatedUsage.codex) ||
  (usageVisibility.copilot && aggregatedUsage.copilot);
```

The entire usage cards section is hidden if `hasUsageCards` is false, which happens when:
- User preferences have cards disabled, OR
- `aggregatedUsage` for all providers is falsy

### 3. Usage Data Aggregation
**Lines 238-273:**
```typescript
const aggregatedUsage = useMemo(() => {
  let claude: ProviderUsage | null = null;
  let codex: ProviderUsage | null = null;
  let copilot: ProviderUsage | null = null;
  let claudePolled = 0;
  let codexPolled = 0;
  let copilotPolled = 0;

  const allInsights: SessionInsights[] = [];
  
  // Collect insights from sessions
  sessions.forEach((session) => {
    if (session.insights) allInsights.push(session.insights);
  });
  
  // Collect insights from hostUsageMap
  const hostIds = new Set(hosts.map((host) => host.id));
  Object.entries(hostUsageMap).forEach(([hostId, usage]) => {
    if (hostIds.has(hostId)) allInsights.push(usage);
  });

  // Take the most recent usage per provider
  allInsights.forEach((insights) => {
    const polled = insights.meta?.lastPolled ?? 0;

    if (insights.claude && polled > claudePolled) {
      claude = insights.claude;
      claudePolled = polled;
    }
    if (insights.codex && polled > codexPolled) {
      codex = insights.codex;
      codexPolled = polled;
    }
    if (insights.copilot && polled > copilotPolled) {
      copilot = insights.copilot;
      copilotPolled = polled;
    }
  });

  return { claude, codex, copilot };
}, [hosts, sessions, hostUsageMap]);
```

**Key Issue:** The aggregation logic selects usage based on `meta.lastPolled` timestamp. If:
1. Second host returns usage with `lastPolled = 0` or undefined
2. First host had valid usage but is now offline
3. New host's usage overwrites with empty/null values

### 4. Usage Data Fetching
**Lines 281-309:**
```typescript
const refreshUsage = useCallback(async () => {
  if (hosts.length === 0) {
    setHostUsageMap({});
    return;
  }

  const results = await Promise.all(
    hosts.map(async (host) => {
      try {
        const usage = await getUsage(host);
        return { id: host.id, usage };
      } catch {
        return { id: host.id, usage: null };
      }
    })
  );

  setHostUsageMap((prev) => {
    const hostIds = new Set(hosts.map((host) => host.id));
    const next: Record<string, SessionInsights> = {};
    
    // Preserve existing entries for current hosts
    Object.keys(prev).forEach((id) => {
      if (hostIds.has(id)) next[id] = prev[id];
    });
    
    // Update with new results
    results.forEach(({ id, usage }) => {
      if (usage) next[id] = usage;
    });
    
    return next;
  });
}, [hosts]);
```

**API Endpoint:** `lib/api.ts:189-191`
```typescript
export async function getUsage(host: Host): Promise<SessionInsights> {
  return request(host, '/usage', { method: 'GET' }, 12000);
}
```

### 5. Fallback Logic
**Lines 311-323:**
```typescript
const needsUsageFallback = useMemo(() => {
  if (hosts.length === 0) return false;
  return (
    (usageVisibility.claude && !aggregatedUsage.claude) ||
    (usageVisibility.codex && !aggregatedUsage.codex) ||
    (usageVisibility.copilot && !aggregatedUsage.copilot)
  );
}, [hosts.length, usageVisibility, aggregatedUsage]);

useEffect(() => {
  if (!needsUsageFallback || !isFocused) return;
  void refreshUsage();
}, [needsUsageFallback, refreshUsage, isFocused]);
```

This triggers `refreshUsage()` when expected usage is missing.

### 6. CompactUsageCard Early Return
**Lines 65-73:**
```typescript
function CompactUsageCard({ provider, usage }: CompactUsageCardProps) {
  const { colors } = useTheme();
  const sessionLeft = usage.session?.percentLeft;
  const weeklyLeft = usage.weekly?.percentLeft;
  const color = providerColors[provider];
  const hasWeekly = provider !== 'copilot' && weeklyLeft != null;
  const isWeeklyExhausted = hasWeekly && weeklyLeft <= 0;

  if (sessionLeft == null) return null;  // ← CRITICAL CHECK
  
  // ... render card
}
```

**If `usage.session?.percentLeft` is null/undefined, the card renders nothing.**

## Potential Root Causes

### Theory 1: Empty Usage Response
When a second host is added and doesn't have session data yet:
1. `/usage` endpoint returns `{ claude: {}, codex: {}, copilot: {} }` with no `session` field
2. These empty objects have `meta.lastPolled = 0` or current timestamp
3. Aggregation logic picks the newer timestamp (second host)
4. But the usage object lacks `session.percentLeft`
5. `CompactUsageCard` returns null
6. All cards disappear

### Theory 2: Session-Based vs Host-Based Usage
The code collects usage from two sources:
1. **Session insights** - attached to individual sessions
2. **Host usage map** - fetched via `/usage` endpoint

When second host has no active sessions:
- No session insights available
- Host usage endpoint might return incomplete data
- Aggregation picks incomplete data over old complete data

### Theory 3: Error State Not Properly Displayed
If second host returns usage with `error` field:
```typescript
{ claude: { error: 'loading' }, codex: { error: 'loading' }, ... }
```
The object is truthy but lacks `session.percentLeft`, causing silent failure.

## Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `app/(tabs)/index.tsx` | Main page with usage cards | 238-279, 445-459 |
| `app/(tabs)/index.tsx` | CompactUsageCard component | 65-120 |
| `lib/api.ts` | getUsage API call | 189-191 |
| `agent/src/http/routes/core.ts` | /usage endpoint | 32-39 |
| `agent/src/usage.ts` | getUsageSnapshot | 140-161 |
| `lib/types.ts` | ProviderUsage type | 153-160 |
| `lib/types.ts` | SessionInsights type | 171-178 |

## Type Definitions

```typescript
export type ProviderUsage = {
  session?: UsageWindow;      // ← Required for card display
  weekly?: UsageWindow;
  tokens?: TokenUsage;
  source?: string;
  error?: string;              // ← Present when loading/error
  credits?: number;
};

export type UsageWindow = {
  percentLeft?: number;        // ← Required for CompactUsageCard
  reset?: string;
};

export type SessionInsights = {
  codex?: ProviderUsage;
  claude?: ProviderUsage;
  copilot?: ProviderUsage;
  cursor?: ProviderUsage;
  git?: GitStatus;
  meta?: InsightsMeta;
};

export type InsightsMeta = {
  lastPolled?: number;         // ← Used for aggregation priority
  lastAttempt?: number;
  refreshing?: boolean;
  error?: string;
  activeAgent?: 'codex' | 'claude' | null;
  agentState?: 'running' | 'idle' | 'stopped';
  agentCommand?: string | null;
};
```

## Debugging Steps

1. **Check what second host returns:**
   - Add logging in `refreshUsage` to see what `/usage` endpoint returns
   - Check if `usage.claude.session` exists
   - Check if `meta.lastPolled` is present

2. **Verify aggregation logic:**
   - Log `allInsights` array before aggregation
   - Check if newer timestamp is overwriting valid data with empty data

3. **Check error states:**
   - See if usage objects have `error` field set
   - Verify `CompactUsageCard` doesn't handle error states

4. **Test with explicit data:**
   - Temporarily hardcode usage data to confirm rendering works
   - Isolate whether issue is fetching or rendering

## Questions to Answer

1. **Does the second host's agent return valid usage data?**
   - Is the agent running?
   - Does `/usage` endpoint work on second host?
   - Are provider tokens configured on second host?

2. **Is the timestamp comparison working correctly?**
   - Does new host return `meta.lastPolled = 0`?
   - Should the code prefer existing valid data over newer empty data?

3. **Should aggregation be smarter?**
   - Should it prefer data with `session.percentLeft` present?
   - Should it merge from multiple hosts rather than pick one?

4. **Is this a race condition?**
   - Does second host's data arrive before it's fully initialized?
   - Should there be a loading state?

## Recommended Fix Areas

1. **Improve aggregation logic** (lines 238-273)
   - Prefer usage objects with actual session data
   - Don't overwrite valid data with empty objects
   - Check for `session.percentLeft` existence, not just timestamp

2. **Add error state display** (CompactUsageCard)
   - Show "loading" or "unavailable" instead of hiding
   - Distinguish between no-data and loading

3. **Better handling of loading states** (agent/src/usage.ts:154-159)
   - Current code returns `{ error: 'loading' }` objects
   - These should be filtered out during aggregation

4. **Add debugging/logging**
   - Log when cards disappear
   - Track which host's data is being used
   - Show data source in UI (dev mode)

## Critical Code Paths

```
User sees main page
  ↓
useHostsLive fetches session data (lines 200-205)
  ↓
Sessions get .insights attached (lines 208-223)
  ↓
refreshUsage fetches /usage for each host (lines 281-309)
  ↓
hostUsageMap populated with results
  ↓
aggregatedUsage computed (lines 238-273)
  - Collects from sessions AND hostUsageMap
  - Picks newest by meta.lastPolled
  ↓
hasUsageCards = any provider has data (lines 276-279)
  ↓
Render cards if hasUsageCards (lines 445-459)
  ↓
CompactUsageCard checks usage.session?.percentLeft (line 73)
  - Returns null if missing
```

## Next Steps

1. Add logging to see what data second host returns
2. Check if `meta.lastPolled` is causing valid data to be discarded
3. Modify aggregation to prefer complete data over incomplete
4. Add explicit handling for loading/error states
