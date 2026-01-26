# Codebase Report: Portal (ter) App - GitHub Integration Exploration
Generated: 2026-01-23

## Summary

The Portal app is a React Native/Expo mobile app for managing SSH hosts, tmux sessions, Docker containers, and development workflows. It has a well-established pattern for external service integrations (GitHub Copilot), robust API client architecture, tab-based navigation, and consistent UI component patterns. The app stores configuration using AsyncStorage and uses TanStack Query for data fetching.

## Project Structure

```
app/
  (tabs)/                  # Main tab navigation
    index.tsx              # Sessions tab (home)
    hosts.tsx              # Hosts management
    docker.tsx             # Docker containers
    more.tsx               # Settings & integrations
    _layout.tsx            # Tab bar configuration
  ai-sessions/             # AI session management
    index.tsx              # List/search AI sessions
  projects/                # Project management
    index.tsx              # Project list
    new.tsx                # Create new project
  ports/                   # Port forwarding & tunnels
    index.tsx              # Ports list + tunnel management
  copilot/                 # GitHub Copilot integration
    auth.tsx               # OAuth flow screen
  hosts/[id]/              # Host detail screens
  session/[hostId]/[name]/ # Session screens
  snippets/                # Global command snippets

lib/
  api.ts                   # API client (558 lines)
  store.tsx                # Global app state (hosts, preferences)
  storage.ts               # AsyncStorage persistence
  projects-store.tsx       # Projects state management
  snippets-store.tsx       # Snippets state management
  query.tsx                # TanStack Query provider
  types.ts                 # TypeScript type definitions
  theme.ts                 # Theme constants
  useTheme.tsx             # Theme hook (light/dark/system)
  live.tsx                 # Live updates/WebSocket
  notifications.ts         # Push notifications

components/
  Card.tsx                 # Base card component
  HostCard.tsx             # Host status card
  SessionCard.tsx          # Session status card
  TunnelRow.tsx            # SSH tunnel row
  PortRow.tsx              # Port info row
  CreateTunnelModal.tsx    # Bottom sheet modal
  AppText.tsx              # Themed text component
  SearchBar.tsx            # Search input
  Screen.tsx               # Screen wrapper
  Field.tsx                # Form field
  Pill.tsx                 # Status pills
  PulsingDot.tsx           # Status indicator
  SwipeableRow.tsx         # Swipeable list item
```

## API Architecture

### Base API Client Pattern

**Location:** `lib/api.ts`

**Core Functions:**
- `buildHeaders(authToken?)` - Adds Bearer token to requests
- `request<T>(host, path, options, timeout)` - Generic request wrapper
- `normalizeBaseUrl(baseUrl)` - Strips trailing slashes

**Authentication:**
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
```

**Request Pattern:**
```typescript
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

  const headers = buildHeaders(host.authToken);

  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers },
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

### GitHub Copilot Integration (Existing Pattern)

**API Endpoints:**
- `POST /copilot/auth/start` - Start OAuth flow
- `GET /copilot/auth/poll` - Poll for completion
- `GET /copilot/auth/status` - Check authentication status
- `DELETE /copilot/auth` - Logout

**API Functions:**
```typescript
export type CopilotAuthStartResponse = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
};

export type CopilotAuthPollResponse = {
  status: 'pending' | 'success' | 'expired';
  token?: string;
  error?: string;
};

export type CopilotAuthStatusResponse = {
  authenticated: boolean;
  error?: string;
};

export async function startCopilotAuth(host: Host): Promise<CopilotAuthStartResponse> {
  return request(host, '/copilot/auth/start', { method: 'POST' });
}

export async function pollCopilotAuth(host: Host): Promise<CopilotAuthPollResponse> {
  return request(host, '/copilot/auth/poll', { method: 'GET' });
}

export async function getCopilotAuthStatus(host: Host): Promise<CopilotAuthStatusResponse> {
  return request(host, '/copilot/auth/status', { method: 'GET' });
}

export async function logoutCopilot(host: Host): Promise<{ ok: boolean }> {
  return request(host, '/copilot/auth', { method: 'DELETE' });
}
```

**Usage in Settings Screen:**

From `app/(tabs)/more.tsx`:
```typescript
const fetchCopilotStatus = useCallback(async () => {
  if (!host) {
    setUsageLoading(false);
    return;
  }
  setCopilotLoading(true);
  setUsageLoading(true);
  try {
    const [statusRes, usageRes] = await Promise.all([
      getCopilotAuthStatus(host),
      getUsage(host),
    ]);
    setCopilotAuthenticated(statusRes.authenticated);
    setCopilotUsage(usageRes.copilot ?? null);
    // ...
  } catch {
    setCopilotAuthenticated(false);
    setCopilotUsage(null);
  } finally {
    setCopilotLoading(false);
    setUsageLoading(false);
  }
}, [host]);

const handleCopilotConnect = () => {
  if (!host) return;
  router.push(`/copilot/auth?hostId=${host.id}`);
};

const handleCopilotDisconnect = () => {
  if (!host) return;
  Alert.alert(
    'Disconnect Copilot',
    'Are you sure you want to disconnect GitHub Copilot?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setCopilotLoading(true);
          try {
            await logoutCopilot(host);
            setCopilotAuthenticated(false);
            setCopilotUsage(null);
          } catch {
            Alert.alert('Error', 'Failed to disconnect Copilot');
          } finally {
            setCopilotLoading(false);
          }
        },
      },
    ]
  );
};
```

### AI Sessions API (Another Integration Example)

**Endpoints:**
- `GET /ai-sessions` - List AI sessions with filtering
- `POST /ai-sessions/:id/resume` - Resume a session

**Usage Pattern:**
```typescript
// From app/ai-sessions/index.tsx
const aiSessionQueries = useQuery({
  queryKey: ['ai-sessions-all-hosts', hosts.map(h => h.id).join(',')],
  queryFn: async () => {
    const results = await Promise.all(
      hosts.map(async (host) => {
        try {
          const data = await getAiSessions(host, { limit: 100, maxAgeDays: 30 });
          return { hostId: host.id, sessions: data.sessions };
        } catch {
          return { hostId: host.id, sessions: [] };
        }
      })
    );
    return results;
  },
  enabled: ready && hosts.length > 0,
  staleTime: 30_000,
});
```

## Navigation Structure

### Tab Bar (Main Navigation)

**Location:** `app/(tabs)/_layout.tsx`

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

### More Tab (Settings/Integration Hub)

**Location:** `app/(tabs)/more.tsx`

The "More" tab serves as the integration hub with sections for:
- **Navigation Cards**: Projects, Snippets, Ports, AI Sessions, CLI Assets
- **AI Providers**: Usage cards for Claude, Codex, Copilot (collapsible)
- **GitHub Copilot**: Connect/disconnect toggle
- **Notifications**: Push & Live Activity toggles
- **Appearance**: Theme selector (light/dark/system)
- **Terminal**: Font family & size settings

### Modal Navigation

The app uses bottom sheets for creation flows:
- `CreateTunnelModal` for SSH tunnels
- Forms are shown in bottom sheets using `@gorhom/bottom-sheet`

## Settings/Configuration Storage

### Storage Layer

**Location:** `lib/storage.ts`

**Pattern:**
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export async function loadPreferences(): Promise<AppPreferences> {
  const raw = await AsyncStorage.getItem(PREFERENCES_KEY);
  if (!raw) return defaultPreferences();
  try {
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return defaultPreferences();
  }
}

export async function savePreferences(prefs: AppPreferences): Promise<void> {
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
}
```

### State Management

**Location:** `lib/store.tsx`

**Pattern:**
```typescript
const StoreContext = createContext<{
  hosts: Host[];
  preferences: AppPreferences;
  ready: boolean;
  upsertHost: (host: HostDraft, id?: string) => Promise<Host>;
  removeHost: (id: string) => Promise<void>;
  updateHostLastSeen: (id: string, timestamp: number) => void;
  updateUsageCardVisibility: (updates: Partial<UsageCardsVisibility>) => void;
  updateNotificationSettings: (updates: Partial<AppPreferences['notifications']>) => void;
  updateTheme: (theme: ThemeSetting) => void;
  updateTerminalSettings: (updates: Partial<TerminalSettings>) => void;
} | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const [storedHosts, storedPreferences] = await Promise.all([loadHosts(), loadPreferences()]);
      if (!mounted) return;
      setHosts(storedHosts);
      setPreferences(storedPreferences);
      setReady(true);
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const updateUsageCardVisibility = useCallback(
    (updates: Partial<UsageCardsVisibility>) => {
      setPreferences((prev) => {
        const next: AppPreferences = {
          ...prev,
          usageCards: { ...prev.usageCards, ...updates },
        };
        savePreferences(next);
        return next;
      });
    },
    []
  );
  
  // ... other update functions
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within StoreProvider');
  return context;
}
```

### Type Definitions

**Location:** `lib/types.ts`

```typescript
export type Host = {
  id: string;
  name: string;
  baseUrl: string;
  authToken?: string;  // For host API authentication
  color?: ColorValue;
  lastSeen?: number;
};

export type AppPreferences = {
  usageCards: UsageCardsVisibility;
  theme: ThemeSetting;
  notifications: {
    pushEnabled: boolean;
    liveEnabled: boolean;
  };
  terminal: TerminalSettings;
};

export type UsageCardsVisibility = {
  claude: boolean;
  codex: boolean;
  copilot: boolean;
};
```

**For GitHub Integration, would add:**
```typescript
export type GitHubSettings = {
  token?: string;
  authenticated: boolean;
  username?: string;
};

// Add to AppPreferences:
export type AppPreferences = {
  // ... existing fields
  github?: GitHubSettings;
};
```

## UI Component Patterns

### Card Component

**Location:** `components/Card.tsx`

```typescript
type CardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'flat';
};

export function Card({ children, style, variant = 'default' }: CardProps) {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card },
        variant === 'default' && (isDark ? cardShadow.dark : cardShadow.light),
        style,
      ]}
    >
      {children}
    </View>
  );
}
```

### List Patterns

**Common Patterns:**
1. **Card-based lists** - Each item in a `<Card>` wrapper
2. **Swipeable rows** - `<SwipeableRow>` for delete actions
3. **Search filtering** - `<SearchBar>` component with local state
4. **Empty states** - `<FadeIn>` animations with centered messaging

**Example from AI Sessions:**
```typescript
{filteredSessions.length === 0 ? (
  <FadeIn style={styles.empty}>
    <AppText variant="title" style={styles.emptyText}>
      No AI sessions
    </AppText>
    <AppText variant="subtitle" tone="muted" style={styles.emptySubtext}>
      Your recent AI coding sessions will appear here
    </AppText>
  </FadeIn>
) : (
  filteredSessions.map((session) => (
    <SessionCard
      key={session.id}
      session={session}
      expanded={expandedId === session.id}
      onToggle={() => toggleExpanded(session.id)}
      onResume={() => handleResume(session)}
      isResuming={resumingId === session.id}
      colors={colors}
    />
  ))
)}
```

### Status Indicators

**Patterns:**
1. **Colored dots** - `<PulsingDot>` for active states
2. **Status badges** - Pill-shaped with color coding
3. **Color helpers** - `withAlpha(color, alpha)` for backgrounds

**Example from HostCard:**
```typescript
function getStatusColors(status: HostStatus, colors: ThemeColors): StatusColors {
  switch (status) {
    case 'online':
      return { color: colors.green, bg: withAlpha(colors.green, 0.16) };
    case 'offline':
      return { color: colors.red, bg: withAlpha(colors.red, 0.16) };
    case 'checking':
    default:
      return { color: colors.orange, bg: withAlpha(colors.orange, 0.16) };
  }
}
```

### Toggle/Switch Pattern

**Location:** `app/(tabs)/more.tsx`

```typescript
interface ToggleItemProps {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  status?: ProviderStatus;
}

function ToggleItem({ title, subtitle, value, onValueChange, styles, colors, status }: ToggleItemProps) {
  return (
    <View style={styles.toggleItem}>
      <View style={styles.menuItemContent}>
        <AppText variant="subtitle">{title}</AppText>
        {subtitle && <AppText variant="label" tone="muted">{subtitle}</AppText>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.separator, true: colors.accent }}
        thumbColor={colors.card}
        ios_backgroundColor={colors.separator}
      />
    </View>
  );
}
```

### Menu Item Pattern

```typescript
interface MenuItemProps {
  title: string;
  subtitle?: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  chevronColor: string;
}

function MenuItem({ title, subtitle, onPress, styles, chevronColor }: MenuItemProps) {
  return (
    <Pressable onPress={onPress} style={styles.menuItem}>
      <View style={styles.menuItemContent}>
        <AppText variant="subtitle">{title}</AppText>
        {subtitle && (
          <AppText variant="label" tone="muted">
            {subtitle}
          </AppText>
        )}
      </View>
      <ChevronRight size={20} color={chevronColor} />
    </Pressable>
  );
}
```

## Theme System

**Location:** `lib/useTheme.tsx`

**Pattern:**
```typescript
export type ThemeColors = {
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentText: string;
  separator: string;
  blue: string;
  green: string;
  red: string;
  orange: string;
  // ... etc
};

export function useTheme() {
  const { preferences } = useStore();
  const systemTheme = useColorScheme();
  
  const isDark = preferences.theme === 'dark' || 
                 (preferences.theme === 'system' && systemTheme === 'dark');
  
  const colors: ThemeColors = isDark ? darkColors : lightColors;
  
  return { colors, isDark };
}
```

## Data Fetching

**Library:** TanStack Query (React Query)

**Setup:** `lib/query.tsx`

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

**Usage Pattern:**
```typescript
const { data, isFetching, refetch } = useQuery({
  queryKey: ['ports', currentHost?.id],
  queryFn: async () => {
    if (!currentHost) return { ports: [] };
    return getPorts(currentHost);
  },
  enabled: ready && !!currentHost,
  staleTime: 10_000,
  refetchOnWindowFocus: true,
});
```

## Modal Patterns

**Library:** `@gorhom/bottom-sheet`

**Pattern from CreateTunnelModal:**
```typescript
const snapPoints = ['55%'];

export function CreateTunnelModal({ isOpen, onClose, host, prefillPort, onCreated }: Props) {
  const sheetRef = useRef<BottomSheet>(null);
  const { colors } = useTheme();
  
  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.snapToIndex(0);
      if (prefillPort) {
        setTargetPort(String(prefillPort));
      }
    } else {
      sheetRef.current?.close();
    }
  }, [isOpen, prefillPort]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={BackdropComponent}
      backgroundStyle={{ backgroundColor: colors.card }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        {/* Form content */}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}
```

## GitHub Integration Recommendations

### 1. Add GitHub Types

```typescript
// lib/types.ts
export type GitHubRepository = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  description?: string;
  language?: string;
  stargazersCount: number;
  updatedAt: string;
};

export type GitHubPullRequest = {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  user: {
    login: string;
    avatarUrl: string;
  };
};

export type GitHubSettings = {
  token?: string;
  authenticated: boolean;
  username?: string;
  avatarUrl?: string;
};
```

### 2. Add GitHub API Functions

```typescript
// lib/api.ts

export type GitHubAuthResponse = {
  authenticated: boolean;
  username?: string;
  avatarUrl?: string;
  error?: string;
};

export async function validateGitHubToken(token: string): Promise<GitHubAuthResponse> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    
    if (!response.ok) {
      return { authenticated: false, error: 'Invalid token' };
    }
    
    const user = await response.json();
    return {
      authenticated: true,
      username: user.login,
      avatarUrl: user.avatar_url,
    };
  } catch (error) {
    return { authenticated: false, error: 'Network error' };
  }
}

export async function fetchGitHubRepos(token: string): Promise<GitHubRepository[]> {
  const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=30', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch repositories');
  }
  
  return response.json();
}

export async function fetchGitHubPRs(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubPullRequest[]> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=20`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch pull requests');
  }
  
  return response.json();
}
```

### 3. Add GitHub Settings to Store

```typescript
// lib/store.tsx

// Add to AppPreferences type
export type AppPreferences = {
  // ... existing fields
  github: GitHubSettings;
};

// Add to StoreContext
updateGitHubSettings: (updates: Partial<GitHubSettings>) => void;

// Add update function
const updateGitHubSettings = useCallback(
  (updates: Partial<GitHubSettings>) => {
    setPreferences((prev) => {
      const next: AppPreferences = {
        ...prev,
        github: { ...prev.github, ...updates },
      };
      savePreferences(next);
      return next;
    });
  },
  []
);
```

### 4. Add GitHub Screen Navigation

```typescript
// app/(tabs)/more.tsx

// Add in the navigation section
<MenuItem
  title="GitHub"
  subtitle={preferences.github?.authenticated 
    ? `Connected as ${preferences.github.username}` 
    : "Connect your account"}
  onPress={() => router.push('/github')}
  styles={styles}
  chevronColor={colors.textSecondary}
/>
```

### 5. Create GitHub Settings Screen

```typescript
// app/github/index.tsx

export default function GitHubScreen() {
  const { colors } = useTheme();
  const { preferences, updateGitHubSettings } = useStore();
  const [token, setToken] = useState('');
  const [validating, setValidating] = useState(false);

  const handleConnect = async () => {
    if (!token.trim()) {
      Alert.alert('Error', 'Please enter a GitHub token');
      return;
    }

    setValidating(true);
    try {
      const result = await validateGitHubToken(token);
      if (result.authenticated) {
        updateGitHubSettings({
          token,
          authenticated: true,
          username: result.username,
          avatarUrl: result.avatarUrl,
        });
        Alert.alert('Success', `Connected as ${result.username}`);
      } else {
        Alert.alert('Error', result.error || 'Invalid token');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to validate token');
    } finally {
      setValidating(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect GitHub',
      'Are you sure you want to disconnect your GitHub account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            updateGitHubSettings({
              token: undefined,
              authenticated: false,
              username: undefined,
              avatarUrl: undefined,
            });
          },
        },
      ]
    );
  };

  return (
    <Screen>
      <ScrollView>
        <Card>
          {preferences.github?.authenticated ? (
            <>
              <AppText variant="subtitle">Connected</AppText>
              <AppText variant="label" tone="muted">
                {preferences.github.username}
              </AppText>
              <Pressable onPress={handleDisconnect}>
                <AppText variant="subtitle" style={{ color: colors.red }}>
                  Disconnect
                </AppText>
              </Pressable>
            </>
          ) : (
            <>
              <AppText variant="subtitle">GitHub Token</AppText>
              <TextInput
                value={token}
                onChangeText={setToken}
                placeholder="ghp_..."
                secureTextEntry
                autoCapitalize="none"
              />
              <Pressable onPress={handleConnect} disabled={validating}>
                <AppText variant="subtitle" style={{ color: colors.accent }}>
                  {validating ? 'Validating...' : 'Connect'}
                </AppText>
              </Pressable>
            </>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}
```

## Key Patterns Summary

| Pattern | Location | Usage |
|---------|----------|-------|
| API Client | `lib/api.ts` | All backend requests use `request<T>(host, path, options)` |
| Auth Headers | `lib/api.ts` | `buildHeaders(authToken)` adds Bearer token |
| State Management | `lib/store.tsx` | React Context with AsyncStorage persistence |
| Data Fetching | TanStack Query | `useQuery` with host-based cache keys |
| Navigation | expo-router | File-based routing with tab navigation |
| Theme | `lib/useTheme.tsx` | Light/dark/system with color constants |
| Modals | `@gorhom/bottom-sheet` | Bottom sheets for forms/creation flows |
| Lists | Card-based | Each item wrapped in `<Card>` component |
| Status Colors | `withAlpha(color, alpha)` | Consistent color + background pattern |
| Empty States | `<FadeIn>` | Animated empty state messaging |
| Settings Storage | AsyncStorage | JSON serialization with versioned keys |

## Integration Entry Points

For GitHub integration, follow this pattern:

1. **Add types** to `lib/types.ts`
2. **Add API functions** to `lib/api.ts` (use direct GitHub API, not host API)
3. **Extend preferences** in `lib/store.tsx` and `lib/storage.ts`
4. **Add menu item** in `app/(tabs)/more.tsx`
5. **Create screen** in `app/github/index.tsx`
6. **Use TanStack Query** for data fetching with proper cache keys
7. **Follow Card UI pattern** for consistent styling
8. **Use Alert.alert** for confirmations/errors
9. **Store token** in AppPreferences (AsyncStorage)
10. **Theme-aware components** using `useTheme()` hook

---

**Note:** The app has excellent separation of concerns, consistent patterns, and well-typed interfaces. Adding GitHub integration will fit naturally into the existing architecture.
