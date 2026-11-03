// Records an insurer's quote flow while the advisor walks through it with a dummy client
// (src/shared/insurers/recording.ts says what is and is not kept).
//
// While recording, every window of the insurer (the portal and its pop-ups, including ones that
// open during the recording, such as a premium calculator) is drained every 700 ms
// (form-recorder-agent.ts), and the portal's own requests are noted: method, redacted address, resource type and, for request
// bodies, field names only. Every string is redacted again here before it is kept. On stop the
// recording is written to <userData>/recordings (owner-only), and its path is returned.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OnBeforeRequestListenerDetails, Session } from 'electron';
import type { PortalPage } from './portal-host';
import {
  bodyFieldNames,
  RECORDING_FORMAT,
  redactChoice,
  RECORDING_VERSION,
  redactText,
  redactUrl,
} from '../../shared/insurers/recording';
import type { Logger } from '../logging/logger';
import { formRecorderAgent, type RecordedEvent, type RecorderDrain } from './form-recorder-agent';

const AGENT_SOURCE = formRecorderAgent.toString();
const WORLD_ID = 1802;
const DRAIN_MS = 700;

export interface RecordingStatus {
  active: boolean;
  pages: number;
  events: number;
  /** Where the last finished recording was saved, if any. */
  file: string | null;
}

interface PageEntry {
  at: string;
  /** Which window: 0 for the first one seen, then each pop-up in the order it appeared. */
  window: number;
  url: string;
  title: string;
  snapshot: unknown;
}

type Entry =
  | (RecordedEvent & { page: number })
  | {
      at: number;
      kind: 'request';
      method: string;
      url: string;
      resourceType: string;
      bodyFields: string[] | null;
    }
  | { at: number; kind: 'page'; page: number; window: number; url: string };

interface Active {
  insurer: string;
  windows: () => PortalPage[];
  session: Session;
  startedAt: Date;
  pages: PageEntry[];
  entries: Entry[];
  /** Per window (by webContents id): its number, its last address and its latest page. */
  seen: Map<number, { window: number; lastUrl: string; page: number }>;
  timer: NodeJS.Timeout;
}

/**
 * Redacts every string in a captured structure: addresses ("url") lose parameter values, the
 * portal's own choices (inside "options"/"option", and radio/checkbox "value") keep their digits,
 * and all other text has long numbers and emails masked.
 */
export function sanitise(value: unknown, key = '', choice = false): unknown {
  if (typeof value === 'string') {
    if (key === 'url') return redactUrl(value);
    return choice || key === 'value' ? redactChoice(value) : redactText(value, 200);
  }
  if (Array.isArray(value)) return value.map((v) => sanitise(v, '', choice));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        sanitise(v, k, choice || k === 'options' || k === 'option'),
      ]),
    );
  }
  return value;
}

export interface FormRecorder {
  /** Records every window `windows()` returns at each drain (they share one session). */
  start(insurer: string, windows: () => PortalPage[]): void;
  stop(insurer: string): Promise<string | null>;
  status(insurer: string): RecordingStatus | null;
}

export function createFormRecorder(deps: { dir: string; logger: Logger }): FormRecorder {
  const active = new Map<string, Active>();
  const lastFile = new Map<string, string>();

  const drainWindow = async (rec: Active, win: PortalPage): Promise<void> => {
    if (win.isDestroyed()) return;
    const id = win.webContents.id;
    let result: RecorderDrain;
    try {
      result = (await win.webContents.executeJavaScriptInIsolatedWorld(WORLD_ID, [
        { code: `(${AGENT_SOURCE})()` },
      ])) as RecorderDrain;
    } catch {
      return; // the page is between loads; the next drain catches up
    }
    let seen = rec.seen.get(id);
    if (!seen) {
      seen = { window: rec.seen.size, lastUrl: '', page: -1 };
      rec.seen.set(id, seen);
    }
    const url = redactUrl(result.url);
    if (url !== seen.lastUrl) {
      rec.entries.push({
        at: Date.now(),
        kind: 'page',
        page: rec.pages.length,
        window: seen.window,
        url,
      });
      seen.lastUrl = url;
    }
    if (result.snapshot) {
      seen.page = rec.pages.length;
      rec.pages.push({
        at: new Date().toISOString(),
        window: seen.window,
        url,
        title: redactText(result.title, 120),
        snapshot: sanitise(result.snapshot),
      });
    }
    for (const event of result.events) {
      rec.entries.push({ ...(sanitise(event) as RecordedEvent), page: seen.page });
    }
  };

  const drain = async (rec: Active): Promise<void> => {
    for (const win of rec.windows()) await drainWindow(rec, win);
  };

  const onRequest = (rec: Active) => (details: OnBeforeRequestListenerDetails) => {
    const interesting =
      details.method !== 'GET' ||
      details.resourceType === 'xhr' ||
      details.resourceType === ('fetch' as string);
    if (!interesting || rec.entries.length > 5000) return;
    let bodyFields: string[] | null = null;
    const bytes = details.uploadData?.[0]?.bytes;
    if (bytes && bytes.length < 256 * 1024) {
      const body = bytes.toString('utf8');
      const guess = /^\s*[[{]/.test(body)
        ? 'application/json'
        : /^[\w.%[\]-]+=/.test(body)
          ? 'application/x-www-form-urlencoded'
          : '';
      bodyFields = bodyFieldNames(body, guess);
    }
    rec.entries.push({
      at: Date.now(),
      kind: 'request',
      method: details.method,
      url: redactUrl(details.url),
      resourceType: details.resourceType,
      bodyFields,
    });
  };

  return {
    start: (insurer, windows) => {
      const first = windows()[0];
      if (active.has(insurer) || !first) return;
      const rec: Active = {
        insurer,
        windows,
        session: first.webContents.session,
        startedAt: new Date(),
        pages: [],
        entries: [],
        seen: new Map(),
        timer: setInterval(() => void drain(rec), DRAIN_MS),
      };
      active.set(insurer, rec);
      rec.session.webRequest.onBeforeRequest((details, callback) => {
        onRequest(rec)(details);
        callback({});
      });
      void drain(rec);
      deps.logger.info('insurer.recording-started', { insurer });
    },

    stop: async (insurer) => {
      const rec = active.get(insurer);
      if (!rec) return null;
      clearInterval(rec.timer);
      await drain(rec);
      active.delete(insurer);
      rec.session.webRequest.onBeforeRequest(null);
      const endedAt = new Date();
      mkdirSync(deps.dir, { recursive: true, mode: 0o700 });
      const file = join(deps.dir, `${insurer}-${endedAt.toISOString().replace(/[:.]/g, '-')}.json`);
      writeFileSync(
        file,
        `${JSON.stringify(
          {
            format: RECORDING_FORMAT,
            version: RECORDING_VERSION,
            insurer,
            startedAt: rec.startedAt.toISOString(),
            endedAt: endedAt.toISOString(),
            note: 'Structure only: typed values are never recorded (lengths only); long numbers and emails are masked.',
            pages: rec.pages,
            timeline: rec.entries,
          },
          null,
          1,
        )}\n`,
        { mode: 0o600 },
      );
      lastFile.set(insurer, file);
      deps.logger.info('insurer.recording-stopped', { insurer });
      return file;
    },

    status: (insurer) => {
      const rec = active.get(insurer);
      if (rec)
        return { active: true, pages: rec.pages.length, events: rec.entries.length, file: null };
      const file = lastFile.get(insurer);
      return file ? { active: false, pages: 0, events: 0, file } : null;
    },
  };
}
