// Runs a command without environment variables that change how Electron starts (AR-19):
// ELECTRON_RUN_AS_NODE makes the binary behave as Node; NODE_OPTIONS can start an inspector.
// Usage: node scripts/run-clean-env.mjs [NAME=value ...] <command> [args...]
// Leading NAME=value arguments are set for the command (works the same on Windows, macOS, Linux).
import { spawn } from 'node:child_process';

const rest = process.argv.slice(2);
const settings = [];
while (rest.length > 0 && /^[A-Z_][A-Z0-9_]*=/.test(rest[0])) settings.push(rest.shift());
const [command, ...args] = rest;
if (!command) {
  console.error('usage: run-clean-env.mjs [NAME=value ...] <command> [args...]');
  process.exit(64);
}
const env = { ...process.env };
for (const setting of settings) {
  const at = setting.indexOf('=');
  env[setting.slice(0, at)] = setting.slice(at + 1);
}
// Removed last, so they cannot be set back by an argument either.
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;

const child = spawn(command, args, {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
