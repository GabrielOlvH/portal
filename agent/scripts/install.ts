#!/usr/bin/env node
/**
 * Bridge Agent System Installer
 * Installs as system service (requires root/sudo)
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir, hostname, platform as osPlatform, networkInterfaces } from 'node:os';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { join } from 'node:path';
import { detectPlatform, installService, type ServiceConfig } from '../src/service/manager';

// ANSI Colors
const supportsColor = process.stdout.isTTY && process.env.TERM !== 'dumb';
const colors = {
  red: supportsColor ? '\x1b[31m' : '',
  green: supportsColor ? '\x1b[32m' : '',
  yellow: supportsColor ? '\x1b[33m' : '',
  blue: supportsColor ? '\x1b[34m' : '',
  cyan: supportsColor ? '\x1b[36m' : '',
  bold: supportsColor ? '\x1b[1m' : '',
  reset: supportsColor ? '\x1b[0m' : '',
};

const c = colors;

// Configuration
const DEFAULTS = {
  port: 4020,
  repoUrl: 'https://github.com/GabrielOlvH/bridge.git',
};

function printBanner(): void {
  console.log(`${c.cyan}`);
  console.log('================================================');
  console.log(`  ${c.bold}Bridge Agent System Installer${c.reset}${c.cyan}`);
  console.log('  System-Level Terminal Management Server');
  console.log('================================================');
  console.log(`${c.reset}`);
}

function checkRoot(): void {
  if (process.getuid && process.getuid() !== 0) {
    console.error(`${c.red}Error: This installer must be run as root (use sudo)${c.reset}`);
    console.error('');
    console.error('Run with:');
    console.error(`  ${c.cyan}sudo npx tsx scripts/install.ts${c.reset}`);
    process.exit(1);
  }

  if (osPlatform() === 'win32') {
    // On Windows, check for admin rights
    try {
      execSync('net session', { stdio: 'ignore' });
    } catch {
      console.error(`${c.red}Error: This installer must be run as Administrator${c.reset}`);
      process.exit(1);
    }
  }
}

function checkPrerequisites(): { ok: boolean; missing: string[]; warnings: string[] } {
  console.log(`${c.blue}Checking prerequisites...${c.reset}`);

  const missing: string[] = [];
  const warnings: string[] = [];

  // Check git
  try {
    execSync('git --version', { stdio: 'ignore' });
  } catch {
    missing.push('git');
  }

  // Check node
  try {
    const nodeVersion = execSync('node -v', { encoding: 'utf-8' }).trim();
    const major = parseInt(nodeVersion.replace('v', '').split('.')[0], 10);
    if (major < 18) {
      missing.push(`node >= 18 (found ${nodeVersion})`);
    }
  } catch {
    missing.push('node');
  }

  // Check npm
  try {
    execSync('npm --version', { stdio: 'ignore' });
  } catch {
    missing.push('npm');
  }

  const platform = detectPlatform();
  if (platform === 'linux') {
    if (!existsSync('/run/systemd/system') && !existsSync('/sbin/openrc-run')) {
      warnings.push('Neither systemd nor OpenRC detected. Service may need manual configuration.');
    }
  }

  if (missing.length === 0) {
    console.log(`${c.green}All prerequisites met${c.reset}`);
  }

  return { ok: missing.length === 0, missing, warnings };
}

function getSystemInstallDir(): string {
  const platform = detectPlatform();
  switch (platform) {
    case 'linux':
      return '/opt/bridge-agent';
    case 'macos':
      return '/Library/bridge-agent';
    case 'windows':
      return 'C:\\Program Files\\bridge-agent';
    default:
      return join(homedir(), '.bridge-agent');
  }
}

async function runWizard(rl: readline.Interface): Promise<ServiceConfig> {
  console.log(`\n${c.bold}Configuration Wizard${c.reset}\n`);

  const installDir = getSystemInstallDir();

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

  // Summary
  console.log(`\n${c.bold}Configuration Summary:${c.reset}`);
  console.log(`  Install directory: ${c.green}${installDir}${c.reset}`);
  console.log(`  Port:              ${c.green}${port}${c.reset}`);
  console.log(`  Host label:        ${c.green}${hostLabel}${c.reset}`);
  console.log(`  Auth token:        ${c.green}${authToken || '(none)'}${c.reset}`);
  console.log(`  Service type:      ${c.green}System service (auto-starts on boot)${c.reset}`);

  // Confirm
  console.log();
  const confirm = await rl.question(`${c.cyan}Proceed with installation? [Y/n]: ${c.reset}`);
  if (confirm.trim().toLowerCase() === 'n') {
    console.log(`${c.red}Installation cancelled${c.reset}`);
    process.exit(0);
  }

  return {
    installDir,
    port,
    hostLabel,
    authToken: authToken.trim(),
    serviceUser: 'bridge-agent',
  };
}

function cloneOrUpdateRepo(installDir: string): void {
  if (existsSync(installDir)) {
    console.log(`${c.yellow}Existing installation found, updating...${c.reset}`);
    try {
      execSync('git pull origin main', { cwd: installDir, stdio: 'inherit' });
    } catch {
      try {
        execSync('git pull origin master', { cwd: installDir, stdio: 'inherit' });
      } catch {
        console.log(`${c.yellow}Git pull failed, continuing with existing files${c.reset}`);
      }
    }
  } else {
    console.log('Cloning repository...');
    const parentDir = join(installDir, '..');
    mkdirSync(parentDir, { recursive: true });
    execSync(`git clone ${DEFAULTS.repoUrl} "${installDir}"`, { stdio: 'inherit' });
  }
}

function installDependencies(installDir: string): void {
  console.log('Installing dependencies...');
  execSync('npm install --production', { cwd: installDir, stdio: 'inherit' });
}

function createEnvFile(installDir: string, config: ServiceConfig): void {
  console.log('Creating configuration...');
  const envContent = `# Bridge Agent Configuration
# Generated by installer on ${new Date().toISOString()}

BRIDGE_AGENT_INSTALL_DIR=${config.installDir}
TMUX_AGENT_PORT=${config.port}
TMUX_AGENT_HOST=${config.hostLabel}
TMUX_AGENT_TOKEN=${config.authToken}
TMUX_AGENT_USAGE_POLL_MS=60000
TMUX_AGENT_TOKEN_POLL_MS=180000
NODE_ENV=production
`;

  writeFileSync(join(installDir, '.env'), envContent, 'utf-8');
  chmodSync(join(installDir, '.env'), 0o600); // Restrict permissions
  console.log(`${c.green}Configuration saved${c.reset}`);
}

function getLocalIP(): string {
  try {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  } catch {
    // Ignore
  }
  return 'your-ip';
}

function printSuccess(config: ServiceConfig): void {
  const localIP = getLocalIP();

  console.log(`\n${c.green}`);
  console.log('================================================');
  console.log('         Installation Complete!');
  console.log('================================================');
  console.log(`${c.reset}`);

  console.log(`Bridge Agent is now running as a system service on port ${c.bold}${config.port}${c.reset}`);
  console.log(`The service will automatically start on system boot.`);
  console.log();

  console.log(`${c.bold}Useful commands:${c.reset}`);
  const platform = detectPlatform();
  switch (platform) {
    case 'linux':
      console.log(`  ${c.cyan}View status:${c.reset}    systemctl status bridge-agent`);
      console.log(`  ${c.cyan}View logs:${c.reset}      journalctl -u bridge-agent -f`);
      console.log(`  ${c.cyan}Restart:${c.reset}        systemctl restart bridge-agent`);
      console.log(`  ${c.cyan}Stop:${c.reset}           systemctl stop bridge-agent`);
      break;
    case 'macos':
      console.log(`  ${c.cyan}View status:${c.reset}    sudo launchctl list | grep bridge`);
      console.log(`  ${c.cyan}View logs:${c.reset}      tail -f /var/log/bridge-agent.log`);
      console.log(`  ${c.cyan}Restart:${c.reset}        sudo launchctl kickstart -k system/com.bridge.agent`);
      console.log(`  ${c.cyan}Stop:${c.reset}           sudo launchctl stop com.bridge.agent`);
      break;
    case 'windows':
      console.log(`  ${c.cyan}View status:${c.reset}    sc query BridgeAgent`);
      console.log(`  ${c.cyan}Restart:${c.reset}        sc stop BridgeAgent && sc start BridgeAgent`);
      console.log(`  ${c.cyan}Stop:${c.reset}           sc stop BridgeAgent`);
      break;
  }
  console.log(`  ${c.cyan}Edit config:${c.reset}    ${platform === 'windows' ? 'notepad' : 'sudo nano'} ${join(config.installDir, '.env')}`);
  console.log();

  console.log(`${c.bold}Add to Bridge app:${c.reset}`);
  console.log(`  URL: ${c.green}http://${localIP}:${config.port}${c.reset}`);
  if (config.authToken) {
    console.log(`  Token: ${c.green}${config.authToken}${c.reset}`);
  }
  console.log();
  console.log(`${c.yellow}Updates can be checked and applied from the Bridge app${c.reset}`);
  console.log(`  ${c.cyan}Health check:${c.reset}   curl http://${localIP}:${config.port}/health`);
}

async function verifyServiceRunning(config: ServiceConfig): Promise<boolean> {
  console.log(`\n${c.blue}Verifying service is running...${c.reset}`);

  // Wait for service to start
  await new Promise((resolve) => setTimeout(resolve, 3000));

  return new Promise((resolve) => {
    const http = require('node:http');
    const req = http.get(`http://127.0.0.1:${config.port}/health`, (res: any) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main(): Promise<void> {
  printBanner();

  // Check for root
  checkRoot();

  // Detect platform
  const platform = detectPlatform();
  console.log(`${c.cyan}Detected platform: ${platform}${c.reset}\n`);

  // Check prerequisites
  const prereqs = checkPrerequisites();
  if (!prereqs.ok) {
    console.log(`${c.red}Error: Missing required tools: ${prereqs.missing.join(', ')}${c.reset}`);
    console.log('Please install them and try again.');
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
    console.log(`\n${c.blue}Setting up system service...${c.reset}`);
    await installService(config);

    // Verify
    const running = await verifyServiceRunning(config);
    if (!running) {
      console.log(`${c.yellow}Warning: Could not verify service is running. Check logs for details.${c.reset}`);
    }

    // Print success
    printSuccess(config);
  } finally {
    rl.close();
  }
}

// Run if executed directly
if (import.meta.url.startsWith('file:')) {
  const scriptPath = new URL(import.meta.url).pathname;
  const argv1 = process.argv[1];
  if (argv1 === scriptPath || argv1?.endsWith('/install.ts') || argv1?.endsWith('install')) {
    main().catch((err) => {
      console.error(`${c.red}Installation failed: ${err.message}${c.reset}`);
      process.exit(1);
    });
  }
}

export { main, checkRoot, checkPrerequisites };
