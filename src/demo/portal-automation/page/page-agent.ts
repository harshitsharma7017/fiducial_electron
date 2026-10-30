/// <reference lib="dom" />
// DEMO ONLY — TEMPORARY FEATURE (portal automation demo; see ../README.md).
// The in-page agent. The main process sends its source to the portal window and runs it in an
// isolated world (the page's scripts cannot see or change it), once per command. It must stay
// self-contained: no imports and no outside references, as only its source text travels.
//
// It reads labelled controls, sets a value the way typing would (so React sees the change),
// clicks a radio or a client in the client search, and blocks form submission in the window.
// It presses a submit button only for the full workflow's `create` command, which the main
// process sends once, after the user confirmed, where creation is allowed: it then lets
// exactly one submit through and presses the one button whose text is exactly the reviewed action.
// Its reads of the portal's API are same-origin GET requests (who is signed in, a proposal, the
// clients named exactly as the insured, a client's risk locations and proposals).
import type { AgentCommand, AgentResult } from '../shared/protocol';

export async function portalPageAgent(command: AgentCommand): Promise<AgentResult> {
  const normalise = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  type Kind =
    'text' | 'search' | 'date' | 'radio' | 'checkbox' | 'file' | 'select' | 'textarea' | 'other';

  const kindOf = (field: Field): Kind => {
    if (field instanceof HTMLSelectElement) return 'select';
    if (field instanceof HTMLTextAreaElement) return 'textarea';
    const type = field.type;
    return type === 'text' ||
      type === 'search' ||
      type === 'date' ||
      type === 'radio' ||
      type === 'checkbox' ||
      type === 'file'
      ? type
      : 'other';
  };

  // A radio card's label holds a title and a hint: its first text-only element is the title.
  const primaryOf = (label: HTMLLabelElement): string => {
    const leaf = [...label.querySelectorAll('span, p, strong')].find(
      (element) => element.children.length === 0 && normalise(element.textContent) !== '',
    );
    return normalise(leaf ? leaf.textContent : label.textContent);
  };

  const labelled = (): { label: HTMLLabelElement; field: Field }[] =>
    [...document.querySelectorAll('label')].flatMap((label) => {
      const field = label.control;
      return field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
        ? [{ label, field }]
        : [];
    });

  const chosenClient = (): string | null => {
    const change = [...document.querySelectorAll('button')].find(
      (button) => normalise(button.textContent) === 'Change client',
    );
    const name = change?.parentElement?.querySelector('span');
    return name ? normalise(name.textContent) : null;
  };

  // The chosen client's card: its name, then "<GSTIN or No GSTIN> · city, state · Occupancy …".
  const chosenClientGstin = (): string | null | undefined => {
    const change = [...document.querySelectorAll('button')].find(
      (button) => normalise(button.textContent) === 'Change client',
    );
    const detail = change?.parentElement?.querySelectorAll('span')[1];
    const first = normalise(detail?.textContent).split('·')[0]?.trim() ?? '';
    if (first === 'No GSTIN') return null;
    return /^[0-9A-Z]{15}$/.test(first) ? first : undefined;
  };

  const clientButtons = (): { name: string; button: HTMLButtonElement }[] =>
    [...document.querySelectorAll('ul[aria-label="Clients"] button')].flatMap((button) => {
      const name = button.querySelector('span');
      return button instanceof HTMLButtonElement && name
        ? [{ name: normalise(name.textContent), button }]
        : [];
    });

  const snapshot = () => ({
    path: location.pathname,
    heading: normalise(document.querySelector('h1')?.textContent),
    signInShown: document.querySelector('input[type="password"]') !== null,
    controls: labelled().map(({ label, field }) => ({
      label: normalise(label.textContent),
      primary: primaryOf(label),
      kind: kindOf(field),
      name: field.getAttribute('name'),
      value: field.value,
      checked: field instanceof HTMLInputElement ? field.checked : false,
      disabled: field.disabled,
      options:
        field instanceof HTMLSelectElement
          ? [...field.options].map((option) => ({
              text: normalise(option.textContent),
              value: option.value,
            }))
          : [],
    })),
    submitButtons: [...document.querySelectorAll('button[type="submit"], input[type="submit"]')]
      .map((button) => normalise(button.textContent || (button as HTMLInputElement).value))
      .filter((text) => text !== ''),
    chosenClient: chosenClient(),
    chosenClientGstin: chosenClientGstin(),
    clientChoices: clientButtons().map((choice) => choice.name),
    alerts: [...document.querySelectorAll('[role="alert"]')]
      .map((element) => normalise(element.textContent))
      .filter((text) => text !== ''),
    // The portal ticks every location of the chosen client; the agent never changes them.
    riskLocations: [...document.querySelectorAll('fieldset')]
      .filter((set) => normalise(set.querySelector('legend')?.textContent) === 'Risk locations')
      .flatMap((set) => [...set.querySelectorAll('[role="checkbox"]')])
      .map((box) => ({
        name: normalise(
          document.querySelector(`label[for="${CSS.escape(box.id)}"] span`)?.textContent,
        ),
        checked: box.getAttribute('aria-checked') === 'true',
      })),
  });

  // Same-origin, read-only GET of the portal's own API, with the page's session cookie.
  const getJson = async (path: string): Promise<{ status: number; body: unknown }> => {
    const response = await fetch(path, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body };
  };

  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  const record = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const readback = (value: unknown) => {
    const proposal = record(value);
    const client = record(proposal['client']);
    const owner = record(proposal['owner']);
    const locations = proposal['locations'];
    return {
      id: text(proposal['id']),
      reference: text(proposal['reference']),
      type: text(proposal['type']),
      stage: text(proposal['stage']),
      clientName: text(client['name']),
      clientId: text(client['id']),
      clientGstin: typeof client['gstin'] === 'string' ? client['gstin'] : null,
      ownerName: text(owner['name']),
      ownerId: text(owner['id']),
      locationIds: Array.isArray(locations)
        ? locations.map((item) => text(record(item)['locationId']))
        : null,
      policyStart: typeof proposal['policyStart'] === 'string' ? proposal['policyStart'] : null,
      policyEnd: typeof proposal['policyEnd'] === 'string' ? proposal['policyEnd'] : null,
      dueDate: text(proposal['dueDate']),
      createdAt: text(proposal['createdAt']),
    };
  };

  type Target = { primary: string; kind: Kind; name?: string; value?: string };
  const find = (target: Target): Field | 'not-found' | 'ambiguous' => {
    const matches = labelled().filter(
      ({ label, field }) =>
        primaryOf(label) === target.primary &&
        kindOf(field) === target.kind &&
        (target.name === undefined || field.getAttribute('name') === target.name) &&
        (target.value === undefined || field.value === target.value),
    );
    if (matches.length === 0) return 'not-found';
    if (matches.length > 1) return 'ambiguous';
    return matches[0]!.field;
  };

  // Sets the value through the element's own setter and fires input and change, as typing does,
  // so React and react-hook-form record it.
  const typeInto = (field: Field, value: string) => {
    const prototype =
      field instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : field instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    field.focus();
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.blur();
  };

  switch (command.op) {
    case 'snapshot':
      return { ok: true, snapshot: snapshot() };

    case 'guard': {
      // Submitting is blocked in this window: the capture listener runs before the page's own.
      // Only the sign-in form may submit, so the user can sign in normally, plus the one submit
      // a confirmed `create` command allows (the allowance is used up by that submit).
      const flag = '__fqfPortalDemoGuard';
      const allowance = '__fqfPortalDemoCreateOnce';
      const scope = window as unknown as Record<string, boolean>;
      // What a blocked save says: in the full workflow (a banner is given), where to create it.
      const texts = window as unknown as Record<string, string>;
      texts['__fqfPortalDemoBlockedText'] = command.banner
        ? 'Not saved from this window. To create the proposal, use the review in the Quote Fetcher: tick the box, then Create proposal there.'
        : 'DEMO ONLY — saving is disabled in this window.';
      if (!scope[flag]) {
        scope[flag] = true;
        window.addEventListener(
          'submit',
          (event) => {
            if (location.pathname === '/login') return;
            if (scope[allowance] && location.pathname === '/proposals/new') {
              scope[allowance] = false;
              return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            const banner = document.getElementById('fqf-portal-demo-banner');
            if (banner) banner.textContent = texts['__fqfPortalDemoBlockedText'] ?? '';
          },
          true,
        );
      }
      if (!document.getElementById('fqf-portal-demo-banner')) {
        const banner = document.createElement('div');
        banner.id = 'fqf-portal-demo-banner';
        banner.setAttribute('role', 'status');
        banner.textContent =
          command.banner ?? 'DEMO ONLY — synthetic data. This window never saves or submits.';
        Object.assign(banner.style, {
          position: 'fixed',
          left: '50%',
          bottom: '12px',
          transform: 'translateX(-50%)',
          zIndex: '2147483647',
          padding: '8px 14px',
          borderRadius: '6px',
          background: '#7a1f1f',
          color: '#ffffff',
          font: '600 13px system-ui, sans-serif',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          pointerEvents: 'none',
        });
        document.body.appendChild(banner);
      }
      return { ok: true };
    }

    case 'set': {
      const field = find(command.target);
      if (typeof field === 'string') return { ok: false, reason: field };
      if (field.disabled) return { ok: false, reason: 'disabled' };
      typeInto(field, command.value);
      return { ok: true, snapshot: snapshot() };
    }

    case 'check': {
      const field = find(command.target);
      if (typeof field === 'string') return { ok: false, reason: field };
      if (field.disabled) return { ok: false, reason: 'disabled' };
      if (!(field instanceof HTMLInputElement) || field.type !== 'radio') {
        return { ok: false, reason: 'not-found' };
      }
      if (!field.checked) field.click();
      return { ok: true, snapshot: snapshot() };
    }

    case 'select-option': {
      const field = find(command.target);
      if (typeof field === 'string') return { ok: false, reason: field };
      if (!(field instanceof HTMLSelectElement)) return { ok: false, reason: 'not-found' };
      if (field.disabled) return { ok: false, reason: 'disabled' };
      const options = [...field.options].filter(
        (option) => normalise(option.textContent) === command.optionText,
      );
      if (options.length !== 1) return { ok: false, reason: 'no-match' };
      typeInto(field, options[0]!.value);
      return { ok: true, snapshot: snapshot() };
    }

    case 'pick-client': {
      if (chosenClient() === command.name) return { ok: true, snapshot: snapshot() };
      const field = find(command.target);
      if (typeof field === 'string') return { ok: false, reason: field };
      typeInto(field, command.name);
      // The search waits for typing to stop, then asks the portal: give the list time to update,
      // and choose only a client whose name is exactly the demo's (never the nearest one).
      const until = Date.now() + command.timeoutMs;
      while (Date.now() < until) {
        await sleep(300);
        const exact = clientButtons().filter((choice) => choice.name === command.name);
        if (exact.length === 1) {
          exact[0]!.button.click();
          await sleep(300);
          return chosenClient() === command.name
            ? { ok: true, snapshot: snapshot() }
            : { ok: false, reason: 'no-match' };
        }
        const empty = [...document.querySelectorAll('h2, h3, p')].some((element) =>
          normalise(element.textContent).startsWith('No clients match'),
        );
        if (empty) return { ok: false, reason: 'no-match' };
      }
      return { ok: false, reason: 'timeout' };
    }

    case 'session': {
      const { status, body } = await getJson('/api/proxy/auth/me');
      if (status === 401)
        return { ok: true, session: { signedIn: false, name: null, canCreateProperty: false } };
      if (status !== 200) return { ok: false, reason: 'failed' };
      const user = record(body);
      const permissions = Array.isArray(user['permissions']) ? user['permissions'] : [];
      return {
        ok: true,
        session: {
          signedIn: true,
          name: text(user['name']) || null,
          userId: text(user['id']) || null,
          // Creating needs property.create; reading the new proposal back needs property.view.
          canCreateProperty:
            permissions.includes('property.create') && permissions.includes('property.view'),
        },
      };
    }

    case 'create': {
      if (location.pathname !== '/proposals/new') return { ok: false, reason: 'not-found' };
      const buttons = [...document.querySelectorAll('button')].filter(
        (button) => button.type === 'submit' && normalise(button.textContent) === command.action,
      );
      if (buttons.length !== 1)
        return { ok: false, reason: buttons.length ? 'ambiguous' : 'not-found' };
      const button = buttons[0]!;
      if (button.disabled) return { ok: false, reason: 'disabled' };
      (window as unknown as Record<string, boolean>)['__fqfPortalDemoCreateOnce'] = true;
      button.click();
      return { ok: true };
    }

    case 'read-proposal': {
      if (!/^[0-9a-f]{24}$/.test(command.id)) return { ok: false, reason: 'not-found' };
      const { status, body } = await getJson(`/api/proxy/proposals/${command.id}`);
      if (status === 404) return { ok: false, reason: 'not-found' };
      if (status !== 200) return { ok: false, reason: 'failed' };
      return { ok: true, proposal: readback(body) };
    }

    case 'recent-proposals': {
      // The newest 100 (the documented maximum page), newest first.
      const { status, body } = await getJson('/api/proxy/proposals?limit=100');
      if (status !== 200) return { ok: false, reason: 'failed' };
      const items = record(body)['items'];
      return { ok: true, proposals: Array.isArray(items) ? items.map(readback) : [] };
    }

    // The three reads below page through the portal's list with its cursor, at most `pages` pages
    // of 100; a list that does not end within them is reported as failed, never as complete.
    case 'find-clients': {
      const wanted = normalise(command.name);
      if (wanted === '') return { ok: false, reason: 'no-match' };
      const clients: { id: string; name: string; gstin: string | null }[] = [];
      let cursor = '';
      for (let page = 0; page < 10; page += 1) {
        const query = new URLSearchParams({ q: wanted.slice(0, 100), limit: '100' });
        if (cursor) query.set('cursor', cursor);
        const { status, body } = await getJson(`/api/proxy/clients?${query.toString()}`);
        if (status !== 200) return { ok: false, reason: 'failed' };
        const items = record(body)['items'];
        for (const item of Array.isArray(items) ? items : []) {
          const client = record(item);
          if (normalise(text(client['name'])) !== wanted) continue;
          clients.push({
            id: text(client['id']),
            name: normalise(text(client['name'])),
            gstin: typeof client['gstin'] === 'string' ? client['gstin'] : null,
          });
        }
        cursor = text(record(body)['nextCursor']);
        if (!cursor) return { ok: true, clients };
      }
      return { ok: false, reason: 'failed' };
    }

    case 'client-locations': {
      if (!/^[0-9a-f]{24}$/i.test(command.clientId)) return { ok: false, reason: 'not-found' };
      const locations: { id: string; name: string }[] = [];
      let cursor = '';
      for (let page = 0; page < 20; page += 1) {
        const query = new URLSearchParams({ limit: '100' });
        if (cursor) query.set('cursor', cursor);
        const { status, body } = await getJson(
          `/api/proxy/clients/${command.clientId}/locations?${query.toString()}`,
        );
        if (status !== 200) return { ok: false, reason: 'failed' };
        const items = record(body)['items'];
        for (const item of Array.isArray(items) ? items : []) {
          locations.push({
            id: text(record(item)['id']),
            name: normalise(text(record(item)['name'])),
          });
        }
        cursor = text(record(body)['nextCursor']);
        if (!cursor) return { ok: true, locations };
      }
      return { ok: false, reason: 'failed' };
    }

    case 'client-proposals': {
      if (!/^[0-9a-f]{24}$/i.test(command.clientId)) return { ok: false, reason: 'not-found' };
      const proposals: ReturnType<typeof readback>[] = [];
      let cursor = '';
      for (let page = 0; page < 5; page += 1) {
        const query = new URLSearchParams({ clientId: command.clientId, limit: '100' });
        if (cursor) query.set('cursor', cursor);
        const { status, body } = await getJson(`/api/proxy/proposals?${query.toString()}`);
        if (status !== 200) return { ok: false, reason: 'failed' };
        const items = record(body)['items'];
        proposals.push(...(Array.isArray(items) ? items.map(readback) : []));
        cursor = text(record(body)['nextCursor']);
        if (!cursor) return { ok: true, proposals };
      }
      return { ok: false, reason: 'failed' };
    }
  }
}
