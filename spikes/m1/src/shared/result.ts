// Spike result format. Results are written as JSON evidence, so they must never contain
// secrets, keys, cookie values or personal data: only names, booleans, sizes and hashes.
import { z } from 'zod';

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string().max(2000),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

export const checkSchema = z
  .object({
    id: z.string().min(1).max(64),
    description: z.string().min(1).max(300),
    expected: jsonValue,
    actual: jsonValue,
    pass: z.boolean(),
  })
  .strict();

export type Check = z.infer<typeof checkSchema>;

export const spikeResultSchema = z
  .object({
    spike: z.string(),
    phase: z.string().nullable(),
    status: z.enum(['pass', 'fail']),
    startedAt: z.string(),
    environment: z.record(z.string(), jsonValue),
    checks: z.array(checkSchema),
    facts: z.record(z.string(), jsonValue),
  })
  .strict();

export type SpikeResult = z.infer<typeof spikeResultSchema>;

export function check(
  id: string,
  description: string,
  expected: unknown,
  actual: unknown,
  pass: boolean,
): Check {
  return checkSchema.parse({ id, description, expected, actual, pass });
}
