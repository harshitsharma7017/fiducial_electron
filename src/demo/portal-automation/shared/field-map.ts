// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// How the demo proposal maps onto the portal's New proposal form (/proposals/new). Every target
// below was read from the rendered, signed-in form (Fiducial_frontend new-proposal-form.tsx at
// 4593f4a, inspected in a local copy of the portal on 29 Oct 2026): the label's first line, the
// control type and, where the form sets one, its name and value. Nothing is guessed: a field the
// form does not have is listed in UNMAPPED with the reason, and is never typed anywhere.
import type { DemoProposal } from './demo-data';
import type { ControlTarget } from './protocol';

export const NEW_PROPOSAL_PATH = '/proposals/new';

/** Shown before the form for users who may create both lines; the demo chooses Property. */
export const PROPERTY_LINE: ControlTarget = {
  primary: 'Property',
  kind: 'radio',
  name: 'line-of-business',
  value: 'PROPERTY',
};

/** The form is ready once its policy period is on the page. */
export const FORM_READY_LABEL = 'Policy period from';

/**
 * The form's final action ("Create renewal" on a renewal, which FORBIDDEN_ACTION also names). The
 * demo stops before it and never clicks it.
 */
export const FINAL_ACTION = 'Create proposal';

/** Buttons and links the demo must never press, whatever the form calls them. */
export const FORBIDDEN_ACTION = /\b(create|save|submit|send|publish|approve|delete|confirm)\b/i;

export type FieldMapping =
  | {
      key: string;
      label: string;
      action: 'check';
      target: (data: DemoProposal) => ControlTarget;
      display: (data: DemoProposal) => string;
    }
  | {
      key: string;
      label: string;
      action: 'set' | 'select-option' | 'pick-client';
      target: ControlTarget;
      value: (data: DemoProposal) => string;
    };

/** In the order the form is filled: the case type first, as it changes the form below it. */
export const FIELD_MAP: readonly FieldMapping[] = [
  {
    key: 'caseType',
    label: 'Type of case',
    action: 'check',
    target: (data) =>
      data.caseType === 'NEW'
        ? { primary: 'New business', kind: 'radio', name: 'type', value: 'NEW' }
        : { primary: 'Renewal', kind: 'radio', name: 'type', value: 'EXISTING' },
    display: (data) => (data.caseType === 'NEW' ? 'New business' : 'Renewal'),
  },
  {
    key: 'insuredName',
    label: 'Insured (client search)',
    action: 'pick-client',
    target: { primary: 'Search clients by name or GSTIN', kind: 'search' },
    value: (data) => data.insuredName,
  },
  {
    key: 'policyStart',
    label: 'Policy period from',
    action: 'set',
    target: { primary: 'Policy period from', kind: 'date', name: 'policyStart' },
    value: (data) => data.policyStart,
  },
  {
    key: 'policyEnd',
    label: 'Policy period to',
    action: 'set',
    target: { primary: 'Policy period to', kind: 'date', name: 'policyEnd' },
    value: (data) => data.policyEnd,
  },
  {
    key: 'assignedTo',
    label: 'Assigned to',
    action: 'select-option',
    target: { primary: 'Assigned to', kind: 'select', name: 'ownerId' },
    value: (data) => data.assignedTo,
  },
  {
    key: 'quotesNeededBy',
    label: 'Quotes needed by',
    action: 'set',
    target: { primary: 'Quotes needed by', kind: 'date', name: 'dueDate' },
    value: (data) => data.quotesNeededBy,
  },
];

/** Demo data the New proposal form has no field for, and why it is not filled. */
export const UNMAPPED: readonly { key: string; label: string; reason: string }[] = [
  {
    key: 'contactEmail',
    label: 'Contact email',
    reason: 'Not on the New proposal form: contacts are kept on the client in the client master.',
  },
  {
    key: 'risk.occupancy',
    label: 'Occupancy',
    reason: 'Not on the New proposal form: the occupancy comes from the chosen client.',
  },
  {
    key: 'risk.location',
    label: 'Risk location',
    reason:
      'Not on the New proposal form: the client’s risk locations are listed and ticked once the client is chosen.',
  },
  ...(
    [
      ['risk.buildingSumInsured', 'Building sum insured'],
      ['risk.plantSumInsured', 'Plant & machinery sum insured'],
      ['risk.stockSumInsured', 'Stock sum insured'],
    ] as const
  ).map(([key, label]) => ({
    key,
    label,
    reason:
      'Entered on the Data Sheet of a created case. The demo never creates a case, so it is not filled.',
  })),
  {
    key: 'dataSheetFile',
    label: 'Client’s Data Sheet (optional)',
    reason: 'A file upload: the demo does not choose files.',
  },
];
