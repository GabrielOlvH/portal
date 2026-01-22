#!/usr/bin/env node
/**
 * Bridge Agent Cross-Platform Uninstaller
 * Replaces bash-only uninstall.sh with Node.js for Windows/macOS/Linux support
 */

import { existsSync, rmSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { homedir, platform as osPlatform } from "node:os";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

// Types
type PlatformType = "linux" | "macos" | "windows" | "unknown";
type ManagerType = "systemd" | "openrc" | "launchd" | "task-scheduler" | "manual";

interface Platform {
  type: PlatformType;
  manager: ManagerType;
}

// ANSI Colors
const supportsColor = process.stdout.isTTY && process.env.TERM !== "dumb";
const colors = {
  red: supportsColor ? "\x1b[31m" : "",
  green: supportsColor ? "\x1b[32m" : "",
  yellow: supportsColor ? "\x1b[33m" : "",
  cyan: supportsColor ? "\x1b[36m" : "",
  bold: supportsColor ? "\x1b[1m" : "",
  reset: supportsColor ? "\x1b[0m" : "",
};

const c = colors;

// Defaults
const DEFAULTS = {
  installDir: join(homedir(), ".bridge-agent"),
  serviceName: "bridge-agent",
};

/**
 * Detect the current platform and init system
 */
function detectPlatform(): Platform {
  const os = osPlatform();

  if (os === "darwin") {
    return { type: "macos", manager: "launchd" };
  }

  if (os === "win32") {
    return { type: "windows", manager: "task-scheduler" };
  }

  if (os === "linux") {
    if (existsSync("/run/systemd/system")) {
      return { type: "linux", manager: "systemd" };
    }
    if (existsSync("/sbin/openrc-run") || existsSync("/sbin/rc-service")) {
      return { type: "linux", manager: "openrc" };
    }
    return { type: "linux", manager: "manual" };
  }

  return { type: "unknown", manager: "manual" };
}

/**
 * Print banner
 */
function printBanner(): void {
  console.log(`${c.cyan}`);
  console.log("================================================");
  console.log(`  ${c.bold}Bridge Agent Uninstaller${c.reset}${c.cyan}`);
  console.log("================================================");
  console.log(`${c.reset}`);
}

/**
 * Stop systemd service
 */
function stopSystemd(): void {
  console.log(`${c.cyan}Stopping systemd service...${c.reset}`);

  try {
    execSync(`systemctl --user stop ${DEFAULTS.serviceName}.service`, { stdio: "ignore" });
  } catch {
    // Service may not be running
  }

  try {
    execSync(`systemctl --user disable ${DEFAULTS.serviceName}.service`, { stdio: "ignore" });
  } catch {
    // Service may not be enabled
  }

  const serviceFile = join(homedir(), ".config", "systemd", "user", `${DEFAULTS.serviceName}.service`);
  if (existsSync(serviceFile)) {
    unlinkSync(serviceFile);
    console.log(`${c.green}Removed service file${c.reset}`);
  }

  try {
    execSync("systemctl --user daemon-reload", { stdio: "ignore" });
  } catch {
    // May fail
  }

  console.log(`${c.green}Systemd service stopped and removed${c.reset}`);
}

/**
 * Stop OpenRC service
 */
function stopOpenRC(installDir: string): void {
  console.log(`${c.cyan}Stopping OpenRC service...${c.reset}`);

  // Stop system service if installed
  try {
    execSync(`sudo rc-service ${DEFAULTS.serviceName} stop`, { stdio: "ignore" });
    execSync(`sudo rc-update del ${DEFAULTS.serviceName} default`, { stdio: "ignore" });
    execSync(`sudo rm -f /etc/init.d/${DEFAULTS.serviceName}`, { stdio: "ignore" });
    console.log(`${c.green}System-wide OpenRC service removed${c.reset}`);
  } catch {
    // May not be installed system-wide
  }

  // Remove local init script
  const initScript = join(installDir, "agent", `${DEFAULTS.serviceName}.init`);
  if (existsSync(initScript)) {
    unlinkSync(initScript);
    console.log(`${c.green}Removed local init script${c.reset}`);
  }
}

/**
 * Stop launchd service (macOS)
 */
function stopLaunchd(): void {
  console.log(`${c.cyan}Stopping launchd service...${c.reset}`);

  const plistPath = join(homedir(), "Library", "LaunchAgents", "com.bridge.agent.plist");

  try {
    execSync(`launchctl unload "${plistPath}"`, { stdio: "ignore" });
  } catch {
    // May not be loaded
  }

  if (existsSync(plistPath)) {
    unlinkSync(plistPath);
    console.log(`${c.green}Removed launchd plist${c.reset}`);
  }

  console.log(`${c.green}launchd service stopped and removed${c.reset}`);
}

/**
 * Stop Windows Task Scheduler
 */
function stopTaskScheduler(installDir: string): void {
  console.log(`${c.cyan}Stopping Windows scheduled task...${c.reset}`);

  const taskName = "BridgeAgent";

  // End running task
  try {
    execSync(`schtasks /end /tn "${taskName}"`, { stdio: "ignore" });
  } catch {
    // Task may not be running
  }

  // Delete task
  try {
    execSync(`schtasks /delete /tn "${taskName}" /f`, { stdio: "ignore" });
    console.log(`${c.green}Scheduled task removed${c.reset}`);
  } catch {
    // Task may not exist
  }

  // Remove batch file
  const batchPath = join(installDir, "agent", "start-agent.bat");
  if (existsSync(batchPath)) {
    unlinkSync(batchPath);
    console.log(`${c.green}Removed start batch file${c.reset}`);
  }
}

/**
 * Stop manual process
 */
function stopManual(): void {
  console.log(`${c.cyan}Stopping manual process...${c.reset}`);

  const pidPath = osPlatform() === "win32"
    ? join(process.env.TEMP || "/tmp", "bridge-agent.pid")
    : "/tmp/bridge-agent.pid";

  if (existsSync(pidPath)) {
    try {
      const pid = readFileSync(pidPath, "utf-8").trim();
      if (osPlatform() === "win32") {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      } else {
        execSync(`kill ${pid}`, { stdio: "ignore" });
      }
      console.log(`${c.green}Process stopped${c.reset}`);
    } catch {
      // Process may not be running
    }
    unlinkSync(pidPath);
  }

  // Clean up log file
  const logPath = osPlatform() === "win32"
    ? join(process.env.TEMP || "/tmp", "bridge-agent.log")
    : "/tmp/bridge-agent.log";

  if (existsSync(logPath)) {
    unlinkSync(logPath);
    console.log(`${c.green}Removed log file${c.reset}`);
  }

  // Clean up error log (macOS)
  if (existsSync("/tmp/bridge-agent.err")) {
    unlinkSync("/tmp/bridge-agent.err");
  }
}

/**
 * Stop service based on platform
 */
function stopService(platform: Platform, installDir: string): void {
  switch (platform.manager) {
    case "systemd":
      stopSystemd();
      break;
    case "openrc":
      stopOpenRC(installDir);
      break;
    case "launchd":
      stopLaunchd();
      break;
    case "task-scheduler":
      stopTaskScheduler(installDir);
      break;
    default:
      stopManual();
  }

  // Always try to stop manual process as fallback
  if (platform.manager !== "manual") {
    stopManual();
  }
}

/**
 * Remove installation directory
 */
function removeInstallDir(installDir: string): void {
  if (existsSync(installDir)) {
    rmSync(installDir, { recursive: true, force: true });
    console.log(`${c.green}Installation directory removed${c.reset}`);
  } else {
    console.log(`${c.yellow}Installation directory not found${c.reset}`);
  }
}

/**
 * Print success message
 */
function printSuccess(): void {
  console.log(`\n${c.green}`);
  console.log("================================================");
  console.log("         Uninstall Complete!");
  console.log("================================================");
  console.log(`${c.reset}`);
}

/**
 * Main uninstaller function
 */
async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let installDir = DEFAULTS.installDir;
  let forceYes = false;
  let removeFiles = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-y" || arg === "--yes") {
      forceYes = true;
    } else if (arg === "-r" || arg === "--remove-files") {
      removeFiles = true;
    } else if (arg === "-h" || arg === "--help") {
      console.log(`Usage: uninstall.ts [options] [install-dir]

Options:
  -y, --yes           Skip confirmation prompts
  -r, --remove-files  Also remove installation directory
  -h, --help          Show this help message

Arguments:
  install-dir         Installation directory (default: ${DEFAULTS.installDir})
`);
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      installDir = arg;
    }
  }

  printBanner();

  // Detect platform
  const platform = detectPlatform();
  console.log(`${c.cyan}Detected: ${platform.type} with ${platform.manager}${c.reset}\n`);

  console.log(`${c.yellow}This will remove Bridge Agent from your system.${c.reset}\n`);

  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    // Confirm uninstall
    if (!forceYes) {
      const confirm = await rl.question(`${c.cyan}Are you sure you want to uninstall? [y/N]: ${c.reset}`);
      if (confirm.trim().toLowerCase() !== "y") {
        console.log(`${c.green}Uninstall cancelled${c.reset}`);
        process.exit(0);
      }
    }

    // Stop services
    console.log(`\n${c.cyan}Stopping services...${c.reset}`);
    stopService(platform, installDir);
    console.log(`${c.green}Services stopped${c.reset}`);

    // Ask about removing files
    let shouldRemoveFiles = removeFiles;
    if (!removeFiles && !forceYes) {
      const removeConfirm = await rl.question(`\n${c.cyan}Remove installation directory (${installDir})? [y/N]: ${c.reset}`);
      shouldRemoveFiles = removeConfirm.trim().toLowerCase() === "y";
    }

    if (shouldRemoveFiles) {
      removeInstallDir(installDir);
    } else {
      console.log(`${c.yellow}Installation directory kept at: ${installDir}${c.reset}`);
    }

    printSuccess();
  } finally {
    rl.close();
  }
}

// Run if executed directly
main().catch((err) => {
  console.error(`${c.red}Uninstall failed: ${err.message}${c.reset}`);
  process.exit(1);
});
