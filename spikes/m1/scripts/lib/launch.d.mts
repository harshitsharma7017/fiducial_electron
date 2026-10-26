export const SPIKE_ROOT: string;
export const PACKAGED_NAME: string;
export function devExecutable(): string;
export function packagedAppBundle(): string;
export function packagedExecutable(): string;
export function cleanEnv(extra?: Record<string, string>): NodeJS.ProcessEnv;
export function bundleOf(executable: string): string;
export function processesUnder(bundlePath: string): number[];

export interface LaunchResult {
  executable: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  durationMs: number;
  leftoverProcesses: number;
}

export function launch(options: {
  packaged?: boolean;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  logFile: string;
  timeoutMs?: number;
}): Promise<LaunchResult>;
