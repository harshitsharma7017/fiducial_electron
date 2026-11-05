// Insurer portals (phase 1: sign-in). The advisor saves each insurer's user ID and password once;
// the app keeps them in the encrypted vault and fills them into the insurer's own sign-in page.
// The advisor completes any CAPTCHA and presses the insurer's sign-in button.
//
// This screen can save and forget sign-in details but never reads them back. A typed password
// is held only while the form is open and is cleared after saving or cancelling.
import {
  Building2,
  Circle,
  ExternalLink,
  KeyRound,
  LogOut,
  Square,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ActionMenu, type MenuEntry } from '../ui/Menu';
import { PageHeader, SkeletonCards } from '../ui/PageHeader';
import { toast } from '../ui/toast';
import type { FillOutcome } from '../../../shared/insurers/fill-outcomes';
import { SESSION_HOURS } from '../../../shared/insurers/session';
import type { InsurerPortalList, InsurerPortalView } from '../../../shared/ipc/contract';
import { Modal } from '../ui/Modal';
import { endTime, InsurerAvatar, portalStatus, StatusBadge } from './branding';

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

export function InsurerPortals(): React.JSX.Element | null {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; problem: boolean } | null>(null);
  const [forgetting, setForgetting] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

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

  const header = (
    <PageHeader
      icon={Building2}
      title="Insurer portals"
      subtitle={`Save each insurer's sign-in once: the app fills it into the insurer's own page and you complete any CAPTCHA. Each portal opens as a tab of this window; a session lasts up to ${SESSION_HOURS} hours, even across restarts. Sign-ins are stored encrypted on this computer.`}
    />
  );
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

  const run = async (action: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
    setMessage(null);
    const result = await action();
    if (!result.ok)
      setMessage({ text: result.error?.message ?? 'That did not work.', problem: true });
    await refresh();
  };

  const forgetPortal = load.list.portals.find((p) => p.id === forgetting);
  /** The portal's other actions, under its "more" menu (each shown when it applies). */
  const portalMenu = (portal: InsurerPortalView): MenuEntry[] => {
    const entries: { label: string; icon: LucideIcon; onSelect: () => void; danger?: boolean }[] =
      [];
    if (portal.sessionEndsAt)
      entries.push({
        label: 'Sign out',
        icon: LogOut,
        onSelect: () => void run(() => window.fqf.insurers.signOut(portal.id)),
      });
    if (portal.windowOpen)
      entries.push({
        label: portal.recording?.active ? 'Stop recording' : 'Record form',
        icon: portal.recording?.active ? Square : Circle,
        onSelect: () =>
          void run(() =>
            window.fqf.insurers.record(portal.id, portal.recording?.active ? 'stop' : 'start'),
          ),
      });
    if (portal.loginSaved)
      entries.push({
        label: 'Forget sign-in',
        icon: Trash2,
        danger: true,
        onSelect: () => setForgetting(portal.id),
      });
    return entries;
  };
  return (
    <section aria-label="Insurer portals">
      {header}
      {load.list.vaultError && (
        <p className="error" role="alert">
          {load.list.vaultError === 'SECRET_STORE_UNAVAILABLE'
            ? 'Secure storage is unavailable, so sign-in details cannot be saved or used. Portals still open for signing in by hand.'
            : 'Saved sign-in details could not be read. Portals still open for signing in by hand.'}
        </p>
      )}
      {message && (
        <p className={message.problem ? 'error' : undefined} role="status">
          {message.text}
        </p>
      )}
      <ul className="insurer-list insurer-cards">
        {load.list.portals.map((portal) => {
          const fill = portal.lastFill ? FILL_MESSAGES[portal.lastFill] : null;
          return (
            <li
              key={portal.id}
              className="insurer-row insurer-card"
              data-menu-open={menuOpen === portal.id}
            >
              <div className="insurer-main">
                <div className="insurer-identity">
                  <InsurerAvatar name={portal.displayName} />
                  <div>
                    <strong>{portal.displayName}</strong>
                    <span className="insurer-mode">{automationText(portal)}</span>
                  </div>
                </div>
                <div className="insurer-badges">
                  {usesLogin(portal) && (
                    <span className={portal.loginSaved ? 'badge saved' : 'badge'}>
                      {portal.loginSaved ? 'Sign-in saved' : 'No sign-in saved'}
                    </span>
                  )}
                  <StatusBadge status={portalStatus(portal)} />
                </div>
              </div>
              {portal.blockedOrigins.length > 0 && (
                <p className="insurer-note error">
                  The portal tried to open {portal.blockedOrigins.join(', ')}, which is not on its
                  allowed list, so it was blocked. Tell support if a page did not open.
                </p>
              )}
              {portal.recording?.active && (
                <p className="insurer-note" role="status">
                  Recording the form structure ({portal.recording.pages} pages,{' '}
                  {portal.recording.events} steps). Use a dummy client, and stop once the premium
                  shows: before any proposal or payment. Typed values are never recorded.
                </p>
              )}
              {portal.recording && !portal.recording.active && portal.recording.file && (
                <p className="insurer-note">
                  Recording saved: <code>{portal.recording.file}</code>
                </p>
              )}
              {portal.sessionEndsAt && (
                <p className="insurer-note">Session open until {endTime(portal.sessionEndsAt)}.</p>
              )}
              {!portal.sessionEndsAt && portal.lastSessionEnd && (
                <p className="insurer-note">
                  {portal.lastSessionEnd === 'expired'
                    ? `The ${SESSION_HOURS}-hour session ended. Open the portal to sign in again.`
                    : 'Signed out. Open the portal to sign in again.'}
                </p>
              )}
              {portal.windowOpen && (
                <p className="insurer-note">
                  {fill && <span className={fill.problem ? 'error' : undefined}>{fill.text} </span>}
                  {portal.advisorNote}
                </p>
              )}
              <div className="insurer-actions">
                <button
                  type="button"
                  className="primary btn-sm"
                  onClick={() => void run(() => window.fqf.insurers.openPortal(portal.id))}
                >
                  <ExternalLink size={14} aria-hidden="true" />
                  {portal.windowOpen ? 'Show portal' : 'Open portal'}
                </button>
                {usesLogin(portal) && !load.list.vaultError && (
                  <button type="button" className="btn-sm" onClick={() => setEditing(portal.id)}>
                    <KeyRound size={14} aria-hidden="true" />
                    {portal.loginSaved ? 'Change sign-in' : 'Save sign-in'}
                  </button>
                )}
                {portalMenu(portal).length > 0 && (
                  <ActionMenu
                    label={`More for ${portal.displayName}`}
                    items={portalMenu(portal)}
                    onOpenChange={(open) => setMenuOpen(open ? portal.id : null)}
                  />
                )}
              </div>
              <Modal
                open={editing === portal.id}
                title={`Sign-in for ${portal.displayName}`}
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
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={forgetPortal !== undefined}
        title="Forget this sign-in?"
        message={`The saved user ID and password for ${forgetPortal?.displayName ?? 'this insurer'} will be deleted from this computer. You can save them again at any time.`}
        confirmLabel="Forget sign-in"
        onConfirm={() => {
          const id = forgetting;
          setForgetting(null);
          if (id)
            void run(async () => {
              const result = await window.fqf.insurers.forgetLogin(id);
              if (result.ok) toast('Sign-in forgotten.');
              return result;
            });
        }}
        onCancel={() => setForgetting(null)}
      />
    </section>
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
