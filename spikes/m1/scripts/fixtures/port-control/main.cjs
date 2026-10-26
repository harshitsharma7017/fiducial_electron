// Positive control for the debug-port probe: an Electron main with NO launch guard.
// It stays up for three seconds so the probe can observe whether and when a port opens.
const { app } = require('electron');

app.whenReady().then(() => setTimeout(() => app.quit(), 3000));
