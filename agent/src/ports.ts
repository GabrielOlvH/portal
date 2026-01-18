import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type PortInfo = {
  pid: number;
  port: number;
  process: string;
  command?: string;
};

const MIN_PORT = 3000;
const MAX_PORT = 9999;

/**
 * List listening ports in the dev range (3000-9999).
 * Tries lsof first, falls back to ss if unavailable.
 */
export async function listPorts(): Promise<PortInfo[]> {
  try {
    return await listPortsWithLsof();
  } catch {
    return await listPortsWithSs();
  }
}

/**
 * Use lsof to find listening TCP ports.
 * Output format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
 */
async function listPortsWithLsof(): Promise<PortInfo[]> {
  const { stdout } = await execFileAsync(
    'lsof',
    ['-i', '-P', '-n', '-sTCP:LISTEN'],
    { timeout: 5000 }
  );

  const lines = stdout.trim().split('\n').slice(1); // Skip header
  const portMap = new Map<string, PortInfo>();

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 9) continue;

    const process = parts[0];
    const pid = parseInt(parts[1], 10);
    
    // NAME column is second-to-last (last is "(LISTEN)")
    // e.g., "*:4020" or "127.0.0.1:8080"
    const name = parts[parts.length - 2];

    const portMatch = name.match(/:(\d+)$/);
    if (!portMatch) continue;

    const port = parseInt(portMatch[1], 10);
    if (port < MIN_PORT || port > MAX_PORT) continue;

    // Dedupe by pid:port
    const key = `${pid}:${port}`;
    if (!portMap.has(key)) {
      portMap.set(key, { pid, port, process });
    }
  }

  // Enrich with full command from ps
  const pids = Array.from(portMap.values()).map((p) => p.pid);
  if (pids.length > 0) {
    const commands = await getCommandsForPids(pids);
    for (const [, info] of portMap) {
      const cmd = commands.get(info.pid);
      if (cmd) {
        info.command = cmd;
      }
    }
  }

  return Array.from(portMap.values()).sort((a, b) => a.port - b.port);
}

/**
 * Get friendly command names for PIDs using ps.
 */
async function getCommandsForPids(pids: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  try {
    const { stdout } = await execFileAsync(
      'ps',
      ['-p', pids.join(','), '-o', 'pid,args', '--no-headers'],
      { timeout: 3000 }
    );
    
    for (const line of stdout.trim().split('\n')) {
      const match = line.match(/^\s*(\d+)\s+(.+)$/);
      if (!match) continue;
      
      const pid = parseInt(match[1], 10);
      const fullCmd = match[2].trim();
      
      // Extract a friendly name from the command
      const friendly = extractFriendlyCommand(fullCmd);
      result.set(pid, friendly);
    }
  } catch {
    // Ignore errors, we'll just use the process name from lsof
  }
  return result;
}

/**
 * Extract a friendly command name from full command line.
 */
function extractFriendlyCommand(fullCmd: string): string {
  // Common patterns to extract meaningful names
  
  // npm/npx scripts: "node .../npm run dev" -> "npm run dev"
  const npmMatch = fullCmd.match(/\b(npm|npx|yarn|pnpm)\s+\S+.*$/);
  if (npmMatch) return npmMatch[0];
  
  // Expo: "node .../expo start" -> "expo start"
  const expoMatch = fullCmd.match(/\bexpo\s+\S+.*$/);
  if (expoMatch) return expoMatch[0];
  
  // Python: "python script.py" or "python -m module"
  const pyMatch = fullCmd.match(/\b(python\d?|python3?)\s+\S+.*$/);
  if (pyMatch) return pyMatch[0];
  
  // Node with a script: "node server.js" -> "node server.js"
  const nodeScriptMatch = fullCmd.match(/\bnode\s+(?!.*node_modules)(\S+\.m?[jt]s\b.*$)/);
  if (nodeScriptMatch) return `node ${nodeScriptMatch[1]}`;
  
  // tsx/ts-node running a file
  const tsMatch = fullCmd.match(/\b(tsx?|ts-node)\s+(\S+\.ts\b)/);
  if (tsMatch) return `${tsMatch[1]} ${tsMatch[2]}`;
  
  // Generic: just take last path component of first arg if it's a binary
  const parts = fullCmd.split(/\s+/);
  if (parts.length > 0) {
    const bin = parts[0].split('/').pop() || parts[0];
    // If it's node/python with args, show something useful
    if (bin === 'node' && parts.length > 1) {
      // Find first non-flag argument
      for (let i = 1; i < parts.length; i++) {
        if (!parts[i].startsWith('-') && !parts[i].includes('node_modules')) {
          const script = parts[i].split('/').pop();
          if (script) return `node ${script}`;
        }
      }
    }
    return bin;
  }
  
  return fullCmd.slice(0, 50);
}

/**
 * Use ss (socket statistics) as fallback.
 * Output format varies, but we parse: State Recv-Q Send-Q Local Address:Port Peer Address:Port Process
 */
async function listPortsWithSs(): Promise<PortInfo[]> {
  const { stdout } = await execFileAsync(
    'ss',
    ['-tlnp'],
    { timeout: 5000 }
  );

  const lines = stdout.trim().split('\n').slice(1); // Skip header
  const portMap = new Map<string, PortInfo>();

  for (const line of lines) {
    // Extract port from local address (4th column typically)
    const portMatch = line.match(/:(\d+)\s/);
    if (!portMatch) continue;

    const port = parseInt(portMatch[1], 10);
    if (port < MIN_PORT || port > MAX_PORT) continue;

    // Extract PID and process from users:((...)) section
    const pidMatch = line.match(/pid=(\d+)/);
    const processMatch = line.match(/users:\(\("([^"]+)"/);

    const pid = pidMatch ? parseInt(pidMatch[1], 10) : 0;
    const process = processMatch ? processMatch[1] : 'unknown';

    if (pid === 0) continue;

    const key = `${pid}:${port}`;
    if (!portMap.has(key)) {
      portMap.set(key, { pid, port, process });
    }
  }

  return Array.from(portMap.values()).sort((a, b) => a.port - b.port);
}

/**
 * Kill processes by PID using SIGTERM.
 * Returns arrays of successfully killed and failed PIDs.
 */
export async function killProcesses(pids: number[]): Promise<{
  killed: number[];
  failed: { pid: number; error: string }[];
}> {
  const killed: number[] = [];
  const failed: { pid: number; error: string }[] = [];

  await Promise.all(
    pids.map(async (pid) => {
      try {
        // Validate PID is a positive integer
        if (!Number.isInteger(pid) || pid <= 0) {
          failed.push({ pid, error: 'Invalid PID' });
          return;
        }

        // Use kill command with SIGTERM (graceful)
        await execFileAsync('kill', ['-15', String(pid)], { timeout: 5000 });
        killed.push(pid);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failed.push({ pid, error: message });
      }
    })
  );

  return { killed, failed };
}
