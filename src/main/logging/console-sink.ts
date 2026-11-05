// Writes allowlisted log records as JSON lines to stderr. The rotating file sink is file-sink.ts.
import type { LogSink } from './logger';

export const consoleSink: LogSink = (record) => {
  console.error(JSON.stringify(record));
};
