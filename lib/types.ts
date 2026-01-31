import type { ColorValue } from 'react-native';

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
  title?: string;
};

export type CursorInfo = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type UsageCardsVisibility = {
  claude: boolean;
  codex: boolean;
  copilot: boolean;
  kimi: boolean;
};

export type ThemeSetting = 'light' | 'dark' | 'system';

export type TerminalFontFamily =
  | 'JetBrains Mono'
  | 'Fira Code'
  | 'Source Code Pro'
  | 'SF Mono'
  | 'Menlo';

export type TerminalSettings = {
  fontFamily: TerminalFontFamily;
  fontSize: number;
};

export type AppPreferences = {
  usageCards: UsageCardsVisibility;
  theme: ThemeSetting;
  notifications: {
    pushEnabled: boolean;
    liveEnabled: boolean;
  };
  terminal: TerminalSettings;
  github: GitHubPreferences;
};

export type HostStatus = 'unknown' | 'checking' | 'online' | 'offline';

export type HostInfo = {
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  uptime: number;
  load: number[];
  cpu: {
    model?: string;
    cores: number;
    usage?: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
    usedPercent: number;
  };
};

export type DockerContainer = {
  id: string;
  name: string;
  image: string;
  status?: string;
  state?: string;
  ports?: string;
  createdAt?: string;
  runningFor?: string;
  cpuPercent?: number;
  memoryPercent?: number;
  memoryUsage?: string;
  memoryUsedBytes?: number;
  memoryLimitBytes?: number;
  netIO?: string;
  blockIO?: string;
  pids?: number;
  labels?: Record<string, string>;
  composeProject?: string;
  composeService?: string;
};

export type DockerImage = {
  id: string;
  repository: string;
  tag: string;
  size?: string;
  createdAt?: string;
  createdSince?: string;
};

export type DockerVolume = {
  name: string;
  driver?: string;
  scope?: string;
};

export type DockerNetwork = {
  id: string;
  name: string;
  driver?: string;
  scope?: string;
};

export type DockerSnapshot = {
  available: boolean;
  error?: string;
  containers: DockerContainer[];
  images: DockerImage[];
  volumes: DockerVolume[];
  networks: DockerNetwork[];
};

export type UsageWindow = {
  percentLeft?: number;
  reset?: string;
};

export type TokenUsage = {
  input?: number;
  output?: number;
  cached?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
  periodDays?: number;
  updatedAt?: number;
  source?: string;
};

export type ProviderUsage = {
  session?: UsageWindow;
  weekly?: UsageWindow;
  tokens?: TokenUsage;
  source?: string;
  error?: string;
  credits?: number;
};

export type GitStatus = {
  repo: boolean;
  branch?: string;
  ahead?: number;
  behind?: number;
  dirty?: number;
  path?: string;
};

export type SessionInsights = {
  codex?: ProviderUsage;
  claude?: ProviderUsage;
  copilot?: ProviderUsage;
  cursor?: ProviderUsage;
  kimi?: ProviderUsage;
  git?: GitStatus;
  meta?: InsightsMeta;
};

export type InsightsMeta = {
  lastPolled?: number;
  lastAttempt?: number;
  refreshing?: boolean;
  error?: string;
  activeAgent?: 'codex' | 'claude' | null;
  agentState?: 'running' | 'idle' | 'stopped';
  agentCommand?: string | null;
  cwd?: string | null;
};

export type Command = {
  id: string;
  label: string;
  command: string;
  icon?: string;
};

export type ProviderId = 'claude' | 'codex' | 'copilot' | 'cursor';

export type Snippet = Command & {
  providerIcon?: ProviderId;
};

export type Project = {
  id: string;
  hostId: string;
  name: string;
  path: string;
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

export type PackageJsonScripts = {
  [key: string]: string;
};

export type DirectoryItem = {
  name: string;
  path: string;
  isDirectory: boolean;
  hasPackageJson: boolean;
};

export type DirectoryListing = {
  path: string;
  parent: string | null;
  items: DirectoryItem[];
};

export type PortInfo = {
  pid: number;
  port: number;
  process: string;
  command?: string;
  protocol?: 'tcp' | 'udp';
  address?: string;
  connections?: number;
};

export type Tunnel = {
  id: string;
  listenPort: number;
  targetHost: string;
  targetPort: number;
  status: 'active' | 'error' | 'closed';
  connections: number;
  createdAt: number;
  error?: string;
};

export type TunnelCreate = {
  listenPort: number;
  targetHost: string;
  targetPort: number;
};

// GitHub CI Status Types

export type GitHubCommitStatus = {
  projectId: string;
  hostId: string;
  repo: string; // "owner/repo"
  branch: string;
  sha: string;
  state: 'pending' | 'success' | 'failure' | 'error';
  contexts: Array<{
    context: string;
    state: string;
    description?: string;
    targetUrl?: string;
  }>;
  updatedAt: number;
};

export type GitHubPreferences = {
  enabled: boolean;
};
