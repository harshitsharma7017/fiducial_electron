// Saved clients: the details quotes are fetched for, kept encrypted on this computer until the
// advisor deletes them. Members carry relationship and age only (data minimisation, C-05).
import { useCallback, useEffect, useState } from 'react';
import type { ClientInputRaw, ClientSummary } from '../../../shared/contracts/client';
import { RELATIONSHIPS, type Relationship } from '../../../shared/contracts/customer';
import type { ClientListResponse } from '../../../shared/ipc/contract';
import { PAISE_PER_RUPEE } from '../../../shared/money';

const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  self: 'Self',
  spouse: 'Spouse',
  son: 'Son',
  daughter: 'Daughter',
  father: 'Father',
  mother: 'Mother',
  father_in_law: 'Father-in-law',
  mother_in_law: 'Mother-in-law',
};

interface MemberDraft {
  relationship: Relationship;
  age: string;
}

interface Draft {
  id: string | null;
  name: string;
  phone: string;
  email: string;
  notes: string;
  pincode: string;
  members: MemberDraft[];
  withPreferences: boolean;
  coverType: 'individual' | 'floater';
  sumInsuredRupees: string;
  tenureYears: string;
}

const EMPTY: Draft = {
  id: null,
  name: '',
  phone: '',
  email: '',
  notes: '',
  pincode: '',
  members: [{ relationship: 'self', age: '' }],
  withPreferences: true,
  coverType: 'floater',
  sumInsuredRupees: '',
  tenureYears: '1',
};

function toInput(d: Draft): ClientInputRaw {
  const optional = (value: string) => (value.trim() ? value.trim() : undefined);
  const phone = optional(d.phone);
  const email = optional(d.email);
  const notes = optional(d.notes);
  return {
    customer: {
      name: d.name.trim(),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(notes ? { notes } : {}),
    },
    pincode: d.pincode,
    members: d.members.map((m) => ({ relationship: m.relationship, age: Number(m.age) })),
    ...(d.withPreferences
      ? {
          preferences: {
            coverType: d.coverType,
            sumInsuredPaise: Math.round(Number(d.sumInsuredRupees) * PAISE_PER_RUPEE),
            tenureYears: Number(d.tenureYears),
          },
        }
      : {}),
  };
}

function relativeDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ClientsPanel(): React.JSX.Element | null {
  const [list, setList] = useState<ClientListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await window.fqf.clients.list().catch(() => null);
    if (result?.ok) setList(result.data);
    else setError(result ? result.error.message : 'Clients could not be loaded.');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!list?.enabled) {
    return error ? (
      <section className="panel insurers">
        <h2>Clients</h2>
        <p className="error">{error}</p>
      </section>
    ) : null;
  }

  const edit = async (summary: ClientSummary) => {
    setError(null);
    const result = await window.fqf.clients.get(summary.id);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const { client } = result.data;
    setDraft({
      id: summary.id,
      name: client.customer.name,
      phone: client.customer.phone ?? '',
      email: client.customer.email ?? '',
      notes: client.customer.notes ?? '',
      pincode: client.pincode,
      members: client.members.map((m) => ({ relationship: m.relationship, age: String(m.age) })),
      withPreferences: !!client.preferences,
      coverType: client.preferences?.coverType ?? 'floater',
      sumInsuredRupees: client.preferences
        ? String(client.preferences.sumInsuredPaise / PAISE_PER_RUPEE)
        : '',
      tenureYears: String(client.preferences?.tenureYears ?? 1),
    });
  };

  const remove = async (id: string) => {
    setConfirmDelete(null);
    const result = await window.fqf.clients.delete(id);
    if (!result.ok) setError(result.error.message);
    await refresh();
  };

  return (
    <section className="panel insurers" aria-labelledby="clients-heading">
      <h2 id="clients-heading">Clients</h2>
      <p className="lead">
        Saved clients are reused when fetching quotes. They are stored encrypted on this computer
        and kept until you delete them. Members are recorded by relationship and age only.
      </p>
      {list.storageError && (
        <p className="error" role="alert">
          {list.storageError === 'SECRET_STORE_UNAVAILABLE'
            ? 'Secure storage is unavailable, so clients cannot be saved or shown.'
            : 'The client database could not be opened. Nothing was changed; contact support.'}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!list.storageError && !draft && (
        <button type="button" onClick={() => setDraft({ ...EMPTY, members: [...EMPTY.members] })}>
          Add client
        </button>
      )}
      {draft && (
        <ClientForm
          draft={draft}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            void refresh();
          }}
        />
      )}
      {list.clients.length > 0 && (
        <ul className="insurer-list">
          {list.clients.map((c) => (
            <li key={c.id} className="insurer-row">
              <div className="insurer-main">
                <div>
                  <strong>{c.name}</strong>
                  <span className="insurer-mode">
                    Pincode {c.pincode} · {c.memberCount}{' '}
                    {c.memberCount === 1 ? 'member' : 'members'} · updated{' '}
                    {relativeDate(c.updatedAt)}
                  </span>
                </div>
                <div className="insurer-actions">
                  <span className={c.hasPreferences ? 'badge saved' : 'badge'}>
                    {c.hasPreferences ? 'Ready to quote' : 'Quote details missing'}
                  </span>
                  <button type="button" onClick={() => void edit(c)}>
                    Edit
                  </button>
                  {confirmDelete === c.id ? (
                    <>
                      <button type="button" onClick={() => void remove(c.id)}>
                        Confirm delete
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(c.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ClientForm(props: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const { draft: d, onChange } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => onChange({ ...d, ...patch });
  const setMember = (i: number, patch: Partial<MemberDraft>) =>
    set({ members: d.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await window.fqf.clients
      .save({ ...(d.id ? { id: d.id } : {}), client: toInput(d) })
      .catch(() => null);
    setBusy(false);
    if (result?.ok) props.onSaved();
    else {
      const fields =
        result?.ok === false
          ? (result.error.details?.['issues'] as { path: string }[] | undefined)
          : undefined;
      setError(
        fields?.length
          ? `Check these details: ${[...new Set(fields.map((f) => describeField(f.path)))].join(', ')}.`
          : (result?.error.message ?? 'The client could not be saved.'),
      );
    }
  };

  return (
    <form className="login-form client-form" onSubmit={(e) => void submit(e)}>
      <h3>{d.id ? 'Edit client' : 'New client'}</h3>
      <label>
        Client name
        <input
          value={d.name}
          onChange={(e) => set({ name: e.target.value })}
          maxLength={100}
          required
        />
      </label>
      <label>
        Mobile (optional)
        <input
          value={d.phone}
          onChange={(e) => set({ phone: e.target.value })}
          inputMode="tel"
          maxLength={20}
        />
      </label>
      <label>
        Email (optional)
        <input
          value={d.email}
          onChange={(e) => set({ email: e.target.value })}
          type="email"
          maxLength={254}
        />
      </label>
      <label>
        Pincode
        <input
          value={d.pincode}
          onChange={(e) => set({ pincode: e.target.value })}
          inputMode="numeric"
          maxLength={7}
          required
        />
      </label>
      <fieldset>
        <legend>Members to insure</legend>
        {d.members.map((m, i) => (
          <div className="member-row" key={i}>
            <select
              aria-label={`Member ${i + 1} relationship`}
              value={m.relationship}
              onChange={(e) => setMember(i, { relationship: e.target.value as Relationship })}
            >
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {RELATIONSHIP_LABELS[r]}
                </option>
              ))}
            </select>
            <input
              aria-label={`Member ${i + 1} age`}
              value={m.age}
              onChange={(e) => setMember(i, { age: e.target.value })}
              inputMode="numeric"
              placeholder="Age"
              maxLength={3}
              required
            />
            {d.members.length > 1 && (
              <button
                type="button"
                onClick={() => set({ members: d.members.filter((_, j) => j !== i) })}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {d.members.length < 12 && (
          <button
            type="button"
            onClick={() => set({ members: [...d.members, { relationship: 'spouse', age: '' }] })}
          >
            Add member
          </button>
        )}
      </fieldset>
      <label className="check">
        <input
          type="checkbox"
          checked={d.withPreferences}
          onChange={(e) => set({ withPreferences: e.target.checked })}
        />
        Save quote details (needed to fetch quotes)
      </label>
      {d.withPreferences && (
        <>
          <label>
            Cover type
            <select
              value={d.coverType}
              onChange={(e) => set({ coverType: e.target.value as Draft['coverType'] })}
            >
              <option value="floater">Family floater</option>
              <option value="individual">Individual</option>
            </select>
          </label>
          <label>
            Sum insured (₹)
            <input
              value={d.sumInsuredRupees}
              onChange={(e) => set({ sumInsuredRupees: e.target.value.replace(/[,\s]/g, '') })}
              inputMode="numeric"
              placeholder="for example 1000000"
              required
            />
          </label>
          <label>
            Policy term (years)
            <select value={d.tenureYears} onChange={(e) => set({ tenureYears: e.target.value })}>
              {[1, 2, 3, 4, 5].map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        Notes (optional)
        <textarea
          value={d.notes}
          onChange={(e) => set({ notes: e.target.value })}
          maxLength={1000}
          rows={2}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="insurer-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save client'}
        </button>
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** A readable name for a rejected field path such as "client.members.1.age". */
function describeField(path: string): string {
  const parts = path.split('.').slice(1);
  if (parts[0] === 'customer')
    return (
      { name: 'name', phone: 'mobile', email: 'email', notes: 'notes' }[parts[1] ?? ''] ?? 'client'
    );
  if (parts[0] === 'members')
    return parts[1] !== undefined ? `member ${Number(parts[1]) + 1}` : 'members';
  if (parts[0] === 'preferences')
    return (
      { sumInsuredPaise: 'sum insured', tenureYears: 'policy term', coverType: 'cover type' }[
        parts[1] ?? ''
      ] ?? 'quote details'
    );
  if (parts[0] === 'pincode') return 'pincode';
  return 'details';
}
