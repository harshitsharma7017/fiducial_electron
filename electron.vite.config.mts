// Build configuration (DM-07, decided 27 Oct 2026: electron-vite + electron-builder + React).
// main and preload are emitted as CommonJS (package.json has no "type": "module"), which a
// sandboxed preload requires. Only zod is a runtime dependency; everything else is bundled.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    build: { sourcemap: false },
  },
  preload: {
    build: { sourcemap: false },
  },
  renderer: {
    plugins: [react()],
    build: { sourcemap: false },
  },
});
