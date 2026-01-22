import { createServer, Socket, Server } from 'node:net';
import { randomUUID } from 'node:crypto';

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

type ActiveTunnel = Tunnel & {
  server: Server;
  sockets: Set<Socket>;
};

const activeTunnels = new Map<string, ActiveTunnel>();

/**
 * Check if a port is already in use.
 */
function isPortInUse(port: number): boolean {
  for (const tunnel of activeTunnels.values()) {
    if (tunnel.listenPort === port) return true;
  }
  return false;
}

/**
 * Create a TCP proxy tunnel.
 * Listens on listenPort and forwards connections to targetHost:targetPort.
 */
export function createTunnel(config: TunnelCreate): Promise<Tunnel> {
  const { listenPort, targetHost, targetPort } = config;

  if (isPortInUse(listenPort)) {
    return Promise.reject(new Error(`Port ${listenPort} is already in use by another tunnel`));
  }

  const id = randomUUID();
  const sockets = new Set<Socket>();

  return new Promise((resolve, reject) => {
    const server = createServer((clientSocket) => {
      const tunnel = activeTunnels.get(id);
      if (!tunnel) {
        clientSocket.destroy();
        return;
      }

      sockets.add(clientSocket);
      tunnel.connections = sockets.size;

      const targetSocket = new Socket();

      targetSocket.connect(targetPort, targetHost, () => {
        clientSocket.pipe(targetSocket);
        targetSocket.pipe(clientSocket);
      });

      targetSocket.on('error', () => {
        clientSocket.destroy();
      });

      clientSocket.on('error', () => {
        targetSocket.destroy();
      });

      const cleanup = () => {
        sockets.delete(clientSocket);
        const t = activeTunnels.get(id);
        if (t) t.connections = sockets.size;
        clientSocket.destroy();
        targetSocket.destroy();
      };

      clientSocket.on('close', cleanup);
      targetSocket.on('close', cleanup);
    });

    server.on('error', (err) => {
      const tunnel = activeTunnels.get(id);
      if (tunnel) {
        tunnel.status = 'error';
        tunnel.error = err.message;
      } else {
        reject(new Error(`Failed to start tunnel: ${err.message}`));
      }
    });

    server.listen(listenPort, '0.0.0.0', () => {
      const tunnel: ActiveTunnel = {
        id,
        listenPort,
        targetHost,
        targetPort,
        status: 'active',
        connections: 0,
        createdAt: Date.now(),
        server,
        sockets,
      };

      activeTunnels.set(id, tunnel);

      resolve({
        id: tunnel.id,
        listenPort: tunnel.listenPort,
        targetHost: tunnel.targetHost,
        targetPort: tunnel.targetPort,
        status: tunnel.status,
        connections: tunnel.connections,
        createdAt: tunnel.createdAt,
      });
    });
  });
}

/**
 * List all active tunnels.
 */
export function listTunnels(): Tunnel[] {
  const tunnels: Tunnel[] = [];

  for (const tunnel of activeTunnels.values()) {
    tunnels.push({
      id: tunnel.id,
      listenPort: tunnel.listenPort,
      targetHost: tunnel.targetHost,
      targetPort: tunnel.targetPort,
      status: tunnel.status,
      connections: tunnel.connections,
      createdAt: tunnel.createdAt,
      error: tunnel.error,
    });
  }

  return tunnels;
}

/**
 * Close a tunnel by ID.
 */
export function closeTunnel(id: string): { success: boolean; error?: string } {
  const tunnel = activeTunnels.get(id);
  if (!tunnel) {
    return { success: false, error: 'Tunnel not found' };
  }

  for (const socket of tunnel.sockets) {
    socket.destroy();
  }
  tunnel.sockets.clear();

  tunnel.server.close();
  tunnel.status = 'closed';
  activeTunnels.delete(id);

  return { success: true };
}

/**
 * Get a specific tunnel by ID.
 */
export function getTunnel(id: string): Tunnel | undefined {
  const tunnel = activeTunnels.get(id);
  if (!tunnel) return undefined;

  return {
    id: tunnel.id,
    listenPort: tunnel.listenPort,
    targetHost: tunnel.targetHost,
    targetPort: tunnel.targetPort,
    status: tunnel.status,
    connections: tunnel.connections,
    createdAt: tunnel.createdAt,
    error: tunnel.error,
  };
}

/**
 * Cleanup all tunnels on shutdown.
 */
export function cleanupTunnels(): void {
  for (const [id, tunnel] of activeTunnels) {
    for (const socket of tunnel.sockets) {
      socket.destroy();
    }
    tunnel.server.close();
    activeTunnels.delete(id);
  }
}

process.on('SIGTERM', cleanupTunnels);
process.on('SIGINT', cleanupTunnels);
