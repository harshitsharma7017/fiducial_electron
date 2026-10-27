// Writes allowlisted log records as JSON lines to stderr. A rotating file sink comes later (M10).
import type { LogSink } from './logger';

export const consoleSink: LogSink = (record) => {
  console.error(JSON.stringify(record));
};
