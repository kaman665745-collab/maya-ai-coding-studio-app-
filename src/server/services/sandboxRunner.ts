import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { redactSecrets, sanitizeProjectPath } from '../../domain/diff.ts';
import {
  clampSandboxLimits,
  sanitizeSandboxEnv,
  type SandboxLimits,
  validateSandboxCommand,
} from '../../domain/sandbox.ts';

export interface SandboxFileInput {
  path: string;
  content: string;
}

export interface SandboxExecutionResult {
  sandboxId: string;
  status: 'passed' | 'failed';
  exitCode: number;
  logs: string;
  durationMs: number;
  summary: {
    totalTests?: number;
    passedTests?: number;
    failedTests?: number;
    bundledBytes?: number;
  };
}

export interface SandboxExecutor {
  runBuildCheck(
    files: SandboxFileInput[],
    limits?: Partial<SandboxLimits>,
    onLog?: (line: string) => void
  ): Promise<SandboxExecutionResult>;
  runTests(
    files: SandboxFileInput[],
    limits?: Partial<SandboxLimits>,
    onLog?: (line: string) => void
  ): Promise<SandboxExecutionResult>;
  runAllowedCommand(
    files: SandboxFileInput[],
    command: string,
    limits?: Partial<SandboxLimits>,
    onLog?: (line: string) => void
  ): Promise<SandboxExecutionResult>;
}

async function materializeSandboxDir(files: SandboxFileInput[]): Promise<{ sandboxId: string; dir: string }> {
  const sandboxId = `acs-sbx-${crypto.randomBytes(6).toString('hex')}`;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${sandboxId}-`));

  for (const file of files) {
    const safeRel = sanitizeProjectPath(file.path);
    const fullPath = path.resolve(dir, safeRel);
    if (!fullPath.startsWith(dir + path.sep)) {
      throw new Error(`Sandbox path escape blocked: ${file.path}`);
    }
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.content, 'utf8');
  }

  return { sandboxId, dir };
}

function runIsolatedProcess(
  binary: string,
  args: string[],
  cwd: string,
  limits: SandboxLimits,
  onLog?: (line: string) => void
): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    const env = sanitizeSandboxEnv(process.env, limits);
    const child = spawn(binary, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let output = '';
    let killedByTimeout = false;

    const appendChunk = (chunk: Buffer) => {
      const text = redactSecrets(chunk.toString('utf8'));
      if (Buffer.byteLength(output, 'utf8') < limits.maxOutputBytes) {
        output += text;
        if (onLog) {
          for (const line of text.split('\n')) {
            if (line.trim()) onLog(line);
          }
        }
      }
    };

    child.stdout?.on('data', appendChunk);
    child.stderr?.on('data', appendChunk);

    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill('SIGKILL');
      output += `\n[sandbox] Process terminated after exceeding ${limits.timeoutMs}ms timeout.\n`;
    }, limits.timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      output += `\n[sandbox] Spawn error: ${err.message}\n`;
      resolve({ exitCode: 1, output });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: killedByTimeout ? 124 : code ?? 1,
        output,
      });
    });
  });
}

function findEntryFile(files: SandboxFileInput[]): string | null {
  const candidates = [
    'src/main.tsx',
    'src/main.ts',
    'src/index.tsx',
    'src/index.ts',
    'src/App.tsx',
    'index.js',
    'main.js',
  ];
  const paths = new Set(files.map((f) => f.path));
  for (const candidate of candidates) {
    if (paths.has(candidate)) return candidate;
  }
  const firstCode = files.find((f) => /\.(tsx?|jsx?)$/.test(f.path) && !f.path.includes('.test.'));
  return firstCode ? firstCode.path : null;
}

export class EphemeralSandboxRunner implements SandboxExecutor {
  async runBuildCheck(
    files: SandboxFileInput[],
    rawLimits?: Partial<SandboxLimits>,
    onLog?: (line: string) => void
  ): Promise<SandboxExecutionResult> {
    const start = Date.now();
    const limits = clampSandboxLimits(rawLimits);
    const { sandboxId, dir } = await materializeSandboxDir(files);
    const logs: string[] = [];
    const log = (line: string) => {
      const safe = redactSecrets(line);
      logs.push(safe);
      onLog?.(safe);
    };

    try {
      log(`[sandbox:${sandboxId}] Provisioned ephemeral workspace (mem<=${limits.memoryMb}MB, timeout=${limits.timeoutMs}ms, network=deny)`);
      const entry = findEntryFile(files);
      if (!entry) {
        log('[sandbox] No JavaScript/TypeScript entry file found to bundle.');
        return {
          sandboxId,
          status: 'failed',
          exitCode: 1,
          logs: logs.join('\n'),
          durationMs: Date.now() - start,
          summary: {},
        };
      }

      log(`[sandbox] Bundling entry "${entry}" with esbuild...`);
      const entryFullPath = path.resolve(dir, entry);
      const outDir = path.resolve(dir, '.acs-dist');

      const result = await esbuild.build({
        entryPoints: [entryFullPath],
        bundle: true,
        write: true,
        outdir: outDir,
        format: 'esm',
        platform: 'browser',
        jsx: 'automatic',
        absWorkingDir: dir,
        nodePaths: [path.resolve(process.cwd(), 'node_modules')],
        metafile: true,
        logLevel: 'silent',
      });

      if (result.errors.length > 0) {
        for (const err of result.errors) {
          log(`[error] ${err.text}`);
        }
        return {
          sandboxId,
          status: 'failed',
          exitCode: 1,
          logs: logs.join('\n'),
          durationMs: Date.now() - start,
          summary: {},
        };
      }

      const outputs = Object.values(result.metafile?.outputs || {});
      const bundledBytes = outputs.reduce((sum, o) => sum + o.bytes, 0);
      log(`[sandbox] Build succeeded (${outputs.length} output artifact(s), ${bundledBytes} bytes).`);

      return {
        sandboxId,
        status: 'passed',
        exitCode: 0,
        logs: logs.join('\n'),
        durationMs: Date.now() - start,
        summary: { bundledBytes },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`[error] ${msg}`);
      return {
        sandboxId,
        status: 'failed',
        exitCode: 1,
        logs: logs.join('\n'),
        durationMs: Date.now() - start,
        summary: {},
      };
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async runTests(
    files: SandboxFileInput[],
    rawLimits?: Partial<SandboxLimits>,
    onLog?: (line: string) => void
  ): Promise<SandboxExecutionResult> {
    const start = Date.now();
    const limits = clampSandboxLimits(rawLimits);
    const { sandboxId, dir } = await materializeSandboxDir(files);
    const logs: string[] = [];
    const log = (line: string) => {
      const safe = redactSecrets(line);
      logs.push(safe);
      onLog?.(safe);
    };

    try {
      log(`[sandbox:${sandboxId}] Running isolated test suite (timeout=${limits.timeoutMs}ms)`);
      const testFiles = files.filter((f) => /\.test\.(ts|tsx|js|mjs)$/.test(f.path));

      if (testFiles.length === 0) {
        log('[sandbox] No *.test.{ts,js,mjs} files found in project. Running syntax verification instead.');
        const buildCheck = await this.runBuildCheck(files, limits, onLog);
        return {
          ...buildCheck,
          summary: {
            totalTests: 1,
            passedTests: buildCheck.status === 'passed' ? 1 : 0,
            failedTests: buildCheck.status === 'passed' ? 0 : 1,
          },
        };
      }

      let passedTests = 0;
      let failedTests = 0;

      for (const tf of testFiles) {
        const compiledOut = path.resolve(dir, '.acs-test-out', `${path.basename(tf.path)}.mjs`);
        await fs.mkdir(path.dirname(compiledOut), { recursive: true });
        await esbuild.build({
          entryPoints: [path.resolve(dir, tf.path)],
          bundle: true,
          platform: 'node',
          format: 'esm',
          outfile: compiledOut,
          absWorkingDir: dir,
          packages: 'external',
          logLevel: 'silent',
        });

        log(`[sandbox] Executing ${tf.path}...`);
        const res = await runIsolatedProcess(process.execPath, ['--test', compiledOut], dir, limits, log);

        const passMatches = res.output.match(/# pass (\d+)/);
        const failMatches = res.output.match(/# fail (\d+)/);
        if (passMatches) passedTests += Number(passMatches[1]);
        if (failMatches) failedTests += Number(failMatches[1]);
        if (!passMatches && !failMatches) {
          if (res.exitCode === 0) passedTests += 1;
          else failedTests += 1;
        }
      }

      const totalTests = passedTests + failedTests;
      const status = failedTests === 0 ? 'passed' : 'failed';
      log(`[sandbox] Test summary: ${passedTests}/${totalTests} passed, ${failedTests} failed.`);

      return {
        sandboxId,
        status,
        exitCode: status === 'passed' ? 0 : 1,
        logs: logs.join('\n'),
        durationMs: Date.now() - start,
        summary: { totalTests, passedTests, failedTests },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`[error] ${msg}`);
      return {
        sandboxId,
        status: 'failed',
        exitCode: 1,
        logs: logs.join('\n'),
        durationMs: Date.now() - start,
        summary: { totalTests: 0, passedTests: 0, failedTests: 1 },
      };
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async runAllowedCommand(
    files: SandboxFileInput[],
    command: string,
    rawLimits?: Partial<SandboxLimits>,
    onLog?: (line: string) => void
  ): Promise<SandboxExecutionResult> {
    const start = Date.now();
    const check = validateSandboxCommand(command);
    if (!check.valid) {
      return {
        sandboxId: 'blocked',
        status: 'failed',
        exitCode: 126,
        logs: `[sandbox-policy] Command rejected: ${check.reason}`,
        durationMs: Date.now() - start,
        summary: {},
      };
    }

    const limits = clampSandboxLimits(rawLimits);
    const { sandboxId, dir } = await materializeSandboxDir(files);
    try {
      const binaryPath = check.binary === 'node' ? process.execPath : check.binary;
      const res = await runIsolatedProcess(binaryPath, check.args, dir, limits, onLog);
      return {
        sandboxId,
        status: res.exitCode === 0 ? 'passed' : 'failed',
        exitCode: res.exitCode,
        logs: res.output || '[sandbox] Command exited with no output.',
        durationMs: Date.now() - start,
        summary: {},
      };
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export const sandboxRunner: SandboxExecutor = new EphemeralSandboxRunner();
