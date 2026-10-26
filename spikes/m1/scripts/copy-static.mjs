// Copies the static renderer page next to the compiled TypeScript output.
import { cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
cpSync(join(root, 'static/renderer'), join(root, 'dist/renderer'), { recursive: true });
