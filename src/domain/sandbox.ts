export interface SandboxLimits {
  timeoutMs: number;
  memoryMb: number;
  cpuMillicores: number;
  maxOutputBytes: number;
}

export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  timeoutMs: 15000,
  memoryMb: 256,
  cpuMillicores: 500,
  maxOutputBytes: 128 * 1024,
};

const ALLOWED_BINARIES = new Set(['node', 'tsc', 'esbuild', 'npm', 'vitest']);
const BLOCKED_SHELL_PATTERNS = [
  /&&\s*rm\b/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bssh\b/i,
  /\bnc\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\/etc\/passwd/i,
  /process\.env\.(GEMINI_API_KEY|SQL_PASSWORD|SQL_ADMIN_PASSWORD)/i,
  /[;|`$>]/,
];

const SENSITIVE_ENV_KEYS = new Set([
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'SQL_PASSWORD',
  'SQL_ADMIN_PASSWORD',
  'SQL_USER',
  'SQL_ADMIN_USER',
  'SQL_HOST',
  'FIREBASE_SERVICE_ACCOUNT',
]);

export function validateSandboxCommand(command: string): {
  valid: boolean;
  binary: string;
  args: string[];
  reason?: string;
} {
  const trimmed = command.trim();
  if (!trimmed) {
    return { valid: false, binary: '', args: [], reason: 'Command cannot be empty.' };
  }

  for (const pattern of BLOCKED_SHELL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        binary: '',
        args: [],
        reason: 'Command contains disallowed shell operators, network utilities, or secret references.',
      };
    }
  }

  const tokens = trimmed.split(/\s+/);
  const binary = tokens[0];
  if (!ALLOWED_BINARIES.has(binary)) {
    return {
      valid: false,
      binary,
      args: [],
      reason: `Binary "${binary}" is not in the sandbox allowlist (${Array.from(ALLOWED_BINARIES).join(', ')}).`,
    };
  }

  return {
    valid: true,
    binary,
    args: tokens.slice(1),
  };
}

export function sanitizeSandboxEnv(
  sourceEnv: Record<string, string | undefined>,
  limits: SandboxLimits = DEFAULT_SANDBOX_LIMITS
): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(sourceEnv)) {
    if (typeof value !== 'string') continue;
    if (SENSITIVE_ENV_KEYS.has(key)) continue;
    if (key.includes('SECRET') || key.includes('TOKEN') || key.includes('PASSWORD') || key.includes('KEY')) {
      continue;
    }
    clean[key] = value;
  }

  clean.NODE_ENV = 'development';
  clean.ACS_SANDBOX = 'isolated';
  clean.NODE_OPTIONS = `--max-old-space-size=${Math.min(512, Math.max(64, limits.memoryMb))}`;
  return clean;
}

export function clampSandboxLimits(partial?: Partial<SandboxLimits>): SandboxLimits {
  return {
    timeoutMs: Math.min(30000, Math.max(1000, partial?.timeoutMs ?? DEFAULT_SANDBOX_LIMITS.timeoutMs)),
    memoryMb: Math.min(512, Math.max(64, partial?.memoryMb ?? DEFAULT_SANDBOX_LIMITS.memoryMb)),
    cpuMillicores: Math.min(1000, Math.max(100, partial?.cpuMillicores ?? DEFAULT_SANDBOX_LIMITS.cpuMillicores)),
    maxOutputBytes: Math.min(512 * 1024, Math.max(4096, partial?.maxOutputBytes ?? DEFAULT_SANDBOX_LIMITS.maxOutputBytes)),
  };
}
