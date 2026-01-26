# Codebase Exploration: AI Sessions Feature Planning
Generated: 2026-01-21

## Summary
This React Native/Expo app ("Portal") manages tmux sessions, Docker containers, and ports on remote hosts. It uses Expo Router for navigation, AsyncStorage for persistence, React Context for state management, and TanStack Query for server data. The app follows clear patterns for list management, API communication, and UI components that can be applied to a new AI Sessions feature.

## Project Structure

```
app/
  (tabs)/              # Bottom tab navigation
    _layout.tsx        # Tab bar configuration (Sessions, Hosts, Docker, More)
    index.tsx          # Sessions tab - shows tmux sessions grouped by host
    hosts.tsx          # Hosts tab - manages remote host connections
    docker.tsx         # Docker tab
    more.tsx           # More/settings tab
  session/[hostId]/[name]/   # Session detail screens
    terminal.tsx       # Terminal WebView for tmux sessions
    index.tsx          # Session info/actions
  hosts/[id]/          # Host management screens
    index.tsx          # Host detail
    edit.tsx           # Edit host
    docker/[containerId]/  # Container screens
  ports/index.tsx      # Port forwarding management
  projects/            # Project management
  snippets/            # Command snippets
  _layout.tsx          # Root layout with providers

lib/
  storage.ts           # AsyncStorage wrappers (hosts, preferences)
  store.tsx            # React Context state management
  types.ts             # TypeScript types/interfaces
  api.ts               # HTTP client for agent communication
  defaults.ts          # Default values, ID generation
  theme.ts             # Theme constants
  useTheme.tsx         # Theme hook
  query.tsx            # TanStack Query provider
  live.tsx             # Live polling for host data
  projects-store.tsx   # Projects context provider
  snippets-store.tsx   # Snippets context provider

components/
  Screen.tsx           # Base screen wrapper with SafeAreaView
  Card.tsx             # Reusable card component
  AppText.tsx          # Themed text component
  FadeIn.tsx           # Animation wrapper
  SwipeableRow.tsx     # Swipeable list rows (delete/rename actions)
  PortRow.tsx          # Port list item
  HostCard.tsx         # Host list item
```

## 1. Navigation Architecture

### Tab Structure
**File:** `/home/gabrielolv/Documents/Projects/ter/app/(tabs)/_layout.tsx`

```typescript
<NativeTabs tintColor={colors.blue} minimizeBehavior="onScrollDown">
  <NativeTabs.Trigger name="index">
    <Icon sf={{ default: 'terminal', selected: 'terminal.fill' }} />
    <Label>Sessions</Label>
  </NativeTabs.Trigger>
  <NativeTabs.Trigger name="hosts">
    <Icon sf={{ default: 'server.rack', selected: 'server.rack' }} />
    <Label>Hosts</Label>
  </NativeTabs.Trigger>
  <NativeTabs.Trigger name="docker">
    <Icon sf={{ default: 'shippingbox', selected: 'shippingbox.fill' }} />
    <Label>Docker</Label>
  </NativeTabs.Trigger>
  <NativeTabs.Trigger name="more">
    <Icon sf={{ default: 'ellipsis', selected: 'ellipsis' }} />
    <Label>More</Label>
  </NativeTabs.Trigger>
</NativeTabs>
```

**Navigation Pattern:**
- Uses `expo-router` with file-based routing
- Tabs defined in `app/(tabs)/`
- Stack screens defined in `app/_layout.tsx`
- Dynamic routes use `[param]` syntax (e.g., `session/[hostId]/[name]/terminal.tsx`)

**Key Navigation Hooks:**
- `useRouter()` from `expo-router` for programmatic navigation
- `useIsFocused()` from `@react-navigation/native` for tab focus detection
- `router.push()` for navigation

## 2. Data Storage Patterns

### AsyncStorage Layer
**File:** `/home/gabrielolv/Documents/Projects/ter/lib/storage.ts`

```typescript
const HOSTS_KEY = 'tmux.hosts.v1';
const PREFERENCES_KEY = 'tmux.preferences.v1';

export async function loadHosts(): Promise<Host[]> {
  const raw = await AsyncStorage.getItem(HOSTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Host[];
  } catch {
    return [];
  }
}

export async function saveHosts(hosts: Host[]): Promise<void> {
  await AsyncStorage.setItem(HOSTS_KEY, JSON.stringify(hosts));
}
```

**Storage Conventions:**
- Keys use namespaced format: `tmux.{entity}.v1`
- Version suffix (`v1`) allows for migration
- Always return safe defaults (empty arrays, default objects)
- Try/catch for JSON parsing with fallback
- Separate functions for each entity type

### State Management (React Context)
**File:** `/home/gabrielolv/Documents/Projects/ter/lib/store.tsx`

**Pattern:**
```typescript
const StoreContext = createContext<{
  hosts: Host[];
  preferences: AppPreferences;
  ready: boolean;
  upsertHost: (host: HostDraft, id?: string) => Promise<Host>;
  removeHost: (id: string) => Promise<void>;
  updateHostLastSeen: (id: string, timestamp: number) => void;
  // ... more methods
} | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences());
  const [ready, setReady] = useState(false);

  // Load on mount
  useEffect(() => {
    let mounted = true;
    async function load() {
      const [storedHosts, storedPreferences] = await Promise.all([
        loadHosts(), 
        loadPreferences()
      ]);
      if (!mounted) return;
      setHosts(storedHosts);
      setPreferences(storedPreferences);
      setReady(true);
    }
    load();
    return () => { mounted = false; };
  }, []);

  // CRUD operations
  const upsertHost = useCallback(async (draft: HostDraft, id?: string) => {
    const nextId = id ?? createId('host');
    const nextHosts = [...hosts];
    const index = nextHosts.findIndex((host) => host.id === nextId);
    const host: Host = { ...draft, id, color: draft.color ?? pickColor() };
    
    if (index >= 0) {
      nextHosts[index] = host;
    } else {
      nextHosts.push(host);
    }
    
    await persistHosts(nextHosts);
    return host;
  }, [hosts, persistHosts]);

  const value = useMemo(() => ({
    hosts, preferences, ready,
    upsertHost, removeHost, updateHostLastSeen,
    // ...
  }), [hosts, preferences, ready, /* ... */]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within StoreProvider');
  return context;
}
```

**State Management Conventions:**
- Context + hooks pattern (not Redux/Zustand)
- Single global store in `StoreProvider`
- Additional specialized stores (`ProjectsProvider`, `SnippetsProvider`)
- `ready` flag to track initial load state
- All mutations auto-persist to AsyncStorage
- `useMemo` for context value to prevent unnecessary re-renders
- `useCallback` for all mutation functions

### ID Generation
**File:** `/home/gabrielolv/Documents/Projects/ter/lib/defaults.ts`

```typescript
export function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}
// Example: "host-lm8a4x-k2p9qr"
```

## 3. List/Management Screen Patterns

### Hosts Tab Pattern
**File:** `/home/gabrielolv/Documents/Projects/ter/app/(tabs)/hosts.tsx`

**Features:**
- Pull-to-refresh
- Empty state with CTA
- Loading skeleton states
- Network discovery/scanning
- Add button in header
- Status indicators (online/offline/checking)
- Card-based list with FadeIn animations

**Structure:**
```typescript
export default function HostsTabScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { hosts, updateHostLastSeen, ready, upsertHost } = useStore();
  const [manualRefresh, setManualRefresh] = useState(false);
  const isFocused = useIsFocused();

  // Live data polling
  const { stateMap, refreshAll } = useHostsLive(hosts, { 
    sessions: true, 
    docker: true, 
    enabled: isFocused 
  });

  return (
    <Screen>
      {/* Header with count + add button */}
      <View style={styles.header}>
        <AppText variant="caps" tone="muted">
          {ready ? `${onlineCount}/${hosts.length} online` : 'Loading...'}
        </AppText>
        <Pressable onPress={() => router.push('/hosts/new')}>
          <AppText>+</AppText>
        </Pressable>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={manualRefresh}
            onRefresh={() => {
              setManualRefresh(true);
              refreshAll();
              setTimeout(() => setManualRefresh(false), 600);
            }}
          />
        }
      >
        {isBooting ? (
          <SkeletonList type="host" count={3} />
        ) : hosts.length === 0 ? (
          <EmptyState />
        ) : (
          hosts.map((host, index) => (
            <FadeIn key={host.id} delay={index * 50}>
              <HostCard
                host={host}
                status={statusMap[host.id]}
                onPress={() => router.push(`/hosts/${host.id}`)}
              />
            </FadeIn>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
```

### Sessions Tab Pattern
**File:** `/home/gabrielolv/Documents/Projects/ter/app/(tabs)/index.tsx`

**Features:**
- Grouped by host
- Swipeable rows (delete/rename)
- Status indicators (running/idle/stopped)
- Git branch badges
- Live updates for active tasks
- Usage cards at top
- Launch sheet modal

**Structure:**
```typescript
export default function SessionsScreen() {
  const { hosts, ready, preferences } = useStore();
  const { stateMap, refreshAll, refreshHost } = useHostsLive(hosts, {
    sessions: true,
    insights: isFocused,
    enabled: isFocused,
  });

  // Aggregate sessions from all hosts
  const sessions = useMemo(() => {
    const all: SessionWithHost[] = [];
    hosts.forEach((host) => {
      const hostState = stateMap[host.id];
      (hostState?.sessions ?? []).forEach((session) => {
        all.push({ ...session, host, hostStatus: hostState?.status ?? 'checking' });
      });
    });
    return all.sort((a, b) => /* by lastAttached */);
  }, [hosts, stateMap]);

  // Group by host
  const groupedSessions = useMemo(() => {
    const groups = new Map();
    sessions.forEach((session) => {
      if (!groups.has(session.host.id)) {
        groups.set(session.host.id, { host: session.host, sessions: [] });
      }
      groups.get(session.host.id).sessions.push(session);
    });
    return Array.from(groups.values());
  }, [sessions, stateMap]);

  return (
    <Screen>
      {/* Usage cards if enabled */}
      {hasUsageCards && <UsageCardsRow />}

      <ScrollView refreshControl={<RefreshControl />}>
        {groupedSessions.map((group) => (
          <Card key={group.host.id}>
            <View style={styles.hostGroupHeader}>
              <AppText>{group.host.name}</AppText>
            </View>
            {group.sessions.map((session) => (
              <SwipeableRow
                onRightAction={() => handleKillSession(session)}
                onLeftAction={() => handleRenameSession(session)}
              >
                <Pressable onPress={() => router.push(`/session/...`)}>
                  <SessionRow session={session} />
                </Pressable>
              </SwipeableRow>
            ))}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
```

### Ports Screen Pattern
**File:** `/home/gabrielolv/Documents/Projects/ter/app/ports/index.tsx`

**Features:**
- TanStack Query for data fetching
- Host selector (horizontal scroll chips)
- Search functionality
- View mode toggle (list/grouped)
- Selection mode for batch actions
- Create modal for tunnels

**Structure:**
```typescript
export default function PortsScreen() {
  const queryClient = useQueryClient();
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const { data: portsData, refetch } = useQuery({
    queryKey: ['ports', currentHost?.id],
    queryFn: async () => getPorts(currentHost),
    enabled: ready && !!currentHost,
    staleTime: 10_000,
  });

  const killMutation = useMutation({
    mutationFn: async (pids: number[]) => killPorts(currentHost, pids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ports', currentHost?.id] });
    },
  });

  return (
    <Screen>
      {/* Header with view toggle + select mode */}
      
      {/* Host selector */}
      <ScrollView horizontal>
        {hosts.map((host) => (
          <Pressable 
            onPress={() => setSelectedHostId(host.id)}
            style={currentHost?.id === host.id && styles.active}
          >
            <AppText>{host.name}</AppText>
          </Pressable>
        ))}
      </ScrollView>

      {/* Search bar */}
      <SearchBar value={searchQuery} onChangeText={setSearchQuery} />

      {/* List */}
      <ScrollView refreshControl={<RefreshControl />}>
        {viewMode === 'grouped' ? (
          <GroupedView />
        ) : (
          filteredPorts.map((port) => (
            <PortRow port={port} onKill={() => handleKill(port)} />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
```

## 4. UI Component Patterns

### Card Component
**File:** `/home/gabrielolv/Documents/Projects/ter/components/Card.tsx`

```typescript
type CardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'flat';
};

export function Card({ children, style, variant = 'default' }: CardProps) {
  const { colors, isDark } = useTheme();
  return (
    <View style={[
      styles.card,
      { backgroundColor: colors.card },
      variant === 'default' && (isDark ? cardShadow.dark : cardShadow.light),
      style,
    ]}>
      {children}
    </View>
  );
}
```

### Screen Component
**File:** `/home/gabrielolv/Documents/Projects/ter/components/Screen.tsx`

```typescript
export function Screen({ children, variant = 'default', ...props }: ViewProps) {
  const { colors, isDark } = useTheme();
  return (
    <SafeAreaView 
      style={{ backgroundColor: colors.background }}
      edges={variant === 'terminal' ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );
}
```

### Common Patterns
- `FadeIn` wrapper for staggered animations (`delay={index * 50}`)
- `AppText` with variants: `title`, `subtitle`, `body`, `label`, `mono`, `caps`
- `AppText` with tones: `default`, `muted`, `warning`, `error`
- `SwipeableRow` for list actions (left = rename, right = delete)
- Theme-aware styling via `useTheme()` hook
- `useMemo` for dynamic styles: `const styles = useMemo(() => createStyles(colors), [colors])`

## 5. API Communication Patterns

**File:** `/home/gabrielolv/Documents/Projects/ter/lib/api.ts`

### HTTP Client Pattern
```typescript
function buildHeaders(authToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
}

async function request<T>(
  host: Host,
  path: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const baseUrl = normalizeBaseUrl(host.baseUrl);
  const url = `${baseUrl}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      headers: buildHeaders(host.authToken),
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Request failed (${response.status})`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}
```

### API Methods Pattern
```typescript
export async function getSessions(host: Host): Promise<{ sessions: Session[] }> {
  return request<{ sessions: Session[] }>(host, '/sessions');
}

export async function killSession(host: Host, sessionName: string): Promise<void> {
  await request(host, `/sessions/${encodeURIComponent(sessionName)}`, {
    method: 'DELETE',
  });
}
```

### Probe Pattern (Health Checks)
```typescript
export type HealthProbeResult =
  | { status: 'ok'; payload: HealthResponse }
  | { status: 'unauthorized' }
  | { status: 'not-found' }
  | { status: 'unreachable'; message?: string }
  | { status: 'error'; statusCode?: number; message?: string };

export async function probeHealth(
  baseUrl: string,
  authToken?: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<HealthProbeResult> {
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (response.status === 401) return { status: 'unauthorized' };
    if (response.status === 404) return { status: 'not-found' };
    // ... etc
  } catch (err) {
    return { status: 'unreachable', message: err.message };
  }
}
```

**API Conventions:**
- All API functions take `Host` as first parameter
- Use AbortController for timeouts (default 6s)
- Return typed responses
- Throw errors for non-200 responses
- Probe functions return discriminated unions
- Auth via Bearer token in headers

## 6. Data Fetching Patterns

### TanStack Query
**File:** `/home/gabrielolv/Documents/Projects/ter/lib/query.tsx`

Used in ports screen:

```typescript
const { data: portsData, isFetching, refetch } = useQuery({
  queryKey: ['ports', currentHost?.id],
  queryFn: async () => {
    if (!currentHost) return { ports: [] };
    return getPorts(currentHost);
  },
  enabled: ready && !!currentHost,
  staleTime: 10_000,
  refetchOnWindowFocus: true,
});

const killMutation = useMutation({
  mutationFn: async (pids: number[]) => killPorts(currentHost, pids),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['ports', currentHost?.id] });
  },
});
```

### Custom Live Hook
**File:** `/home/gabrielolv/Documents/Projects/ter/lib/live.tsx`

```typescript
const { stateMap, refreshAll, refreshHost } = useHostsLive(hosts, {
  sessions: true,
  docker: true,
  insights: isFocused,
  enabled: isFocused,
});
```

**Patterns:**
- TanStack Query for CRUD operations (ports, tunnels)
- Custom hooks for polling/live data (sessions, host info)
- Conditional fetching with `enabled` flag
- Query invalidation on mutations
- Focus-aware fetching (`refetchOnWindowFocus`, `enabled: isFocused`)

## 7. Type Definitions

**File:** `/home/gabrielolv/Documents/Projects/ter/lib/types.ts`

**Key Types:**
```typescript
export type Host = {
  id: string;
  name: string;
  baseUrl: string;
  authToken?: string;
  color?: ColorValue;
  lastSeen?: number;
};

export type HostDraft = Omit<Host, 'id' | 'lastSeen'>;

export type Session = {
  name: string;
  windows: number;
  attached: boolean;
  createdAt?: number;
  lastAttached?: number;
  preview?: string[];
  insights?: SessionInsights;
};
```

**Conventions:**
- Draft types omit auto-generated fields (`id`, timestamps)
- Optional fields use `?` suffix
- Enums via union types: `'light' | 'dark' | 'system'`
- Records for maps: `Record<string, number>`

## Recommendations for AI Sessions Feature

### 1. Storage
Create new storage functions following the existing pattern:

```typescript
// In lib/storage.ts
const AI_SESSIONS_KEY = 'tmux.ai_sessions.v1';

export async function loadAISessions(): Promise<AISession[]> {
  const raw = await AsyncStorage.getItem(AI_SESSIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as AISession[];
  } catch {
    return [];
  }
}

export async function saveAISessions(sessions: AISession[]): Promise<void> {
  await AsyncStorage.setItem(AI_SESSIONS_KEY, JSON.stringify(sessions));
}
```

### 2. State Management
Create a new context provider (or extend existing store):

```typescript
// Option A: New provider (lib/ai-sessions-store.tsx)
export function AISessionsProvider({ children }) {
  const [sessions, setSessions] = useState<AISession[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function load() {
      const loaded = await loadAISessions();
      setSessions(loaded);
      setReady(true);
    }
    load();
  }, []);

  const createSession = useCallback(async (draft: AISessionDraft) => {
    const session: AISession = {
      ...draft,
      id: createId('ai-session'),
      createdAt: Date.now(),
    };
    const next = [...sessions, session];
    await saveAISessions(next);
    setSessions(next);
    return session;
  }, [sessions]);

  // ... more CRUD operations

  return <AISessionsContext.Provider value={{ sessions, ready, createSession }}>{children}</AISessionsContext.Provider>;
}

// Option B: Extend main store (lib/store.tsx)
// Add aiSessions to StoreContext alongside hosts/preferences
```

### 3. Navigation
Add a new tab or screen:

```typescript
// Option A: New tab in app/(tabs)/_layout.tsx
<NativeTabs.Trigger name="ai-sessions">
  <Icon sf={{ default: 'brain', selected: 'brain.fill' }} />
  <Label>AI</Label>
</NativeTabs.Trigger>

// Option B: Screen accessible from More tab or modal
// Add to app/_layout.tsx Stack
<Stack.Screen name="ai-sessions/index" />
<Stack.Screen name="ai-sessions/[id]/chat" />
```

### 4. UI Components
Follow existing patterns:

```typescript
// app/(tabs)/ai-sessions.tsx or app/ai-sessions/index.tsx
export default function AISessionsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { sessions, ready } = useAISessions();
  const [manualRefresh, setManualRefresh] = useState(false);

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">AI Sessions</AppText>
        <Pressable onPress={() => router.push('/ai-sessions/new')}>
          <Plus size={18} color={colors.accentText} />
        </Pressable>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={manualRefresh} onRefresh={...} />}
      >
        {!ready ? (
          <SkeletonList type="session" count={3} />
        ) : sessions.length === 0 ? (
          <Card style={styles.empty}>
            <AppText variant="subtitle">No AI sessions yet</AppText>
            <Pressable onPress={() => router.push('/ai-sessions/new')}>
              <AppText>Start your first conversation</AppText>
            </Pressable>
          </Card>
        ) : (
          sessions.map((session, index) => (
            <FadeIn key={session.id} delay={index * 50}>
              <Card>
                <Pressable onPress={() => router.push(`/ai-sessions/${session.id}/chat`)}>
                  <AISessionRow session={session} />
                </Pressable>
              </Card>
            </FadeIn>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
```

### 5. API Integration
If AI sessions require backend communication:

```typescript
// lib/api.ts
export async function sendMessage(
  host: Host,
  sessionId: string,
  message: string
): Promise<AIResponse> {
  return request<AIResponse>(host, `/ai/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function getAIHistory(
  host: Host,
  sessionId: string
): Promise<{ messages: AIMessage[] }> {
  return request(host, `/ai/sessions/${sessionId}/messages`);
}
```

### 6. Types
Add to `lib/types.ts`:

```typescript
export type AISession = {
  id: string;
  name: string;
  hostId?: string;  // Optional link to host
  createdAt: number;
  lastMessageAt?: number;
  model?: string;
  systemPrompt?: string;
  messageCount?: number;
};

export type AISessionDraft = Omit<AISession, 'id' | 'createdAt'>;

export type AIMessage = {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
};
```

## Key Files Reference

| File | Purpose | Line Count |
|------|---------|------------|
| `/home/gabrielolv/Documents/Projects/ter/lib/storage.ts` | AsyncStorage wrappers | 72 |
| `/home/gabrielolv/Documents/Projects/ter/lib/store.tsx` | Global state management | 170 |
| `/home/gabrielolv/Documents/Projects/ter/lib/types.ts` | Type definitions | ~300 |
| `/home/gabrielolv/Documents/Projects/ter/lib/api.ts` | HTTP client | ~500 |
| `/home/gabrielolv/Documents/Projects/ter/lib/defaults.ts` | Defaults & ID generation | 34 |
| `/home/gabrielolv/Documents/Projects/ter/app/_layout.tsx` | Root layout with providers | 124 |
| `/home/gabrielolv/Documents/Projects/ter/app/(tabs)/_layout.tsx` | Tab navigation | 27 |
| `/home/gabrielolv/Documents/Projects/ter/app/(tabs)/index.tsx` | Sessions screen | ~600 |
| `/home/gabrielolv/Documents/Projects/ter/app/(tabs)/hosts.tsx` | Hosts screen | ~500 |
| `/home/gabrielolv/Documents/Projects/ter/app/ports/index.tsx` | Ports screen | ~400 |
| `/home/gabrielolv/Documents/Projects/ter/components/Card.tsx` | Card component | 35 |
| `/home/gabrielolv/Documents/Projects/ter/components/Screen.tsx` | Screen wrapper | 52 |

## Architecture Patterns Summary

| Pattern | Implementation |
|---------|----------------|
| **Navigation** | Expo Router (file-based) + NativeTabs |
| **State** | React Context + hooks (no Redux) |
| **Storage** | AsyncStorage with versioned keys |
| **API** | fetch with typed wrappers, abort timeouts |
| **Data Fetching** | TanStack Query (mutations/queries) + custom hooks (polling) |
| **Styling** | StyleSheet.create with theme hooks, useMemo for dynamic styles |
| **Lists** | ScrollView + map + FadeIn animations |
| **Empty States** | Card with icon + CTA button |
| **Loading** | Skeleton components + ready flag |
| **Refresh** | RefreshControl on ScrollView |
| **Actions** | SwipeableRow (left/right actions) or Alert.alert confirmations |
| **Forms** | Modals with controlled inputs |
| **IDs** | `${prefix}-${timestamp36}-${random36}` |

## Next Steps for AI Sessions Feature

1. **Define Types** - Add `AISession`, `AIMessage` types to `lib/types.ts`
2. **Create Storage** - Add `loadAISessions`, `saveAISessions` to `lib/storage.ts`
3. **State Management** - Create `lib/ai-sessions-store.tsx` or extend `lib/store.tsx`
4. **Navigation** - Add tab/screen to `app/(tabs)/` or modal access point
5. **List Screen** - Create `app/ai-sessions/index.tsx` following hosts/ports patterns
6. **Detail Screen** - Create `app/ai-sessions/[id]/chat.tsx` for conversation UI
7. **API Integration** - Add AI endpoints to `lib/api.ts` if backend is needed
8. **Components** - Create `AISessionRow`, `ChatBubble` components
9. **Provider Setup** - Add `<AISessionsProvider>` to `app/_layout.tsx`

The codebase is well-structured and consistent. Following the existing patterns will ensure the AI Sessions feature integrates seamlessly.
