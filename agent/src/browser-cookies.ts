import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const execFileAsync = promisify(execFile);

export type BrowserType = 'chrome' | 'chromium' | 'helium' | 'edge' | 'brave' | 'arc';

interface BrowserConfig {
  name: string;
  dataDir: string;
  cookieFile: string;
}

const BROWSER_CONFIGS: Record<BrowserType, BrowserConfig> = {
  chrome: {
    name: 'Google Chrome',
    dataDir: path.join(os.homedir(), '.config', 'google-chrome'),
    cookieFile: 'Default/Cookies',
  },
  chromium: {
    name: 'Chromium',
    dataDir: path.join(os.homedir(), '.config', 'chromium'),
    cookieFile: 'Default/Cookies',
  },
  helium: {
    name: 'Helium',
    dataDir: path.join(os.homedir(), '.config', 'net.imput.helium'),
    cookieFile: 'Default/Cookies',
  },
  edge: {
    name: 'Microsoft Edge',
    dataDir: path.join(os.homedir(), '.config', 'microsoft-edge'),
    cookieFile: 'Default/Cookies',
  },
  brave: {
    name: 'Brave',
    dataDir: path.join(os.homedir(), '.config', 'BraveSoftware', 'Brave-Browser'),
    cookieFile: 'Default/Cookies',
  },
  arc: {
    name: 'Arc',
    dataDir: path.join(os.homedir(), '.config', 'Arc'),
    cookieFile: 'Default/Cookies',
  },
};

/**
 * Check if a browser is installed
 */
export function isBrowserInstalled(browser: BrowserType): boolean {
  const config = BROWSER_CONFIGS[browser];
  return fs.existsSync(config.dataDir);
}

/**
 * Get the cookie database path for a browser
 */
export function getCookiePath(browser: BrowserType): string | null {
  const config = BROWSER_CONFIGS[browser];
  const cookiePath = path.join(config.dataDir, config.cookieFile);
  return fs.existsSync(cookiePath) ? cookiePath : null;
}

/**
 * Extract a specific cookie from the browser's cookie database
 * Note: On Linux with basic password store, cookies may be encrypted
 * and require the browser to be running or manual extraction
 */
export async function extractCookie(
  browser: BrowserType,
  cookieName: string,
  domain: string
): Promise<string | null> {
  const cookiePath = getCookiePath(browser);
  if (!cookiePath) {
    return null;
  }

  try {
    // Use Python with sqlite3 to read the cookie
    const script = `
import sqlite3
import sys

try:
    conn = sqlite3.connect('${cookiePath}')
    cursor = conn.cursor()
    cursor.execute(
        "SELECT value, encrypted_value FROM cookies WHERE name = ? AND host_key LIKE ?",
        ('${cookieName}', '%${domain}%')
    )
    row = cursor.fetchone()
    conn.close()
    
    if row:
        value, encrypted = row
        if value and len(value) > 0:
            print(f"PLAIN:{value}")
        elif encrypted and len(encrypted) > 0:
            print(f"ENCRYPTED:{len(encrypted)}")
        else:
            print("NOT_FOUND")
    else:
        print("NOT_FOUND")
except Exception as e:
    print(f"ERROR:{e}")
    sys.exit(1)
`;

    const { stdout } = await execFileAsync('python3', ['-c', script], {
      timeout: 10000,
      encoding: 'utf8',
    });

    const result = stdout.trim();
    
    if (result.startsWith('PLAIN:')) {
      return result.substring(6);
    } else if (result.startsWith('ENCRYPTED:')) {
      // Cookie is encrypted, try to use browser's DevTools Protocol
      return await extractCookieViaCDP(browser, cookieName, domain);
    }
    
    return null;
  } catch (error) {
    console.error(`Failed to extract cookie from ${browser}:`, error);
    return null;
  }
}

/**
 * Try to extract cookie using Chrome DevTools Protocol
 * This requires the browser to be running with remote debugging
 */
async function extractCookieViaCDP(
  browser: BrowserType,
  cookieName: string,
  domain: string
): Promise<string | null> {
  // Try common debugging ports
  const ports = [9222, 9223, 9224, 9225];
  
  for (const port of ports) {
    try {
      // Check if debugging endpoint is available
      const { stdout } = await execFileAsync(
        'curl',
        ['-s', `http://localhost:${port}/json/list`],
        { timeout: 3000, encoding: 'utf8' }
      );
      
      if (stdout.includes('webSocketDebuggerUrl')) {
        // Found a debugging endpoint, try to get cookies
        const pages = JSON.parse(stdout);
        for (const page of pages) {
          if (page.url && page.url.includes(domain)) {
            // Use the debugger protocol to get cookies
            const wsUrl = page.webSocketDebuggerUrl;
            // For now, return null as we'd need a WebSocket client
            // This is a placeholder for future implementation
            console.log(`Found page with ${domain}: ${page.url}`);
            console.log(`WebSocket URL: ${wsUrl}`);
          }
        }
      }
    } catch {
      // Port not available, try next
      continue;
    }
  }
  
  return null;
}

/**
 * Find the best available browser for cookie extraction
 */
export function findBestBrowser(): BrowserType | null {
  const priority: BrowserType[] = ['helium', 'chrome', 'chromium', 'brave', 'edge', 'arc'];
  
  for (const browser of priority) {
    if (isBrowserInstalled(browser)) {
      const cookiePath = getCookiePath(browser);
      if (cookiePath) {
        return browser;
      }
    }
  }
  
  return null;
}

/**
 * Extract Kimi auth token from browser cookies
 * Tries multiple browsers in priority order
 */
export async function extractKimiAuthToken(): Promise<string | null> {
  const browsers: BrowserType[] = ['helium', 'chrome', 'chromium', 'brave', 'edge', 'arc'];
  
  for (const browser of browsers) {
    if (!isBrowserInstalled(browser)) {
      continue;
    }
    
    console.log(`Trying to extract Kimi token from ${BROWSER_CONFIGS[browser].name}...`);
    const token = await extractCookie(browser, 'kimi-auth', 'kimi.com');
    
    if (token) {
      console.log(`Found Kimi token in ${BROWSER_CONFIGS[browser].name}`);
      return token;
    }
  }
  
  return null;
}
