// Command-line arguments for the spike harness. Validated with Zod before anything uses them.
import { z } from 'zod';

export const SPIKE_IDS = ['s1', 's2', 's3', 's4', 's5'] as const;
export type SpikeId = (typeof SPIKE_IDS)[number];

const pathArg = z.string().min(1).max(1024);

const spikeArgsSchema = z
  .object({
    spike: z.enum(SPIKE_IDS),
    out: pathArg,
    userData: pathArg.optional(),
    phase: z
      .string()
      .regex(/^[a-z][a-z-]{0,31}$/)
      .optional(),
    foreign: pathArg.optional(),
  })
  .strict();

export type SpikeArgs = z.infer<typeof spikeArgsSchema>;

const FLAG_TO_KEY: Record<string, keyof SpikeArgs> = {
  '--spike': 'spike',
  '--out': 'out',
  '--user-data': 'userData',
  '--phase': 'phase',
  '--foreign': 'foreign',
};

/**
 * Reads `--name=value` flags this harness understands. Other argv entries (the Electron
 * executable, the app path, Chromium's own switches) are ignored here; the startup guard
 * decides separately whether any of them are unsafe.
 */
export function parseSpikeArgs(
  argv: readonly string[],
): { ok: true; args: SpikeArgs } | { ok: false; message: string } {
  const raw: Record<string, string> = {};
  for (const entry of argv) {
    const eq = entry.indexOf('=');
    if (eq < 0) continue;
    const key = FLAG_TO_KEY[entry.slice(0, eq)];
    if (key) raw[key] = entry.slice(eq + 1);
  }
  const parsed = spikeArgsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  }
  return { ok: true, args: parsed.data };
}
