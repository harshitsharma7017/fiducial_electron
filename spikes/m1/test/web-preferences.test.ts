import { describe, expect, it } from 'vitest';
import {
  appWindowPreferences,
  insurerViewPreferences,
  pdfRenderPreferences,
} from '../src/main/web-preferences';

const BASELINE = {
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
};

describe('webPreferences factories', () => {
  it('app window: locked down with a preload', () => {
    expect(appWindowPreferences('/p.js')).toMatchObject({ ...BASELINE, preload: '/p.js' });
  });

  it('insurer view: locked down, own persistent partition, never a preload', () => {
    const prefs = insurerViewPreferences('persist:insurer-mock-a');
    expect(prefs).toMatchObject({ ...BASELINE, partition: 'persist:insurer-mock-a' });
    expect(prefs.preload).toBeUndefined();
    expect(() => insurerViewPreferences('persist:shared')).toThrow();
  });

  it('PDF window: JavaScript disabled, non-persistent partition', () => {
    expect(pdfRenderPreferences('fqf-pdf')).toMatchObject({ ...BASELINE, javascript: false });
    expect(() => pdfRenderPreferences('persist:pdf')).toThrow();
  });
});
