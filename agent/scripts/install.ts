#!/usr/bin/env node
/**
 * Bridge Agent Cross-Platform Installer
 * Replaces bash-only install.sh with Node.js for Windows/macOS/Linux support
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync, createWriteStream } from "node:fs";
import { networkInterfaces } from "node:os";
import { join, dirname } from "node:path";
import { get as httpGet } from "node:http";
import { execSync, spawn } from "node:child_process";
import { homedir, hostname, platform as osPlatform } from "node:os";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

// Types
type PlatformType = "linux" | "macos" | "windows" | "unknown";
type ManagerType = "systemd" | "openrc" | "launchd" | "task-scheduler" | "manual";

interface Platform {
  type: PlatformType;
  manager: ManagerType;
}

interface Config {
  installDir: string;
  port: number;
  hostLabel: string;
  authToken: string;
  tmuxSocket: string;
}

// ANSI Colors (cross-platform compatible)
const supportsColor = process.stdout.isTTY && process.env.TERM !== "dumb";
const colors = {
  red: supportsColor ? "\x1b[31m" : "",
  green: supportsColor ? "\x1b[32m" : "",
  yellow: supportsColor ? "\x1b[33m" : "",
  blue: supportsColor ? "\x1b[34m" : "",
  cyan: supportsColor ? "\x1b[36m" : "",
  bold: supportsColor ? "\x1b[1m" : "",
  reset: supportsColor ? "\x1b[0m" : "",
};

const c = colors;

// Defaults
const DEFAULTS = {
  port: 4020,
  installDir: join(homedir(), ".bridge-agent"),
  serviceName: "bridge-agent",
  repoUrl: "https://github.com/GabrielOlvH/bridge.git",
};

/**
 * Detect the current platform and init system
 */
export function detectPlatform(): Platform {
  const os = osPlatform();

  if (os === "darwin") {
    return { type: "macos", manager: "launchd" };
  }

  if (os === "win32") {
    return { type: "windows", manager: "task-scheduler" };
  }

  if (os === "linux") {
    // Check for systemd
    if (existsSync("/run/systemd/system")) {
      return { type: "linux", manager: "systemd" };
    }
    // Check for OpenRC
    if (existsSync("/sbin/openrc-run") || existsSync("/sbin/rc-service")) {
      return { type: "linux", manager: "openrc" };
    }
    return { type: "linux", manager: "manual" };
  }

  return { type: "unknown", manager: "manual" };
}

/**
 * Check if a command exists
 */
function commandExists(cmd: string): boolean {
  try {
    const checkCmd = osPlatform() === "win32" ? `where ${cmd}` : `which ${cmd}`;
    execSync(checkCmd, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the path to a command
 */
function getCommandPath(cmd: string): string {
  try {
    const checkCmd = osPlatform() === "win32" ? `where ${cmd}` : `which ${cmd}`;
    return execSync(checkCmd, { encoding: "utf-8" }).trim().split("\n")[0];
  } catch {
    return cmd;
  }
}

/**
 * Check prerequisites
 */
export function checkPrerequisites(): { ok: boolean; missing: string[]; warnings: string[] } {
  console.log(`${c.blue}Checking prerequisites...${c.reset}`);

  const missing: string[] = [];
  const warnings: string[] = [];

  // Check git
  if (!commandExists("git")) {
    missing.push("git");
  }

  // Check node
  if (!commandExists("node")) {
    missing.push("node");
  } else {
    const nodeVersion = execSync("node -v", { encoding: "utf-8" }).trim();
    const major = parseInt(nodeVersion.replace("v", "").split(".")[0], 10);
    if (major < 18) {
      missing.push(`node >= 18 (found ${nodeVersion})`);
    }
  }

  // Check npm
  if (!commandExists("npm")) {
    missing.push("npm");
  }

  // Check build tools (warning only)
  const platform = detectPlatform();
  if (platform.type === "linux") {
    if (!commandExists("gcc") || !commandExists("make")) {
      warnings.push("Build tools (gcc, make) may be needed for node-pty. Install with: sudo apt install build-essential");
    }
  } else if (platform.type === "windows") {
    if (!commandExists("cl")) {
      warnings.push("Visual C++ Build Tools may be needed for node-pty. Install from: https://visualstudio.microsoft.com/visual-cpp-build-tools/");
    }
  }

  if (missing.length === 0) {
    console.log(`${c.green}All prerequisites met${c.reset}`);
  }

  return { ok: missing.length === 0, missing, warnings };
}

/**
 * Print banner
 */
function printBanner(): void {
  console.log(`${c.cyan}`);
  console.log("================================================");
  console.log(`  ${c.bold}Bridge Agent Installer${c.reset}${c.cyan}`);
  console.log("  Cross-Platform Terminal Management Server");
  console.log("================================================");
  console.log(`${c.reset}`);
}

/**
 * Interactive wizard
 */
async function runWizard(rl: readline.Interface): Promise<Config> {
  console.log(`\n${c.bold}Configuration Wizard${c.reset}\n`);

  // Install directory
  const installDirAnswer = await rl.question(`${c.cyan}Install directory [${DEFAULTS.installDir}]: ${c.reset}`);
  const installDir = installDirAnswer.trim() || DEFAULTS.installDir;

  // Port
  const portAnswer = await rl.question(`${c.cyan}Agent port [${DEFAULTS.port}]: ${c.reset}`);
  const port = parseInt(portAnswer.trim(), 10) || DEFAULTS.port;

  // Host label
  const defaultHost = hostname();
  const hostAnswer = await rl.question(`${c.cyan}Host label (shown in app) [${defaultHost}]: ${c.reset}`);
  const hostLabel = hostAnswer.trim() || defaultHost;

  // Auth token
  console.log(`\n${c.yellow}Authentication token protects your agent from unauthorized access.${c.reset}`);
  const authToken = await rl.question(`${c.cyan}Auth token (leave empty for none): ${c.reset}`);

  // Tmux socket (advanced)
  const platform = detectPlatform();
  let tmuxSocket = "";
  if (platform.type !== "windows") {
    console.log(`\n${c.yellow}Advanced: Leave empty for default tmux socket${c.reset}`);
    tmuxSocket = await rl.question(`${c.cyan}Tmux socket path [default]: ${c.reset}`);
  }

  // Summary
  console.log(`\n${c.bold}Configuration Summary:${c.reset}`);
  console.log(`  Install directory: ${c.green}${installDir}${c.reset}`);
  console.log(`  Port:              ${c.green}${port}${c.reset}`);
  console.log(`  Host label:        ${c.green}${hostLabel}${c.reset}`);
  console.log(`  Auth token:        ${c.green}${authToken || "(none)"}${c.reset}`);
  if (platform.type !== "windows") {
    console.log(`  Tmux socket:       ${c.green}${tmuxSocket || "(default)"}${c.reset}`);
  }

  // Confirm
  console.log();
  const confirm = await rl.question(`${c.cyan}Proceed with installation? [Y/n]: ${c.reset}`);
  if (confirm.trim().toLowerCase() === "n") {
    console.log(`${c.red}Installation cancelled${c.reset}`);
    process.exit(0);
  }

  return { installDir, port, hostLabel, authToken: authToken.trim(), tmuxSocket: tmuxSocket.trim() };
}

/**
 * Clone or update repository
 */
function cloneOrUpdateRepo(installDir: string): void {
  if (existsSync(installDir)) {
    console.log(`${c.yellow}Existing installation found, updating...${c.reset}`);
    try {
      execSync("git pull origin main", { cwd: installDir, stdio: "inherit" });
    } catch {
      try {
        execSync("git pull origin master", { cwd: installDir, stdio: "inherit" });
      } catch (e) {
        console.log(`${c.yellow}Git pull failed, continuing with existing files${c.reset}`);
      }
    }
  } else {
    console.log("Cloning repository...");
    mkdirSync(dirname(installDir), { recursive: true });
    execSync(`git clone ${DEFAULTS.repoUrl} "${installDir}"`, { stdio: "inherit" });
  }
}

/**
 * Install npm dependencies
 */
function installDependencies(installDir: string): void {
  console.log("Installing dependencies...");
  const agentDir = join(installDir, "agent");
  execSync("npm install", { cwd: agentDir, stdio: "inherit" });
}

/**
 * Create .env configuration file
 */
export function createEnvFile(installDir: string, config: Config): void {
  console.log("Creating configuration...");
  const envContent = `# Bridge Agent Configuration
# Generated by installer on ${new Date().toISOString()}

BRIDGE_INSTALL_DIR=${config.installDir}
TMUX_AGENT_PORT=${config.port}
TMUX_AGENT_HOST=${config.hostLabel}
TMUX_AGENT_TOKEN=${config.authToken}
TMUX_AGENT_SOCKET=${config.tmuxSocket}
TMUX_AGENT_USAGE_POLL_MS=60000
TMUX_AGENT_TOKEN_POLL_MS=180000
`;

  const agentDir = join(installDir, "agent");
  writeFileSync(join(agentDir, ".env"), envContent, "utf-8");
  console.log(`${c.green}Configuration saved${c.reset}`);
}

/**
 * Setup systemd service (Linux)
 */
function setupSystemd(config: Config): void {
  console.log(`\n${c.blue}Setting up systemd service...${c.reset}`);

  const userSystemdDir = join(homedir(), ".config", "systemd", "user");
  mkdirSync(userSystemdDir, { recursive: true });

  const nodePath = getCommandPath("node");
  const agentDir = join(config.installDir, "agent");

  const serviceContent = `[Unit]
Description=Bridge Agent - Terminal Management Server
Documentation=https://github.com/GabrielOlvH/bridge
After=network.target

[Service]
Type=simple
WorkingDirectory=${agentDir}
ExecStart=${nodePath} ${agentDir}/node_modules/.bin/tsx ${agentDir}/src/index.ts
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bridge-agent
EnvironmentFile=${agentDir}/.env

[Install]
WantedBy=default.target
`;

  const servicePath = join(userSystemdDir, `${DEFAULTS.serviceName}.service`);
  writeFileSync(servicePath, serviceContent, "utf-8");

  // Enable linger for user services to run without login
  try {
    execSync(`loginctl enable-linger ${process.env.USER}`, { stdio: "ignore" });
  } catch {
    // May fail if not supported
  }

  // Reload, enable, and start
  execSync("systemctl --user daemon-reload", { stdio: "inherit" });
  execSync(`systemctl --user enable ${DEFAULTS.serviceName}.service`, { stdio: "inherit" });
  execSync(`systemctl --user start ${DEFAULTS.serviceName}.service`, { stdio: "inherit" });

  console.log(`${c.green}Systemd service configured and started${c.reset}`);
}

/**
 * Setup OpenRC service (Gentoo, Alpine, etc.)
 */
function setupOpenRC(config: Config): void {
  console.log(`\n${c.blue}Setting up OpenRC service...${c.reset}`);

  const nodePath = getCommandPath("node");
  const agentDir = join(config.installDir, "agent");

  const initScript = `#!/sbin/openrc-run

name="bridge-agent"
description="Bridge Agent - Terminal Management Server"
command="${nodePath}"
command_args="${agentDir}/node_modules/.bin/tsx ${agentDir}/src/index.ts"
command_user="${process.env.USER}"
command_background=true
pidfile="/run/\${RC_SVCNAME}.pid"
directory="${agentDir}"

depend() {
    need net
    after firewall
}

start_pre() {
    export $(cat ${agentDir}/.env | grep -v '^#' | xargs)
}
`;

  const initPath = join(agentDir, `${DEFAULTS.serviceName}.init`);
  writeFileSync(initPath, initScript, "utf-8");
  chmodSync(initPath, 0o755);

  console.log(`${c.yellow}OpenRC init script created at: ${initPath}${c.reset}`);
  console.log(`${c.yellow}To install system-wide (requires root):${c.reset}`);
  console.log(`  sudo cp ${initPath} /etc/init.d/${DEFAULTS.serviceName}`);
  console.log(`  sudo rc-update add ${DEFAULTS.serviceName} default`);
  console.log(`  sudo rc-service ${DEFAULTS.serviceName} start`);
  console.log();
  console.log(`${c.cyan}Starting agent manually for now...${c.reset}`);

  // Start manually in background
  startManual(config);
}

/**
 * Setup launchd service (macOS)
 */
function setupLaunchd(config: Config): void {
  console.log(`\n${c.blue}Setting up launchd service...${c.reset}`);

  const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");
  mkdirSync(launchAgentsDir, { recursive: true });

  const nodePath = getCommandPath("node");
  const agentDir = join(config.installDir, "agent");

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.bridge.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${agentDir}/node_modules/.bin/tsx</string>
        <string>${agentDir}/src/index.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${agentDir}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>BRIDGE_INSTALL_DIR</key>
        <string>${config.installDir}</string>
        <key>TMUX_AGENT_PORT</key>
        <string>${config.port}</string>
        <key>TMUX_AGENT_HOST</key>
        <string>${config.hostLabel}</string>
        <key>TMUX_AGENT_TOKEN</key>
        <string>${config.authToken}</string>
        <key>TMUX_AGENT_SOCKET</key>
        <string>${config.tmuxSocket}</string>
        <key>TMUX_AGENT_USAGE_POLL_MS</key>
        <string>60000</string>
        <key>TMUX_AGENT_TOKEN_POLL_MS</key>
        <string>180000</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/bridge-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/bridge-agent.err</string>
</dict>
</plist>
`;

  const plistPath = join(launchAgentsDir, "com.bridge.agent.plist");
  writeFileSync(plistPath, plistContent, "utf-8");

  // Unload if already loaded, then load
  try {
    execSync(`launchctl unload "${plistPath}"`, { stdio: "ignore" });
  } catch {
    // May not be loaded
  }
  execSync(`launchctl load "${plistPath}"`, { stdio: "inherit" });

  console.log(`${c.green}launchd service configured and started${c.reset}`);
}

/**
 * Setup Windows Task Scheduler
 */
function setupTaskScheduler(config: Config): void {
  console.log(`\n${c.blue}Setting up Windows Task Scheduler...${c.reset}`);

  const nodePath = getCommandPath("node");
  const agentDir = join(config.installDir, "agent");
  const tsxPath = join(agentDir, "node_modules", ".bin", "tsx.cmd");
  const indexPath = join(agentDir, "src", "index.ts");

  // Create a batch file to set environment and run
  const batchContent = `@echo off
set BRIDGE_INSTALL_DIR=${config.installDir}
set TMUX_AGENT_PORT=${config.port}
set TMUX_AGENT_HOST=${config.hostLabel}
set TMUX_AGENT_TOKEN=${config.authToken}
set TMUX_AGENT_SOCKET=${config.tmuxSocket}
set TMUX_AGENT_USAGE_POLL_MS=60000
set TMUX_AGENT_TOKEN_POLL_MS=180000
cd /d "${agentDir}"
"${nodePath}" "${tsxPath}" "${indexPath}"
`;

  const batchPath = join(agentDir, "start-agent.bat");
  writeFileSync(batchPath, batchContent, "utf-8");

  // Create scheduled task
  const taskName = "BridgeAgent";

  // Delete existing task if present
  try {
    execSync(`schtasks /delete /tn "${taskName}" /f`, { stdio: "ignore" });
  } catch {
    // Task may not exist
  }

  // Create task to run at logon
  const schtasksCmd = `schtasks /create /tn "${taskName}" /tr "${batchPath}" /sc onlogon /rl highest /f`;
  execSync(schtasksCmd, { stdio: "inherit" });

  // Start the task immediately
  execSync(`schtasks /run /tn "${taskName}"`, { stdio: "inherit" });

  console.log(`${c.green}Windows Task Scheduler configured and started${c.reset}`);
}

/**
 * Start agent manually (fallback)
 */
function startManual(config: Config): void {
  console.log(`\n${c.yellow}Starting agent manually...${c.reset}`);

  const agentDir = join(config.installDir, "agent");
  const nodePath = getCommandPath("node");
  const tsxPath = join(agentDir, "node_modules", ".bin", "tsx");
  const indexPath = join(agentDir, "src", "index.ts");

  // Read .env and set environment
  const envPath = join(agentDir, ".env");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      if (line.trim() && !line.startsWith("#")) {
        const [key, ...valueParts] = line.split("=");
        process.env[key.trim()] = valueParts.join("=").trim();
      }
    }
  }

  // Spawn detached process
  const child = spawn(nodePath, [tsxPath, indexPath], {
    cwd: agentDir,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  // Write PID file
  const pidPath = osPlatform() === "win32"
    ? join(process.env.TEMP || "/tmp", "bridge-agent.pid")
    : "/tmp/bridge-agent.pid";
  writeFileSync(pidPath, String(child.pid), "utf-8");

  // Redirect output to log file
  const logPath = osPlatform() === "win32"
    ? join(process.env.TEMP || "/tmp", "bridge-agent.log")
    : "/tmp/bridge-agent.log";

  const logStream = createWriteStream(logPath, { flags: "a" });
  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);

  child.unref();

  console.log(`${c.green}Agent started (PID: ${child.pid})${c.reset}`);
  console.log(`${c.yellow}Note: Agent will not auto-start on reboot${c.reset}`);
}

/**
 * Setup service based on detected platform
 */
function setupService(config: Config, platform: Platform): void {
  switch (platform.manager) {
    case "systemd":
      setupSystemd(config);
      break;
    case "openrc":
      setupOpenRC(config);
      break;
    case "launchd":
      setupLaunchd(config);
      break;
    case "task-scheduler":
      setupTaskScheduler(config);
      break;
    default:
      startManual(config);
  }
}

/**
 * Get local IP address
 */
function getLocalIP(): string {
  try {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          return net.address;
        }
      }
    }
  } catch {
    // Ignore
  }
  return "your-ip";
}

/**
 * Print success message
 */
function printSuccess(config: Config, platform: Platform): void {
  const localIP = getLocalIP();

  console.log(`\n${c.green}`);
  console.log("================================================");
  console.log("         Installation Complete!");
  console.log("================================================");
  console.log(`${c.reset}`);

  console.log(`Bridge Agent is now running on port ${c.bold}${config.port}${c.reset}`);
  console.log();

  console.log(`${c.bold}Useful commands:${c.reset}`);
  switch (platform.manager) {
    case "systemd":
      console.log(`  ${c.cyan}View status:${c.reset}    systemctl --user status ${DEFAULTS.serviceName}`);
      console.log(`  ${c.cyan}View logs:${c.reset}      journalctl --user -u ${DEFAULTS.serviceName} -f`);
      console.log(`  ${c.cyan}Restart:${c.reset}        systemctl --user restart ${DEFAULTS.serviceName}`);
      console.log(`  ${c.cyan}Stop:${c.reset}           systemctl --user stop ${DEFAULTS.serviceName}`);
      break;
    case "launchd":
      console.log(`  ${c.cyan}View status:${c.reset}    launchctl list | grep bridge`);
      console.log(`  ${c.cyan}View logs:${c.reset}      tail -f /tmp/bridge-agent.log`);
      console.log(`  ${c.cyan}Restart:${c.reset}        launchctl stop com.bridge.agent && launchctl start com.bridge.agent`);
      console.log(`  ${c.cyan}Stop:${c.reset}           launchctl stop com.bridge.agent`);
      break;
    case "task-scheduler":
      console.log(`  ${c.cyan}View status:${c.reset}    schtasks /query /tn "BridgeAgent"`);
      console.log(`  ${c.cyan}View logs:${c.reset}      type %TEMP%\\bridge-agent.log`);
      console.log(`  ${c.cyan}Restart:${c.reset}        schtasks /end /tn "BridgeAgent" && schtasks /run /tn "BridgeAgent"`);
      console.log(`  ${c.cyan}Stop:${c.reset}           schtasks /end /tn "BridgeAgent"`);
      break;
    default:
      console.log(`  ${c.cyan}View logs:${c.reset}      tail -f /tmp/bridge-agent.log`);
      console.log(`  ${c.cyan}Stop:${c.reset}           kill $(cat /tmp/bridge-agent.pid)`);
  }
  console.log(`  ${c.cyan}Edit config:${c.reset}    ${osPlatform() === "win32" ? "notepad" : "nano"} ${join(config.installDir, "agent", ".env")}`);
  console.log();

  console.log(`${c.bold}Add to Bridge app:${c.reset}`);
  console.log(`  URL: ${c.green}http://${localIP}:${config.port}${c.reset}`);
  if (config.authToken) {
    console.log(`  Token: ${c.green}${config.authToken}${c.reset}`);
  }
  console.log();
  console.log(`${c.yellow}Updates can be triggered from the Bridge app${c.reset}`);
}

/**
 * Verify the service is running
 */
async function verifyRunning(config: Config): Promise<boolean> {
  console.log(`\n${c.blue}Verifying service is running...${c.reset}`);

  // Wait a moment for service to start
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Try to connect to the service
  return new Promise((resolve) => {
    const req = httpGet(`http://127.0.0.1:${config.port}/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Main installer function
 */
async function main(): Promise<void> {
  printBanner();

  // Detect platform
  const platform = detectPlatform();
  console.log(`${c.cyan}Detected: ${platform.type} with ${platform.manager}${c.reset}\n`);

  // Check prerequisites
  const prereqs = checkPrerequisites();
  if (!prereqs.ok) {
    console.log(`${c.red}Error: Missing required tools: ${prereqs.missing.join(", ")}${c.reset}`);
    console.log("Please install them and try again.");
    process.exit(1);
  }
  for (const warning of prereqs.warnings) {
    console.log(`${c.yellow}Warning: ${warning}${c.reset}`);
  }

  // Run wizard
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const config = await runWizard(rl);

    // Install
    console.log(`\n${c.blue}Installing Bridge Agent...${c.reset}\n`);
    cloneOrUpdateRepo(config.installDir);
    installDependencies(config.installDir);
    createEnvFile(config.installDir, config);

    // Setup service
    setupService(config, platform);

    // Verify
    const running = await verifyRunning(config);
    if (!running) {
      console.log(`${c.yellow}Warning: Could not verify service is running. Check logs for details.${c.reset}`);
    }

    // Print success
    printSuccess(config, platform);
  } finally {
    rl.close();
  }
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     process.argv[1]?.endsWith('install.ts') ||
                     process.argv[1]?.endsWith('install');

if (isMainModule) {
  main().catch((err) => {
    console.error(`${c.red}Installation failed: ${err.message}${c.reset}`);
    process.exit(1);
  });
}
