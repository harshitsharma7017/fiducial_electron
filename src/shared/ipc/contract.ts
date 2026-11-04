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
import {
  vehicleInputSchema,
  vehicleRecordSchema,
  vehicleSummarySchema,
} from '../contracts/vehicle';
import { insurerIdSchema } from '../contracts/insurer';
import { ompTripSchema, passportNumberSchema, travelTripSchema } from '../contracts/travel';
import {
  travellerRecordSchema,
  travellerSchema,
  travellerSummarySchema,
} from '../contracts/traveller';
import { FILL_OUTCOMES } from '../insurers/fill-outcomes';
import { NIA_HEALTH_POLICIES } from '../insurers/nia-health';
import { niaTripSchema } from '../insurers/nia-travel';
import { niaRuralRunSchema } from '../insurers/nia-rural';
import { ruralClientSchema, ruralRecordSchema, ruralSummarySchema } from '../contracts/rural';
import {
  hasControlCharacter,
  LOGIN_AUTOMATION,
  LOGIN_BARRIERS,
  LOGIN_METHODS,
} from '../insurers/portals';
import { IPC_CHANNELS, type IpcChannel } from './channels';
import { IMPORT_KINDS } from '../import/import-kinds';
import { APP_ERROR_CODES } from './errors';

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

export const saveTravellerRequestSchema = z
  .object({
    /** Absent for a new travel client. */
    id: entityIdSchema.optional(),
    traveller: travellerSchema,
    /** Kept apart in the secret vault: absent keeps what is saved, null removes it. */
    aadhaar: z.union([aadhaarSchema, z.null()]).optional(),
    passport: z.union([passportNumberSchema, z.null()]).optional(),
  })
  .strict();
export type SaveTravellerRequest = z.input<typeof saveTravellerRequestSchema>;

/** A travel client as the renderer sees it: of its Aadhaar and passport numbers, only their last
 * four characters (or null if none is saved). */
export const travellerViewSchema = travellerRecordSchema.extend({
  aadhaarLastFour: z
    .string()
    .regex(/^\d{4}$/)
    .nullable(),
  passportLastFour: z
    .string()
    .regex(/^[A-Z0-9]{4}$/)
    .nullable(),
});
export type TravellerView = z.infer<typeof travellerViewSchema>;

export const saveRuralRequestSchema = z
  .object({
    /** Absent for a new rural client. */
    id: entityIdSchema.optional(),
    rural: ruralClientSchema,
  })
  .strict();
export type SaveRuralRequest = z.input<typeof saveRuralRequestSchema>;

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

/** A client import (health clients, travel clients or vehicles), from an .xlsx or .csv file. */
const importKindSchema = z.enum(IMPORT_KINDS);

/**
 * A checked import file: each row's name, a short description, and whether it is new, already
 * saved, repeated earlier in the file, or has problems (by column; never a cell's value). The
 * checked records stay in the main process under `token` until saved (null: nothing to save).
 */
export const importPreviewSchema = z
  .object({
    token: z.uuid().nullable(),
    fileName: z.string().max(200),
    /** Why the file as a whole could not be read (then there are no rows). */
    problem: z.string().max(400).nullable(),
    /** Headers in the file the import does not know (not imported). */
    ignoredColumns: z.array(z.string().max(80)).max(50),
    rows: z
      .array(
        z
          .object({
            line: z.int().min(1).max(1_048_576),
            label: z.string().max(100),
            detail: z.string().max(200),
            status: z.enum(['new', 'saved-already', 'repeated', 'problems']),
            problems: z.array(z.string().max(300)).max(20),
          })
          .strict(),
      )
      .max(2000),
  })
  .strict();
export type ImportPreview = z.infer<typeof importPreviewSchema>;

export const importCommitResultSchema = z
  .object({
    saved: z.int().min(0),
    /** Duplicates left out. */
    skipped: z.int().min(0),
    /** Rows that could not be saved, by line, with the reason's code. */
    failed: z
      .array(z.object({ line: z.int().min(1), code: z.enum(APP_ERROR_CODES) }).strict())
      .max(2000),
  })
  .strict();
export type ImportCommitResult = z.infer<typeof importCommitResultSchema>;

/**
 * A quote run: motor quotes are for a saved vehicle; health quotes and the health e-proposals
 * (Family Medicare, Individual Health, Arogya Sanjeevani, Super Top-up, Yuvaan Health) are for a
 * health client;
 * the travel e-proposals (Overseas Travel, Overseas Mediclaim) for a travel client. E-proposals
 * are filled, never saved or submitted.
 */
export const quoteRunRequestSchema = z.discriminatedUnion('product', [
  z
    .object({ product: z.literal('motor'), vehicleId: entityIdSchema, insurerId: insurerIdSchema })
    .strict(),
  z
    .object({
      product: z.enum([
        'health',
        'fm-proposal',
        'ihp-proposal',
        'as-proposal',
        'stu-proposal',
        'yhp-proposal',
      ]),
      clientId: entityIdSchema,
      insurerId: insurerIdSchema,
      /** Health: the advisor confirms, for this quote, every member's good health declaration. */
      goodHealthConfirmed: z.boolean(),
    })
    .strict(),
  // New India health quote forms: the policy is chosen for this run.
  z
    .object({
      product: z.literal('nia-health'),
      clientId: entityIdSchema,
      insurerId: insurerIdSchema,
      policy: z.enum(NIA_HEALTH_POLICIES),
      /** The advisor confirms, for this quote, that no member has a listed condition. */
      goodHealthConfirmed: z.boolean(),
    })
    .strict(),
  // New India rural quote forms, for a rural client: the scheme and the like are for this run.
  z
    .object({
      product: z.literal('nia-rural'),
      ruralId: entityIdSchema,
      insurerId: insurerIdSchema,
      run: niaRuralRunSchema,
    })
    .strict(),
  // New India overseas travel quote forms, for a travel client: the trip is entered for this run.
  z
    .object({
      product: z.literal('nia-travel'),
      travellerId: entityIdSchema,
      insurerId: insurerIdSchema,
      trip: niaTripSchema,
      /** The advisor confirms no pre-existing illness, disease or disability, and no accident. */
      noPreExistingConfirmed: z.boolean(),
    })
    .strict(),
  // Travel e-proposals are for a travel client; the trip is entered for this run, never saved.
  z
    .object({
      product: z.literal('travel-proposal'),
      travellerId: entityIdSchema,
      insurerId: insurerIdSchema,
      trip: travelTripSchema,
    })
    .strict(),
  // Overseas Mediclaim e-proposals (B&H, SCHENGEN, Studies): the trip is entered for this run.
  z
    .object({
      product: z.literal('omp-proposal'),
      travellerId: entityIdSchema,
      insurerId: insurerIdSchema,
      trip: ompTripSchema,
    })
    .strict(),
]);

export type QuoteRunRequest = z.infer<typeof quoteRunRequestSchema>;

/** A tab of the app window: an insurer's page or a pop-up it opened (src/main/insurers/portal-host.ts). */
const portalTabIdSchema = z.string().regex(/^[a-z0-9-]{1,40}:\d{1,9}$/);
export const portalTabsSchema = z
  .object({
    version: z.int().min(1),
    tabs: z
      .array(
        z
          .object({
            id: portalTabIdSchema,
            insurerId: insurerIdSchema,
            title: z.string().max(120),
            kind: z.enum(['portal', 'popup']),
            loading: z.boolean(),
          })
          .strict(),
      )
      .max(50),
    /** The tab shown, or null for the app's own screens. */
    active: portalTabIdSchema.nullable(),
  })
  .strict();
export type PortalTabsView = z.infer<typeof portalTabsSchema>;

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
    request: quoteRunRequestSchema,
    response: quoteRunResultSchema,
  },
  [IPC_CHANNELS.portalsTabs]: {
    /** Answers once the tabs changed after version `since` (or after 20 seconds anyway). */
    request: z.object({ since: z.int().min(0) }).strict(),
    response: portalTabsSchema,
  },
  [IPC_CHANNELS.portalsShow]: {
    request: z.object({ tabId: portalTabIdSchema.nullable() }).strict(),
    response: z.object({ shown: z.literal(true) }).strict(),
  },
  [IPC_CHANNELS.portalsClose]: {
    request: z.object({ tabId: portalTabIdSchema }).strict(),
    response: z.object({ closed: z.literal(true) }).strict(),
  },
  [IPC_CHANNELS.portalsSetBounds]: {
    /** Where the insurer page goes in the app window, in its page's CSS pixels. */
    request: z
      .object({
        x: z.number().min(0).max(100_000),
        y: z.number().min(0).max(100_000),
        width: z.number().min(0).max(100_000),
        height: z.number().min(0).max(100_000),
      })
      .strict(),
    response: z.object({ set: z.literal(true) }).strict(),
  },
  [IPC_CHANNELS.clientsDelete]: {
    request: clientOnly,
    response: z.object({ deleted: z.boolean() }).strict(),
  },
  [IPC_CHANNELS.vehiclesList]: {
    request: z.object({}).strict(),
    response: z.object({ vehicles: z.array(vehicleSummarySchema).max(10_000) }).strict(),
  },
  [IPC_CHANNELS.vehiclesGet]: {
    request: clientOnly,
    response: vehicleRecordSchema,
  },
  [IPC_CHANNELS.vehiclesSave]: {
    request: z
      .object({
        /** Absent for a new vehicle. */
        id: entityIdSchema.optional(),
        saved: vehicleInputSchema,
      })
      .strict(),
    response: z.object({ id: entityIdSchema }).strict(),
  },
  [IPC_CHANNELS.vehiclesDelete]: {
    request: clientOnly,
    response: z.object({ deleted: z.boolean() }).strict(),
  },
  [IPC_CHANNELS.travellersList]: {
    request: z.object({}).strict(),
    response: z.object({ travellers: z.array(travellerSummarySchema).max(10_000) }).strict(),
  },
  [IPC_CHANNELS.travellersGet]: {
    request: clientOnly,
    response: travellerViewSchema,
  },
  [IPC_CHANNELS.travellersSave]: {
    request: saveTravellerRequestSchema,
    response: z.object({ id: entityIdSchema }).strict(),
  },
  [IPC_CHANNELS.travellersDelete]: {
    request: clientOnly,
    response: z.object({ deleted: z.boolean() }).strict(),
  },
  [IPC_CHANNELS.ruralList]: {
    request: z.object({}).strict(),
    response: z.object({ rural: z.array(ruralSummarySchema).max(10_000) }).strict(),
  },
  [IPC_CHANNELS.ruralGet]: {
    request: clientOnly,
    response: ruralRecordSchema,
  },
  [IPC_CHANNELS.ruralSave]: {
    request: saveRuralRequestSchema,
    response: z.object({ id: entityIdSchema }).strict(),
  },
  [IPC_CHANNELS.ruralDelete]: {
    request: clientOnly,
    response: z.object({ deleted: z.boolean() }).strict(),
  },
  [IPC_CHANNELS.importsTemplate]: {
    request: z.object({ kind: importKindSchema, format: z.enum(['xlsx', 'csv']) }).strict(),
    response: z.object({ saved: z.boolean() }).strict(),
  },
  [IPC_CHANNELS.importsPreview]: {
    /** Opens the file dialog; CANCELLED if the advisor closes it. */
    request: z.object({ kind: importKindSchema }).strict(),
    response: importPreviewSchema,
  },
  [IPC_CHANNELS.importsCommit]: {
    request: z.object({ token: z.uuid(), includeDuplicates: z.boolean() }).strict(),
    response: importCommitResultSchema,
  },
} as const satisfies Record<IpcChannel, { request: z.ZodType; response: z.ZodType }>;

export type IpcContract = typeof ipcContract;
export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]['request']>;
export type IpcResponse<C extends IpcChannel> = z.infer<IpcContract[C]['response']>;
