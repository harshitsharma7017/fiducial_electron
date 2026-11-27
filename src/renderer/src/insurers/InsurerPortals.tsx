// Insurer portals (phase 1: sign-in). The advisor saves each insurer's user ID and password once;
// the app keeps them in the encrypted vault and fills them into the insurer's own sign-in page.
// The advisor completes any CAPTCHA and presses the insurer's sign-in button.
//
// This screen can save and forget sign-in details but never reads them back. A typed password
// is held only while the form is open and is cleared after saving or cancelling.
//
// Each insurer is a card (redesign of 27 November 2026): its connection status, two facts (the
// sign-in saved or not; the session: signed in until when, waiting for sign-in, expired, signed
// out, not open), what to do now, one primary action (Open / Show portal, Sign in again, or Save
// sign-in when none is saved) and Change sign-in, then Sign out and Forget sign-in (asked first)
// on every card (greyed out when they do not apply, so the cards line up), and the occasional ones
// in its menu (Record form, Partner API). An action runs once: the card's buttons wait.
import {
  PlugZap,
  Building2,
  Circle,
  CircleDashed,
  Clock,
  ExternalLink,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  ShieldCheck,
  Square,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ActionMenu, type MenuEntry } from '../ui/Menu';
import { PageHeader, SkeletonCards } from '../ui/PageHeader';
import { toast } from '../ui/toast';
import type { FillOutcome } from '../../../shared/insurers/fill-outcomes';
import { SESSION_HOURS } from '../../../shared/insurers/session';
import type { InsurerPortalList, InsurerPortalView } from '../../../shared/ipc/contract';
import { Modal } from '../ui/Modal';
import { endTime, InsurerAvatar, portalStatus, StatusBadge } from './branding';
import { IciciApiSettings } from './IciciApiSettings';

const FILL_MESSAGES: Record<FillOutcome, { text: string; problem: boolean }> = {
  filled: {
    text: 'Sign-in details filled. Finish signing in on the insurer tab.',
    problem: false,
  },
  'kept-advisor-input': {
    text: 'The sign-in form already had text, so it was left as you typed it.',
    problem: false,
  },
  'no-login-saved': { text: 'No sign-in details saved: sign in by hand.', problem: false },
  'login-unreadable': {
    text: 'The saved sign-in details could not be read. Save them again.',
    problem: true,
  },
  'form-not-found': {
    text: 'The sign-in form was not found. The portal may have changed: sign in by hand.',
    problem: true,
  },
  'field-not-found': {
    text: 'A sign-in field was not found. The portal may have changed: sign in by hand.',
    problem: true,
  },
  'field-ambiguous': {
    text: 'The sign-in page looked different from expected, so nothing was filled.',
    problem: true,
  },
  'field-wrong-type': {
    text: 'The sign-in page looked different from expected, so nothing was filled.',
    problem: true,
  },
  'left-login-page': { text: 'The page changed before the form could be filled.', problem: false },
  'agent-failed': { text: 'The sign-in form could not be filled: sign in by hand.', problem: true },
  'click-username-first': {
    text: 'Click in the empty Username box first, then press the fill shortcut again.',
    problem: false,
  },
};

/** Portals the app fills from saved sign-in details. */
function usesLogin(portal: InsurerPortalView): boolean {
  return portal.automation === 'autofill' || portal.automation === 'shortcut';
}

function automationText(portal: InsurerPortalView): string {
  if (portal.automation === 'autofill') return 'Fills your user ID and password';
  if (portal.automation === 'shortcut') return 'Click Username, then press the fill shortcut';
  if (portal.automation === 'later') return 'OTP sign-in, by hand for now';
  return 'Sign in by hand';
}

type Load =
  | { state: 'loading' }
  | { state: 'ready'; list: InsurerPortalList }
  | { state: 'error'; message: string };

type Result = Promise<{ ok: boolean; error?: { message: string } }>;

export function InsurerPortals(): React.JSX.Element | null {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; problem: boolean } | null>(null);
  const [forgetting, setForgetting] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [apiOpen, setApiOpen] = useState(false);
  /** The insurer an action is running for (its buttons wait: no second press). */
  const [busy, setBusy] = useState<{ id: string; what: string } | null>(null);
  // The same, at once: a second press before the screen redraws must not run it again.
  const running = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const result = await window.fqf.insurers.list();
      setLoad(
        result.ok
          ? { state: 'ready', list: result.data }
          : { state: 'error', message: result.error.message },
      );
    } catch {
      setLoad({ state: 'error', message: 'Insurer portals could not be loaded.' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // While any insurer page is open, keep its sign-in status up to date.
  const anyOpen =
    load.state === 'ready' &&
    load.list.portals.some((p) => p.windowOpen || p.sessionEndsAt !== null);
  useEffect(() => {
    if (!anyOpen) return;
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [anyOpen, refresh]);

  const subtitle = `Save each insurer's sign-in once: the app fills it into the insurer's own page, you complete any CAPTCHA and sign in. Each portal opens as a tab of this window and its session lasts up to ${SESSION_HOURS} hours, even across restarts. Sign-ins are stored encrypted on this computer and never shown.`;
  const header = <PageHeader icon={Building2} title="Insurer portals" subtitle={subtitle} />;
  if (load.state === 'loading')
    return (
      <section aria-label="Insurer portals">
        {header}
        <SkeletonCards count={4} />
      </section>
    );
  if (load.state === 'error') {
    return (
      <section aria-label="Insurer portals">
        {header}
        <p className="error" role="alert">
          {load.message}
        </p>
      </section>
    );
  }
  if (!load.list.enabled) return null;
  const { portals, vaultError } = load.list;

  /** Runs one insurer's action once (its buttons wait meanwhile), then reads the states again. */
  const run = async (id: string, what: string, action: () => Result, done?: string) => {
    if (running.current) return;
    running.current = true;
    setBusy({ id, what });
    setMessage(null);
    try {
      const result = await action().catch(() => ({
        ok: false,
        error: { message: 'That did not work.' },
      }));
      if (!result.ok)
        setMessage({ text: result.error?.message ?? 'That did not work.', problem: true });
      else if (done) toast(done);
    } finally {
      running.current = false;
      setBusy(null);
      await refresh();
    }
  };

  const forgetPortal = portals.find((p) => p.id === forgetting);
  const withLogin = portals.filter(usesLogin);
  const saved = withLogin.filter((p) => p.loginSaved).length;
  const statuses = portals.map(portalStatus);
  const signedIn = statuses.filter((st) => st.label === 'Signed in').length;
  const waiting = statuses.filter((st) => st.label === 'Waiting for sign-in').length;

  return (
    <section aria-label="Insurer portals">
      {header}
      <ul className="portal-summary" aria-label="Summary">
        <li>
          <strong>{portals.length}</strong> insurers
        </li>
        <li data-tone={saved === withLogin.length ? 'success' : 'warning'}>
          <strong>
            {saved} of {withLogin.length}
          </strong>{' '}
          sign-ins saved
        </li>
        <li data-tone={signedIn > 0 ? 'success' : undefined}>
          <strong>{signedIn}</strong> signed in
        </li>
        {waiting > 0 && (
          <li data-tone="warning">
            <strong>{waiting}</strong> waiting for sign-in
          </li>
        )}
      </ul>
      {vaultError && (
        <p className="error" role="alert">
          {vaultError === 'SECRET_STORE_UNAVAILABLE'
            ? 'Secure storage is unavailable, so sign-in details cannot be saved or used. Portals still open for signing in by hand.'
            : 'Saved sign-in details could not be read. Portals still open for signing in by hand.'}
        </p>
      )}
      {message && (
        <p className={message.problem ? 'error' : undefined} role="status">
          {message.text}
        </p>
      )}
      <ul className="portal-cards">
        {portals.map((portal) => (
          <InsurerCard
            key={portal.id}
            portal={portal}
            vaultError={!!vaultError}
            busy={busy?.id === portal.id ? busy.what : null}
            anyBusy={busy !== null}
            menuOpen={menuOpen === portal.id}
            onMenu={(open) => setMenuOpen(open ? portal.id : null)}
            onOpen={() =>
              void run(portal.id, 'open', () => window.fqf.insurers.openPortal(portal.id))
            }
            onEditLogin={() => setEditing(portal.id)}
            onSignOut={() =>
              void run(
                portal.id,
                'sign-out',
                () => window.fqf.insurers.signOut(portal.id),
                `Signed out of ${portal.displayName}.`,
              )
            }
            onRecord={() => {
              const stop = !!portal.recording?.active;
              void run(
                portal.id,
                'record',
                () => window.fqf.insurers.record(portal.id, stop ? 'stop' : 'start'),
                stop ? 'Recording saved.' : `Recording ${portal.displayName}'s forms.`,
              );
            }}
            onPartnerApi={() => setApiOpen(true)}
            onForget={() => setForgetting(portal.id)}
          />
        ))}
      </ul>
      {portals.map((portal) => (
        <Modal
          key={portal.id}
          open={editing === portal.id}
          title={`Sign-in for ${portal.displayName}`}
          subtitle="Stored encrypted on this computer; never shown again."
          onClose={() => setEditing(null)}
        >
          {editing === portal.id && (
            <LoginForm
              portal={portal}
              onDone={(text) => {
                setEditing(null);
                if (text && !text.problem) toast(text.text);
                else if (text) setMessage(text);
                void refresh();
              }}
            />
          )}
        </Modal>
      ))}
      <Modal open={apiOpen} title="ICICI Lombard partner API" onClose={() => setApiOpen(false)}>
        {apiOpen && <IciciApiSettings onDone={() => setApiOpen(false)} />}
      </Modal>
      <ConfirmDialog
        open={forgetPortal !== undefined}
        title="Forget this sign-in?"
        message={`The saved user ID and password for ${forgetPortal?.displayName ?? 'this insurer'} will be deleted from this computer. You can save them again at any time.`}
        confirmLabel="Forget sign-in"
        onConfirm={() => {
          const id = forgetting;
          setForgetting(null);
          if (id)
            void run(id, 'forget', () => window.fqf.insurers.forgetLogin(id), 'Sign-in forgotten.');
        }}
        onCancel={() => setForgetting(null)}
      />
    </section>
  );
}

/**
 * One insurer: who it is, its two facts (the sign-in saved, the session), what to do next, and
 * one primary action, one secondary, the rest in its menu.
 */
function InsurerCard(props: {
  portal: InsurerPortalView;
  vaultError: boolean;
  /** The action running for this insurer, if any. */
  busy: string | null;
  anyBusy: boolean;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  onOpen: () => void;
  onEditLogin: () => void;
  onSignOut: () => void;
  onRecord: () => void;
  onPartnerApi: () => void;
  onForget: () => void;
}): React.JSX.Element {
  const { portal, busy } = props;
  const status = portalStatus(portal);
  const login = usesLogin(portal);
  const canSaveLogin = login && !props.vaultError;
  const fill = portal.lastFill ? FILL_MESSAGES[portal.lastFill] : null;
  // No sign-in saved yet: saving it comes first (the portal still opens for signing in by hand).
  const needsLogin = canSaveLogin && !portal.loginSaved;
  const openLabel = portal.windowOpen
    ? 'Show portal'
    : portal.lastSessionEnd === 'expired' || portal.lastSessionEnd === 'signed-out'
      ? 'Sign in again'
      : 'Open portal';
  const opening = busy === 'open';

  // Sign out and Forget sign-in are buttons of their own; the menu keeps the occasional ones.
  const menu: MenuEntry[] = [];
  if (portal.windowOpen)
    menu.push({
      label: portal.recording?.active ? 'Stop recording' : 'Record form',
      icon: portal.recording?.active ? Square : Circle,
      onSelect: props.onRecord,
    });
  if (portal.id === 'icici-lombard')
    menu.push({ label: 'Partner API', icon: PlugZap, onSelect: props.onPartnerApi });

  const session: { icon: LucideIcon; text: string; tone: string } =
    status.label === 'Signed in'
      ? {
          icon: ShieldCheck,
          text: `Active until ${endTime(portal.sessionEndsAt!)}`,
          tone: 'success',
        }
      : status.label === 'Waiting for sign-in'
        ? {
            icon: Clock,
            text: 'Finish signing in on its tab',
            tone: 'warning',
          }
        : status.label === 'Session kept'
          ? {
              icon: Clock,
              text: `Kept until ${endTime(portal.sessionEndsAt!)}`,
              tone: 'info',
            }
          : status.label === 'Session expired'
            ? {
                icon: Clock,
                text: `Ended after ${SESSION_HOURS} hours`,
                tone: 'warning',
              }
            : status.label === 'Signed out'
              ? { icon: LogOut, text: 'Signed out', tone: 'neutral' }
              : status.label === 'Portal open'
                ? { icon: ExternalLink, text: 'Portal open in its tab', tone: 'info' }
                : { icon: CircleDashed, text: 'Not open', tone: 'neutral' };
  const credential: { icon: LucideIcon; text: string; tone: string } = !login
    ? { icon: KeyRound, text: automationText(portal), tone: 'neutral' }
    : props.vaultError
      ? { icon: TriangleAlert, text: 'Secure storage unavailable', tone: 'warning' }
      : portal.loginSaved
        ? { icon: Lock, text: 'Saved securely', tone: 'success' }
        : { icon: KeyRound, text: 'Not saved yet', tone: 'warning' };
  const SessionIcon = session.icon;
  const CredentialIcon = credential.icon;

  return (
    <li className="portal-card" data-menu-open={props.menuOpen} aria-busy={busy !== null}>
      <header className="portal-card-head">
        <InsurerAvatar name={portal.displayName} />
        <h2>{portal.displayName}</h2>
        <StatusBadge status={status} />
        <p title={automationText(portal)}>{automationText(portal)}</p>
      </header>
      <dl className="portal-facts">
        <div>
          <dt>Sign-in</dt>
          <dd data-tone={credential.tone} title={credential.text}>
            <CredentialIcon size={14} aria-hidden="true" />
            <span>{credential.text}</span>
          </dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd data-tone={session.tone} title={session.text}>
            <SessionIcon size={14} aria-hidden="true" />
            <span>{session.text}</span>
          </dd>
        </div>
      </dl>
      {/* What to do now, when there is something to say. */}
      {(needsLogin ||
        (portal.windowOpen && portal.signInPending) ||
        portal.recording?.active ||
        (portal.recording && !portal.recording.active && portal.recording.file) ||
        portal.blockedOrigins.length > 0) && (
        <div className="portal-card-notes">
          {needsLogin && (
            <p>
              Save the user ID and password once: the app then fills them into {portal.displayName}
              &rsquo;s sign-in page.
            </p>
          )}
          {portal.windowOpen && portal.signInPending && (
            <p>
              {fill && <span className={fill.problem ? 'error' : undefined}>{fill.text} </span>}
              {portal.advisorNote}
            </p>
          )}
          {portal.recording?.active && (
            <p role="status">
              Recording the form structure ({portal.recording.pages} pages,{' '}
              {portal.recording.events} steps). Use a dummy client, and stop once the premium shows:
              before any proposal or payment. Typed values are never recorded.
            </p>
          )}
          {portal.recording && !portal.recording.active && portal.recording.file && (
            <p>
              Recording saved: <code>{portal.recording.file}</code>
            </p>
          )}
          {portal.blockedOrigins.length > 0 && (
            <p className="error">
              The portal tried to open {portal.blockedOrigins.join(', ')}, which is not on its
              allowed list, so it was blocked. Tell support if a page did not open.
            </p>
          )}
        </div>
      )}
      <footer className="portal-card-actions">
        <div className="portal-card-main-actions">
          {needsLogin ? (
            <>
              <button
                type="button"
                className="primary btn-sm"
                disabled={props.anyBusy}
                onClick={props.onEditLogin}
              >
                <KeyRound size={14} aria-hidden="true" />
                Save sign-in
              </button>
              <button
                type="button"
                className="btn-sm"
                disabled={props.anyBusy}
                onClick={props.onOpen}
              >
                {opening ? (
                  <Loader2 size={14} className="spin" aria-hidden="true" />
                ) : (
                  <ExternalLink size={14} aria-hidden="true" />
                )}
                {opening ? 'Opening…' : openLabel}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="primary btn-sm"
                disabled={props.anyBusy}
                onClick={props.onOpen}
              >
                {opening ? (
                  <Loader2 size={14} className="spin" aria-hidden="true" />
                ) : (
                  <ExternalLink size={14} aria-hidden="true" />
                )}
                {opening ? 'Opening…' : openLabel}
              </button>
              {canSaveLogin && (
                <button
                  type="button"
                  className="btn-sm"
                  disabled={props.anyBusy}
                  onClick={props.onEditLogin}
                >
                  <KeyRound size={14} aria-hidden="true" />
                  Change sign-in
                </button>
              )}
            </>
          )}
        </div>
        <div className="portal-card-more-actions">
          <button
            type="button"
            className="ghost btn-sm"
            disabled={props.anyBusy || !portal.sessionEndsAt}
            title={
              portal.sessionEndsAt
                ? `Sign out of ${portal.displayName} and end its session`
                : 'No session running to sign out of'
            }
            onClick={props.onSignOut}
          >
            {busy === 'sign-out' ? (
              <Loader2 size={14} className="spin" aria-hidden="true" />
            ) : (
              <LogOut size={14} aria-hidden="true" />
            )}
            Sign out
          </button>
          {login && (
            <button
              type="button"
              className="ghost danger btn-sm"
              disabled={props.anyBusy || !portal.loginSaved}
              title={
                portal.loginSaved
                  ? 'Delete the saved user ID and password from this computer (asked first)'
                  : 'No sign-in saved to forget'
              }
              onClick={props.onForget}
            >
              <Trash2 size={14} aria-hidden="true" />
              Forget sign-in
            </button>
          )}
          {menu.length > 0 && (
            <span className="portal-card-more">
              <ActionMenu
                label={`More for ${portal.displayName}`}
                items={menu}
                onOpenChange={props.onMenu}
              />
            </span>
          )}
        </div>
      </footer>
    </li>
  );
}

function LoginForm(props: {
  portal: InsurerPortalView;
  onDone(message: { text: string; problem: boolean } | null): void;
}): React.JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await window.fqf.insurers
      .saveLogin({ id: props.portal.id, username: username.trim(), password })
      .catch(() => null);
    setBusy(false);
    if (result?.ok) {
      setPassword('');
      props.onDone({ text: `${props.portal.displayName} sign-in saved.`, problem: false });
    } else {
      setError(result ? result.error.message : 'The sign-in details could not be saved.');
    }
  };

  return (
    <form className="login-form" onSubmit={(event) => void submit(event)}>
      <label>
        User ID
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          maxLength={256}
          required
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="insurer-actions">
        <button type="submit" disabled={busy || !username.trim() || !password}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => {
            setPassword('');
            props.onDone(null);
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
