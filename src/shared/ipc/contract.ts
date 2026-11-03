// Request and response schemas for every IPC channel. The main process validates requests
// before any handler runs and validates responses before they leave. Schemas are strict:
// unexpected fields are rejected, not ignored.
import { z } from 'zod';
import {
  aadhaarSchema,
  clientInputSchema,
  clientRecordSchema,
  clientSummarySchema,
} from '../contracts/client';
import { entityIdSchema } from '../contracts/common';
import { insurerIdSchema } from '../contracts/insurer';
import { FILL_OUTCOMES } from '../insurers/fill-outcomes';
import {
  hasControlCharacter,
  LOGIN_AUTOMATION,
  LOGIN_BARRIERS,
  LOGIN_METHODS,
} from '../insurers/portals';
import { IPC_CHANNELS, type IpcChannel } from './channels';

const shortText = (max: number) => z.string().min(1).max(max);

export const appInfoSchema = z
  .object({
    name: shortText(100),
    version: shortText(40),
    platform: z.enum(['darwin', 'win32', 'linux']),
    arch: shortText(20),
    electron: shortText(40),
    isPackaged: z.boolean(),
  })
  .strict();

export type AppInfo = z.infer<typeof appInfoSchema>;

/** One insurer portal as the advisor sees it. Never includes a user ID or password. */
export const insurerPortalViewSchema = z
  .object({
    id: insurerIdSchema,
    displayName: shortText(80),
    loginMethod: z.enum(LOGIN_METHODS),
    automation: z.enum(LOGIN_AUTOMATION),
    barrier: z.enum(LOGIN_BARRIERS),
    advisorNote: z.string().max(240),
    loginSaved: z.boolean(),
    windowOpen: z.boolean(),
    lastFill: z.enum(FILL_OUTCOMES).nullable(),
    /** When the insurer's saved session ends (ISO time), or null if none is running. */
    sessionEndsAt: z.iso.datetime().nullable(),
    /** Why the last session ended, if it ended while the app was running. */
    lastSessionEnd: z.enum(['expired', 'signed-out']).nullable(),
    /** Origins the portal tried to open that are not on its allowed list (at most 5). */
    blockedOrigins: z.array(z.string().max(200)).max(5),
    /** The form recorder: running, or where the last recording was saved (null if never used). */
    recording: z
      .object({
        active: z.boolean(),
        pages: z.int().min(0),
        events: z.int().min(0),
        file: z.string().max(1024).nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type InsurerPortalView = z.infer<typeof insurerPortalViewSchema>;

export const insurerPortalListSchema = z
  .object({
    /** False unless the insurer portals feature is switched on (FQF_INSURER_PORTALS=1). */
    enabled: z.boolean(),
    /** Null when the vault could not be opened (for example OS secure storage is unavailable). */
    vaultError: z.enum(['SECRET_STORE_UNAVAILABLE', 'STORAGE_ERROR']).nullable(),
    portals: z.array(insurerPortalViewSchema).max(20),
  })
  .strict();

export type InsurerPortalList = z.infer<typeof insurerPortalListSchema>;

/** Printable text without control characters (a sign-in detail is a single line). */
const singleLine = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => !hasControlCharacter(value), 'no control characters');

export const saveLoginRequestSchema = z
  .object({
    id: insurerIdSchema,
    username: singleLine(120),
    password: singleLine(256),
  })
  .strict();

export type SaveLoginRequest = z.infer<typeof saveLoginRequestSchema>;

const insurerOnly = z.object({ id: insurerIdSchema }).strict();
const clientOnly = z.object({ id: entityIdSchema }).strict();

export const clientListSchema = z
  .object({
    /** False unless the automation features are switched on (FQF_INSURER_PORTALS=1). */
    enabled: z.boolean(),
    storageError: z.enum(['SECRET_STORE_UNAVAILABLE', 'STORAGE_ERROR']).nullable(),
    clients: z.array(clientSummarySchema).max(10_000),
  })
  .strict();

export type ClientListResponse = z.infer<typeof clientListSchema>;

export const saveClientRequestSchema = z
  .object({
    /** Absent for a new client. */
    id: entityIdSchema.optional(),
    client: clientInputSchema,
    /** The Aadhaar number, kept apart in the secret vault: absent keeps what is saved, null
     * removes it. */
    aadhaar: z.union([aadhaarSchema, z.null()]).optional(),
  })
  .strict();

/** A client as the renderer sees it: the record, and of the Aadhaar number only its last four
 * digits (or null if none is saved). */
export const clientViewSchema = clientRecordSchema.extend({
  aadhaarLastFour: z
    .string()
    .regex(/^\d{4}$/)
    .nullable(),
});

export type ClientView = z.infer<typeof clientViewSchema>;

export type SaveClientRequest = z.input<typeof saveClientRequestSchema>;

export const quoteRunResultSchema = z
  .object({
    outcome: z.enum(['ready', 'refused', 'failed']),
    step: z.string().max(120).nullable(),
    message: z.string().max(1200),
    problems: z.array(z.string().max(400)).max(20),
    /** The premium read from the insurer's page (motor). */
    premium: z
      .object({ label: z.string().max(200), amount: z.string().max(40) })
      .strict()
      .optional(),
    /** E-proposals: what the advisor still fills by hand, and the insurer's messages about it. */
    toDo: z.array(z.string().max(400)).max(30).optional(),
  })
  .strict();

export type QuoteRunResultView = z.infer<typeof quoteRunResultSchema>;

export const ipcContract = {
  [IPC_CHANNELS.appGetInfo]: {
    request: z.object({}).strict(),
    response: appInfoSchema,
  },
  [IPC_CHANNELS.insurersList]: {
    request: z.object({}).strict(),
    response: insurerPortalListSchema,
  },
  [IPC_CHANNELS.insurersSaveLogin]: {
    request: saveLoginRequestSchema,
    response: z.object({ saved: z.literal(true) }).strict(),
  },
  [IPC_CHANNELS.insurersForgetLogin]: {
    request: insurerOnly,
    response: z.object({ forgotten: z.boolean() }).strict(),
  },
  [IPC_CHANNELS.insurersOpenPortal]: {
    request: insurerOnly,
    response: z.object({ opened: z.literal(true) }).strict(),
  },
  [IPC_CHANNELS.insurersSignOut]: {
    request: insurerOnly,
    response: z.object({ signedOut: z.boolean() }).strict(),
  },
  [IPC_CHANNELS.insurersRecord]: {
    request: z.object({ id: insurerIdSchema, action: z.enum(['start', 'stop']) }).strict(),
    response: z.object({ recording: z.boolean(), file: z.string().max(1024).nullable() }).strict(),
  },
  [IPC_CHANNELS.clientsList]: {
    request: z.object({}).strict(),
    response: clientListSchema,
  },
  [IPC_CHANNELS.clientsGet]: {
    request: clientOnly,
    response: clientViewSchema,
  },
  [IPC_CHANNELS.clientsSave]: {
    request: saveClientRequestSchema,
    response: z.object({ id: entityIdSchema }).strict(),
  },
  [IPC_CHANNELS.quotesRun]: {
    request: z
      .object({
        clientId: entityIdSchema,
        insurerId: insurerIdSchema,
        /** health / motor: premium calculators; fm-proposal: Family Medicare e-proposal (filled,
         * never saved or submitted). */
        product: z.enum(['health', 'motor', 'fm-proposal']),
        /** Health: the advisor confirms, for this quote, every member's good health declaration. */
        goodHealthConfirmed: z.boolean(),
      })
      .strict(),
    response: quoteRunResultSchema,
  },
  [IPC_CHANNELS.clientsDelete]: {
    request: clientOnly,
    response: z.object({ deleted: z.boolean() }).strict(),
  },
} as const satisfies Record<IpcChannel, { request: z.ZodType; response: z.ZodType }>;

export type IpcContract = typeof ipcContract;
export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]['request']>;
export type IpcResponse<C extends IpcChannel> = z.infer<IpcContract[C]['response']>;
