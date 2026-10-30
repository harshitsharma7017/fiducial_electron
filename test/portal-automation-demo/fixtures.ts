// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see src/demo/portal-automation/README.md).
// The New proposal form as the in-page agent reads it, from the signed-in form inspected in a
// local copy of the portal (synthetic data) on 29 Oct 2026, and a scripted page for the runner.
import type {
  AgentCommand,
  AgentResult,
  ClientMatch,
  ControlSnapshot,
  PageSnapshot,
  SessionInfo,
} from '../../src/demo/portal-automation/shared/protocol';

/** Ids as the portal's client master and user list hold them (24 hex digits). */
export const CLIENT_ID = 'c0ffee'.repeat(4);
export const OTHER_CLIENT_ID = 'decade'.repeat(4);
export const ADMIN_ID = 'a11ce0'.repeat(4);
export const MANAGER_ID = 'b0b0b0'.repeat(4);
export const LOCATION_IDS: Record<string, string> = {
  'Peenya cold store': '10ca71'.repeat(4),
  'City office': '20ca72'.repeat(4),
};
export const TEST_GSTIN = '29ZZZZZ0003Z1ZJ';

export function control(
  overrides: Partial<ControlSnapshot> & { primary: string },
): ControlSnapshot {
  return {
    label: overrides.primary,
    kind: 'text',
    name: null,
    value: '',
    checked: false,
    disabled: false,
    options: [],
    ...overrides,
  };
}

const LINE_OF_BUSINESS = [
  control({
    primary: 'Property',
    label: 'PropertyFire, burglary and the other property sections, by risk location.',
    kind: 'radio',
    name: 'line-of-business',
    value: 'PROPERTY',
  }),
  control({
    primary: 'Employee Benefits',
    label:
      'Employee BenefitsGroup health (GMC), group personal accident (GPA) and group term life (GTLI).',
    kind: 'radio',
    name: 'line-of-business',
    value: 'EB',
  }),
];

/** Before the line of business is chosen: only the choice is shown. */
export function lineChoiceSnapshot(): PageSnapshot {
  return {
    path: '/proposals/new',
    heading: 'New proposal',
    signInShown: false,
    controls: LINE_OF_BUSINESS.map((item) => ({ ...item })),
    submitButtons: [],
    chosenClient: null,
    clientChoices: [],
  };
}

export function formSnapshot(): PageSnapshot {
  return {
    path: '/proposals/new',
    heading: 'New proposal',
    signInShown: false,
    controls: [
      { ...LINE_OF_BUSINESS[0]!, checked: true },
      { ...LINE_OF_BUSINESS[1]! },
      control({
        primary: 'New business',
        label: 'New businessNo policy with us yet: start from a Data Sheet.',
        kind: 'radio',
        name: 'type',
        value: 'NEW',
        checked: true,
      }),
      control({
        primary: 'Renewal',
        label:
          'RenewalLast year’s policy is copied from the policy software as the Existing column.',
        kind: 'radio',
        name: 'type',
        value: 'EXISTING',
      }),
      control({ primary: 'Search clients by name or GSTIN', kind: 'search' }),
      control({ primary: 'Policy period from', kind: 'date', name: 'policyStart' }),
      control({ primary: 'Policy period to', kind: 'date', name: 'policyEnd' }),
      control({
        primary: 'Assigned to',
        kind: 'select',
        name: 'ownerId',
        value: ADMIN_ID,
        options: [
          { text: 'Demo Admin', value: ADMIN_ID },
          { text: 'Demo Manager', value: MANAGER_ID },
        ],
      }),
      control({ primary: 'Quotes needed by', kind: 'date', name: 'dueDate', value: '2026-11-05' }),
    ],
    submitButtons: ['Create proposal'],
    chosenClient: null,
    clientChoices: ['Sample Fabrics Pvt Ltd', 'Deccan Cold Chain LLP'],
  };
}

export function signInSnapshot(): PageSnapshot {
  return {
    path: '/login',
    heading: 'Sign in',
    signInShown: true,
    controls: [
      control({ primary: 'Email', kind: 'other', name: 'email' }),
      control({ primary: 'Password', kind: 'other', name: 'password' }),
    ],
    submitButtons: ['Sign in'],
    chosenClient: null,
    clientChoices: [],
  };
}

/**
 * A scripted portal page: answers snapshots from a sequence of states and applies set, check,
 * select-option and pick-client to the current form, as the real agent does. Records every
 * command it receives.
 */
export class FakePortalPage {
  readonly commands: AgentCommand[] = [];
  readonly loads: string[] = [];
  closed = false;
  private states: PageSnapshot[];
  private form: PageSnapshot | null = null;
  /** Client names the portal's client search can find. */
  clients = new Set(['Deccan Cold Chain LLP']);
  /** The client master as the portal's API lists it (find-clients). */
  clientMaster: ClientMatch[] = [
    { id: CLIENT_ID, name: 'Deccan Cold Chain LLP', gstin: TEST_GSTIN },
  ];
  /** The GSTIN the form's client card shows once the client is chosen (undefined: unreadable). */
  formGstin: string | null | undefined = TEST_GSTIN;
  /** The chosen client's risk locations; the portal ticks them all when the client is chosen. */
  clientLocations = ['Peenya cold store', 'City office'];
  /** Values the form refuses to keep (read back differently). */
  rejects = new Set<string>();
  /** What the portal's session check answers. */
  session: SessionInfo = {
    signedIn: true,
    name: 'Demo Admin',
    userId: ADMIN_ID,
    canCreateProperty: true,
  };

  constructor(states: PageSnapshot[]) {
    this.states = states;
  }

  protected current(): PageSnapshot {
    if (this.form) return this.form;
    const next = this.states.length > 1 ? this.states.shift()! : this.states[0]!;
    if (next.controls.some((item) => item.primary === 'Policy period from')) this.form = next;
    return next;
  }

  load(url: string): Promise<void> {
    this.loads.push(url);
    return Promise.resolve();
  }

  currentUrl(): string {
    return 'https://portal.example.test/proposals/new';
  }

  isClosed(): boolean {
    return this.closed;
  }

  blockedWrites(): number {
    return 0;
  }

  /** Someone ticks or unticks a risk location in the portal window. */
  tickLocation(name: string, checked: boolean): void {
    for (const item of this.current().riskLocations ?? []) {
      if (item.name === name) item.checked = checked;
    }
  }

  run(command: AgentCommand): Promise<AgentResult> {
    this.commands.push(command);
    const page = this.current();
    const find = (primary: string, value?: string) =>
      page.controls.filter(
        (item) => item.primary === primary && (value === undefined || item.value === value),
      );
    switch (command.op) {
      case 'snapshot':
        return Promise.resolve({ ok: true, snapshot: structuredClone(page) });
      case 'guard':
        return Promise.resolve({ ok: true });
      case 'check': {
        const [target] = find(command.target.primary, command.target.value);
        if (!target) return Promise.resolve({ ok: false, reason: 'not-found' });
        for (const item of page.controls) {
          if (item.kind === 'radio' && item.name === target.name) item.checked = false;
        }
        target.checked = true;
        if (target.name === 'line-of-business') this.form = formSnapshot();
        return Promise.resolve({ ok: true });
      }
      case 'set': {
        const [target] = find(command.target.primary);
        if (!target) return Promise.resolve({ ok: false, reason: 'not-found' });
        target.value = this.rejects.has(command.target.primary) ? '' : command.value;
        return Promise.resolve({ ok: true });
      }
      case 'select-option': {
        const [target] = find(command.target.primary);
        const option = target?.options.find((item) => item.text === command.optionText);
        if (!target || !option) return Promise.resolve({ ok: false, reason: 'no-match' });
        target.value = option.value;
        return Promise.resolve({ ok: true });
      }
      case 'pick-client': {
        if (!this.clients.has(command.name))
          return Promise.resolve({ ok: false, reason: 'no-match' });
        page.chosenClient = command.name;
        page.chosenClientGstin = this.formGstin;
        page.riskLocations = this.clientLocations.map((name) => ({ name, checked: true }));
        return Promise.resolve({ ok: true });
      }
      case 'session':
        return Promise.resolve({ ok: true, session: { ...this.session } });
      case 'find-clients':
        return Promise.resolve({
          ok: true,
          clients: this.clientMaster.filter((client) => client.name === command.name),
        });
      case 'client-locations':
        return Promise.resolve(
          command.clientId === CLIENT_ID
            ? {
                ok: true,
                locations: this.clientLocations.map((name) => ({
                  id: LOCATION_IDS[name] ?? 'f'.repeat(24),
                  name,
                })),
              }
            : { ok: false, reason: 'not-found' },
        );
      // Creation and read-back: the full-workflow page (full-workflow.test.ts) answers these.
      case 'create':
      case 'read-proposal':
      case 'recent-proposals':
      case 'client-proposals':
        return Promise.resolve({ ok: false, reason: 'failed' });
    }
  }
}
