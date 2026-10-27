// webPreferences assertion test (M2 test list; SEC-01, SEC-02).
import { describe, expect, it } from 'vitest';
import { appWindowPreferences } from '../src/main/security/web-preferences';

describe('appWindowPreferences', () => {
  it('locks the app window down and attaches only the given preload', () => {
    expect(appWindowPreferences('/p/index.js')).toEqual({
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      safeDialogs: true,
      preload: '/p/index.js',
    });
  });
});
