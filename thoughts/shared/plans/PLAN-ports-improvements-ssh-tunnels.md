# Plan: Ports Page Improvements & SSH Tunnels

## Goal

Enhance the ports page with better visibility, filtering, grouping, and quick actions. Add SSH tunnel management to enable port forwarding between machines.

## Technical Choices

- **SSH Tunnels**: Use `ssh -L` (local) and `ssh -R` (remote) commands managed by the agent
- **Tunnel Persistence**: Store active tunnels in agent memory with auto-cleanup on disconnect
- **UI Framework**: Follow existing React Native patterns with StyleSheet API and useTheme()
- **State Management**: TanStack Query for tunnel state, matching existing ports pattern
- **Grouping**: Client-side grouping by process name to minimize agent changes

## Current State Analysis

### Existing Implementation
- **Ports Page** (`app/ports/index.tsx`): Lists ports 3000-9999, multi-host selector, bulk kill
- **PortRow** (`components/PortRow.tsx`): Shows port, process, PID, kill button
- **Agent** (`agent/src/ports.ts`): Scans with lsof/ss, kills with SIGTERM
- **API** (`agent/src/http/routes/ports.ts`): GET /ports, POST /ports/kill
- **Types** (`lib/types.ts`): `PortInfo` with pid, port, process, command

### Key Files
- `app/ports/index.tsx` - Main ports screen (will be significantly modified)
- `components/PortRow.tsx` - Port list item (will add more details and actions)
- `agent/src/ports.ts` - Port scanning logic (will add protocol, address info)
- `agent/src/http/routes/ports.ts` - API routes (will add tunnel routes)
- `lib/types.ts` - Type definitions (will add PortInfoExtended, Tunnel types)
- `lib/api.ts` - API client (will add tunnel functions)

---

## Tasks

### Task 1: Extend Port Information (Agent)

Enhance the agent to return richer port data including protocol, listening address, and connection count.

- [ ] Modify `listPortsWithLsof()` to capture protocol (TCP/UDP) and local address
- [ ] Add connection count via `ss -tn state established sport eq :PORT | wc -l`
- [ ] Update `PortInfo` type to `PortInfoExtended` with new fields
- [ ] Ensure backward compatibility by keeping existing fields

**Files to modify:**
- `agent/src/ports.ts`
- `lib/types.ts`

**New PortInfoExtended type:**
```typescript
export type PortInfoExtended = {
  pid: number;
  port: number;
  process: string;
  command?: string;
  protocol: 'tcp' | 'udp';
  address: string;           // e.g., "0.0.0.0", "127.0.0.1", "::"
  connections?: number;      // active connections count
};
```

---

### Task 2: Add Search/Filter UI

Add a search bar to filter ports by number, process name, or command.

- [ ] Create `SearchBar` component (reusable)
- [ ] Add search state to PortsScreen
- [ ] Implement fuzzy filtering on port number, process, and command
- [ ] Show match count in UI

**Files to modify:**
- `app/ports/index.tsx`
- `components/SearchBar.tsx` (new)

---

### Task 3: Implement Port Grouping

Group ports by process/application for better organization.

- [ ] Add grouping toggle button (List/Grouped views)
- [ ] Create `PortGroup` component for collapsible groups
- [ ] Group by process name, show port count per group
- [ ] Persist view preference in AsyncStorage

**Files to modify:**
- `app/ports/index.tsx`
- `components/PortGroup.tsx` (new)

---

### Task 4: Enhanced PortRow with Details & Actions

Upgrade PortRow to show more details and add quick actions.

- [ ] Display protocol badge (TCP/UDP)
- [ ] Show listening address (if not 0.0.0.0)
- [ ] Show connection count indicator
- [ ] Add action menu: Open in Browser, Copy Info, Create Tunnel
- [ ] Use long-press or "..." button for action menu

**Files to modify:**
- `components/PortRow.tsx`

**New UI Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ [TCP] :3000   │ node server.js        │ 5 conns │ [...] │
│               │ PID 1234              │         │       │
└─────────────────────────────────────────────────────────┘
```

---

### Task 5: SSH Tunnel Types & State

Define types and state management for SSH tunnels.

- [ ] Add `Tunnel` type definition
- [ ] Add `TunnelCreate` request type
- [ ] Create tunnel state management in agent

**Files to modify:**
- `lib/types.ts`
- `agent/src/tunnels.ts` (new)

**Tunnel types:**
```typescript
export type Tunnel = {
  id: string;
  type: 'local' | 'remote';      // -L or -R
  localPort: number;
  remoteHost: string;
  remotePort: number;
  sshHost: string;               // SSH target host
  sshUser?: string;
  status: 'active' | 'connecting' | 'failed';
  pid?: number;                  // SSH process PID
  createdAt: number;
  error?: string;
};

export type TunnelCreate = {
  type: 'local' | 'remote';
  localPort: number;
  remoteHost: string;
  remotePort: number;
  sshHost: string;
  sshUser?: string;
  sshKey?: string;               // Path to identity file
};
```

---

### Task 6: Agent Tunnel Management

Implement SSH tunnel creation and management in the agent.

- [ ] Create `agent/src/tunnels.ts` module
- [ ] Implement `createTunnel()` - spawns SSH process with -L/-R
- [ ] Implement `listTunnels()` - returns active tunnels
- [ ] Implement `closeTunnel()` - kills SSH process
- [ ] Add tunnel cleanup on agent shutdown
- [ ] Handle SSH errors and reconnection

**Files to create:**
- `agent/src/tunnels.ts`

**SSH Command patterns:**
```bash
# Local forwarding: access remoteHost:remotePort via localhost:localPort
ssh -L localPort:remoteHost:remotePort sshUser@sshHost -N -f

# Remote forwarding: expose localPort on sshHost:remotePort
ssh -R remotePort:localhost:localPort sshUser@sshHost -N -f
```

---

### Task 7: Tunnel API Routes

Add HTTP endpoints for tunnel management.

- [ ] GET `/tunnels` - list active tunnels
- [ ] POST `/tunnels` - create new tunnel
- [ ] DELETE `/tunnels/:id` - close tunnel
- [ ] Register routes in app.ts

**Files to modify:**
- `agent/src/http/routes/tunnels.ts` (new)
- `agent/src/http/app.ts`

---

### Task 8: Client API Functions

Add tunnel API functions to the client.

- [ ] `getTunnels(host)` - fetch active tunnels
- [ ] `createTunnel(host, config)` - create new tunnel
- [ ] `closeTunnel(host, tunnelId)` - close tunnel

**Files to modify:**
- `lib/api.ts`

---

### Task 9: Tunnel UI - List & Status

Add tunnel management section to ports page.

- [ ] Add "Tunnels" section header with count
- [ ] Create `TunnelRow` component showing tunnel details
- [ ] Display tunnel status (active/connecting/failed)
- [ ] Add close button per tunnel
- [ ] Show tunnel direction arrow (→ or ←)

**Files to modify:**
- `app/ports/index.tsx`
- `components/TunnelRow.tsx` (new)

**TunnelRow UI:**
```
┌───────────────────────────────────────────────────────┐
│ [LOCAL]  localhost:8080 → remote.com:80    [Active] X │
│          via user@ssh.example.com                     │
└───────────────────────────────────────────────────────┘
```

---

### Task 10: Create Tunnel Modal

Add modal for creating new SSH tunnels.

- [ ] Create `CreateTunnelModal` component
- [ ] Form fields: type (local/remote), ports, SSH host, user, key
- [ ] Validation for port numbers and required fields
- [ ] "Create Tunnel" FAB button on ports page
- [ ] Quick-create from port row action menu (pre-fill port)

**Files to modify:**
- `app/ports/index.tsx`
- `components/CreateTunnelModal.tsx` (new)

---

### Task 11: Integrate Quick Actions

Wire up all quick actions in the enhanced PortRow.

- [ ] "Open in Browser" - construct URL and open with Linking
- [ ] "Copy Info" - copy port:process:pid to clipboard
- [ ] "Create Tunnel" - open modal pre-filled with port
- [ ] "Kill Process" - existing functionality

**Files to modify:**
- `components/PortRow.tsx`
- `app/ports/index.tsx`

---

## Success Criteria

### Automated Verification:
- [ ] TypeScript compiles: `pnpm typecheck`
- [ ] Lint passes: `pnpm lint`
- [ ] Agent builds: `cd agent && npm run build`

### Manual Verification:
- [ ] Ports page shows protocol and address for each port
- [ ] Search filters ports in real-time
- [ ] Grouping toggle works and persists preference
- [ ] Quick actions menu works (open browser, copy, create tunnel)
- [ ] Can create local SSH tunnel from UI
- [ ] Can create remote SSH tunnel from UI
- [ ] Tunnel list shows status correctly
- [ ] Can close tunnels from UI
- [ ] Tunnels persist after app backgrounding
- [ ] Error states show meaningful messages

---

## Out of Scope

- SSH key management (user provides path to existing key)
- Tunnel auto-reconnect on network changes
- SSH agent forwarding
- Jump hosts / ProxyCommand
- Persistent tunnels across agent restarts (tunnels die with agent)
- mTLS or other non-SSH tunnel protocols

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Mobile App                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Ports Screen                          │    │
│  │  ┌─────────┐  ┌──────────────┐  ┌──────────────────┐    │    │
│  │  │ Search  │  │ Port Groups  │  │ Tunnel Section   │    │    │
│  │  └─────────┘  │ - PortRows   │  │ - TunnelRows     │    │    │
│  │               │ - Actions    │  │ - CreateModal    │    │    │
│  │               └──────────────┘  └──────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                    TanStack Query                               │
│                              │                                   │
└──────────────────────────────┼───────────────────────────────────┘
                               │ HTTP
┌──────────────────────────────┼───────────────────────────────────┐
│                        Agent Server                              │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │   ports.ts      │  │   tunnels.ts    │                       │
│  │ - listPorts()   │  │ - createTunnel()│                       │
│  │ - killProcess() │  │ - listTunnels() │                       │
│  └────────┬────────┘  │ - closeTunnel() │                       │
│           │           └────────┬────────┘                       │
│      lsof/ss                   │                                │
│                         ssh -L/-R -N -f                         │
│                                │                                │
└────────────────────────────────┼────────────────────────────────┘
                                 │
                          SSH to remote hosts
```

---

## Risks (Pre-Mortem)

### Tigers:
- **SSH authentication failures** (HIGH)
  - Mitigation: Require user to specify key path, show clear error messages

- **Port conflicts when creating tunnels** (MEDIUM)
  - Mitigation: Check if local port is already in use before creating tunnel

- **Zombie SSH processes** (MEDIUM)
  - Mitigation: Track PIDs, cleanup on agent shutdown, periodic health checks

### Elephants:
- **Users may not have SSH keys set up** (MEDIUM)
  - Note: Document that passwordless SSH auth is required

- **Mobile network changes may break tunnels** (LOW)
  - Note: Out of scope for v1, tunnels are server-side only
