// Runs a command without environment variables that change how Electron starts (AR-19):
// ELECTRON_RUN_AS_NODE makes the binary behave as Node; NODE_OPTIONS can start an inspector.
// Usage: node scripts/run-clean-env.mjs <command> [args...]
import { spawn } from 'node:child_process';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('usage: run-clean-env.mjs <command> [args...]');
  process.exit(64);
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;

const child = spawn(command, args, {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
