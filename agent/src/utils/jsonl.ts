import fs from 'node:fs';

/**
 * Convert an unknown value to an integer.
 * Returns 0 if the value cannot be converted.
 */
export function toInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Scan a JSONL file line by line, calling onLine for each non-empty line.
 */
export async function scanJsonlFile(filePath: string, onLine: (line: string) => void): Promise<void> {
  return new Promise<void>((resolve) => {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      let idx = buffer.indexOf('\n');
      while (idx >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.trim().length > 0) onLine(line);
        idx = buffer.indexOf('\n');
      }
    });
    stream.on('end', () => {
      if (buffer.trim().length > 0) onLine(buffer);
      resolve();
    });
    stream.on('error', () => resolve());
  });
}

/**
 * Extract reset time from a line containing "reset" or "resets".
 */
export function resetFromLine(line: string): string | undefined {
  const match = line.match(/reset[s]?\s*(?:in|at)?\s*(.*)$/i);
  if (match && match[1]) return match[1].trim();
  return undefined;
}
