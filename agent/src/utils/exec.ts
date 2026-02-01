import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  ignoreError?: boolean;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function exec(
  command: string,
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      timeout: options.timeout ?? 30000,
      encoding: 'utf8',
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
  } catch (error: unknown) {
    if (options.ignoreError) {
      const err = error as { stdout?: string; stderr?: string; code?: number };
      return {
        stdout: (err.stdout ?? '').trim(),
        stderr: (err.stderr ?? '').trim(),
        exitCode: err.code ?? 1,
      };
    }
    throw error;
  }
}
