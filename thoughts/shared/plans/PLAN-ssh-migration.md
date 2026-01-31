# Plan: Migrate Agent to Pure SSH Commands

## Goal
Remove the requirement for the Bridge agent to be installed on remote hosts. Instead, all functionality should work through pure SSH commands, making the app work with any SSH-accessible machine.

## Technical Choices
- **SSH Library**: Use `react-native-ssh-sftp` or build a native module for SSH connectivity (Expo limitations may require ejecting or using a custom dev client)
- **Terminal WebSocket → SSH PTY**: Replace WebSocket terminal connections with SSH pseudo-terminal sessions
- **Persistent Tunnels → SSH Port Forwarding**: Use SSH local/remote port forwarding instead of application-level TCP proxies
- **Notifications**: Move to a pull-based model or use SSH connection events since there's no persistent agent

## Current State Analysis

### What the Agent Currently Provides:

| Feature | Current Implementation | SSH Equivalent |
|---------|----------------------|----------------|
| tmux sessions | REST API + WebSocket PTY | `ssh user@host tmux ...` |
| Docker management | REST API calling `docker` CLI | `ssh user@host docker ...` |
| Host info/metrics | Node.js `os` module | `ssh user@host` + parse system commands |
| File listing | Node.js `fs` | `ssh user@host ls -la ...` or SFTP |
| Port listing | `ss`/`netstat` parsing | `ssh user@host ss -tulnp` |
| Tunnels | Node.js `net.Server` proxy | SSH `-L`/`-R` port forwarding |
| Terminal I/O | WebSocket + node-pty | SSH PTY (pseudo-terminal) |
| AI sessions | File parsing (~/.claude, ~/.codex) | `ssh user@host cat ...` or SFTP |
| Notifications | Expo push + polling | Remove or use SSH keep-alive events |
| Service management | systemctl/launchctl | `ssh user@host systemctl ...` |

### Key Files to Modify:
- `lib/api.ts` - Replace HTTP calls with SSH command execution
- `lib/types.ts` - Update Host type to include SSH credentials
- `lib/store.tsx` - Store SSH keys/credentials
- `lib/live.tsx` - Replace WebSocket events with SSH polling
- `components/TerminalWebView.tsx` - Replace WebSocket with SSH PTY

## Tasks

### Task 1: Add SSH Connectivity Layer
Create a new SSH service module that handles connection pooling, authentication, and command execution.

- [ ] Research React Native SSH options (react-native-ssh-sftp, custom native module)
- [ ] If using Expo: Set up custom dev client or eject to bare workflow
- [ ] Create `lib/ssh.ts` with:
  - Connection pool management (reuse connections)
  - SSH key and password authentication
  - Command execution with timeout
  - PTY allocation for interactive sessions
  - SFTP for file operations

**Files to create:**
- `lib/ssh.ts`

### Task 2: Update Host Model for SSH
Modify the Host type and storage to support SSH authentication instead of HTTP.

- [ ] Update `Host` type:
  ```typescript
  type Host = {
    id: string;
    name: string;
    hostname: string;      // was baseUrl
    port: number;          // SSH port (default 22)
    username: string;      // SSH username
    authMethod: 'key' | 'password';
    privateKey?: string;   // PEM-encoded private key
    passphrase?: string;   // Key passphrase if encrypted
    password?: string;     // For password auth
    color?: ColorValue;
    lastSeen?: number;
  };
  ```
- [ ] Update secure storage to handle SSH credentials
- [ ] Update HostForm component for SSH configuration
- [ ] Add SSH key picker/import functionality

**Files to modify:**
- `lib/types.ts`
- `lib/storage.ts`
- `lib/store.tsx`
- `components/HostForm.tsx`

### Task 3: Replace API Layer with SSH Commands
Rewrite the API module to execute SSH commands instead of HTTP requests.

- [ ] Create command builders for each operation:
  - `tmux list-sessions -F "#{session_name}:#{session_windows}:#{session_attached}:#{session_created}"`
  - `docker ps --format json`
  - `ss -tulnp | grep LISTEN`
  - etc.
- [ ] Create response parsers for each command output
- [ ] Implement caching layer for expensive operations
- [ ] Handle command timeouts and errors gracefully

**Files to modify:**
- `lib/api.ts` - Complete rewrite

### Task 4: Implement SSH-Based Terminal
Replace WebSocket terminal with SSH PTY session.

- [ ] Create SSH session management for terminals
- [ ] Handle terminal resize events
- [ ] Implement proper escape sequence handling
- [ ] Add connection keep-alive and reconnection logic

**Files to modify:**
- `components/TerminalWebView.tsx`
- `lib/terminal-html.ts` (may need updates)

### Task 5: Implement SSH Port Forwarding for Tunnels
Replace application-level TCP proxy with SSH port forwarding.

- [ ] Implement local port forwarding (`-L localPort:targetHost:targetPort`)
- [ ] Track active forwardings in app state
- [ ] Handle forwarding lifecycle with SSH connection
- [ ] Update UI to reflect SSH-based tunnels

**Files to modify:**
- `lib/api.ts` (tunnel functions)
- `app/tunnels.tsx` (if exists)

### Task 6: Implement SSH-Based Live Updates
Replace WebSocket event stream with SSH polling or keep-alive based updates.

- [ ] Create polling mechanism for session/docker state
- [ ] Optimize polling intervals based on screen visibility
- [ ] Consider using SSH keep-alive packets as heartbeat

**Files to modify:**
- `lib/live.tsx`

### Task 7: Migrate AI Session Parsing
Parse AI session files over SSH/SFTP.

- [ ] Read session index files via SFTP or `cat`
- [ ] Parse JSONL files remotely (consider streaming for large files)
- [ ] Handle cross-platform paths (Linux/macOS)

**Files to modify:**
- `lib/api.ts` (AI session functions)

### Task 8: Handle Metrics and System Info
Implement system metrics gathering via SSH commands.

- [ ] CPU usage: `top -bn1 | grep "Cpu(s)"` or `/proc/stat`
- [ ] Memory: `free -b` or `/proc/meminfo`
- [ ] Disk: `df -B1`
- [ ] Uptime: `uptime` or `/proc/uptime`
- [ ] Load average: `cat /proc/loadavg`

**Files to modify:**
- `lib/api.ts` (host info functions)

### Task 9: Rethink Notifications
Without a persistent agent, notifications need a different approach.

- [ ] Option A: Remove push notifications entirely
- [ ] Option B: Have the app poll when in background (battery impact)
- [ ] Option C: Run a lightweight notification relay service (defeats "no agent" goal)
- [ ] Recommend: Start with Option A, add notifications later if needed

**Files to modify:**
- `lib/notifications.ts`
- Remove agent notification code

### Task 10: Update Discovery Mechanism
Replace mDNS/network discovery with SSH config parsing or manual entry.

- [ ] Parse `~/.ssh/config` for known hosts
- [ ] Parse `~/.ssh/known_hosts` for previously connected hosts
- [ ] Keep manual host entry as primary method

**Files to modify:**
- `lib/discovery.ts`

### Task 11: Remove Agent Code
Clean up the agent directory since it's no longer needed.

- [ ] Archive or remove `agent/` directory
- [ ] Update README documentation
- [ ] Remove agent-related install scripts

**Files to remove:**
- `agent/` directory

### Task 12: Update Documentation
Document the new SSH-based setup.

- [ ] Update README with SSH requirements
- [ ] Document supported SSH key formats
- [ ] Add troubleshooting guide for SSH connection issues

**Files to modify:**
- `README.md`

## Success Criteria

### Automated Verification:
- [ ] TypeScript compiles: `pnpm typecheck`
- [ ] Linting passes: `pnpm lint`
- [ ] App builds successfully: `pnpm expo build`

### Manual Verification:
- [ ] Can add a host using SSH key authentication
- [ ] Can add a host using password authentication
- [ ] Can list and manage tmux sessions
- [ ] Can open interactive terminal to tmux session
- [ ] Can list and manage Docker containers
- [ ] Can view host system metrics
- [ ] Can create SSH port forwarding tunnels
- [ ] Can list and browse AI sessions
- [ ] Connection survives network interruption and reconnects

## Risks (Pre-Mortem)

### Tigers:
- **Expo SSH limitations** (HIGH)
  - Expo Go doesn't support native modules
  - Mitigation: Use EAS Build with custom dev client, or eject to bare workflow

- **SSH key management on mobile** (MEDIUM)
  - Storing private keys securely on device
  - Mitigation: Use secure keychain storage, support key import from files

- **Performance of polling vs WebSocket** (MEDIUM)
  - SSH command execution has more overhead than HTTP/WS
  - Mitigation: Implement connection pooling, batch commands, smart caching

### Elephants:
- **Battery usage** (MEDIUM)
  - Polling and maintaining SSH connections uses more battery than the agent model
  - Note: Users may need to accept this tradeoff

- **Initial connection latency** (MEDIUM)
  - SSH handshake is slower than HTTP to a known endpoint
  - Note: Connection pooling will help after initial connect

## Out of Scope
- Agent backward compatibility (clean break)
- Push notifications (remove initially, may add back later)
- Multi-hop SSH (direct connections only)
- SSH agent forwarding
- Jump hosts / bastion hosts (future enhancement)
