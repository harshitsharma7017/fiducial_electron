// Insurer portals (phase 1: sign-in). The advisor saves each insurer's user ID and password once;
// the app keeps them in the encrypted vault and fills them into the insurer's own sign-in page.
// The advisor completes any CAPTCHA and presses the insurer's sign-in button.
//
// This screen can save and forget sign-in details but never reads them back. A typed password
// is held only while the form is open and is cleared after saving or cancelling.
import { useCallback, useEffect, useState } from 'react';
import type { FillOutcome } from '../../../shared/insurers/fill-outcomes';
import { SESSION_HOURS } from '../../../shared/insurers/session';
import type { InsurerPortalList, InsurerPortalView } from '../../../shared/ipc/contract';

const FILL_MESSAGES: Record<FillOutcome, { text: string; problem: boolean }> = {
  filled: {
    text: 'Sign-in details filled. Finish signing in in the insurer window.',
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
};

function endTime(iso: string): string {
  const end = new Date(iso);
  const sameDay = end.toDateString() === new Date().toDateString();
  const time = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? time : `${time} tomorrow`;
}

function automationText(portal: InsurerPortalView): string {
  if (portal.automation === 'autofill') return 'Fills your user ID and password';
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

  // While any insurer window is open, keep its sign-in status up to date.
  const anyOpen =
    load.state === 'ready' &&
    load.list.portals.some((p) => p.windowOpen || p.sessionEndsAt !== null);
  useEffect(() => {
    if (!anyOpen) return;
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [anyOpen, refresh]);

  if (load.state === 'loading') return null;
  if (load.state === 'error') {
    return (
      <section className="panel insurers" aria-labelledby="insurers-heading">
        <h2 id="insurers-heading">Insurer portals</h2>
        <p className="error">{load.message}</p>
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

  return (
    <section className="panel insurers" aria-labelledby="insurers-heading">
      <h2 id="insurers-heading">Insurer portals</h2>
      <p className="lead">
        Save each insurer&rsquo;s sign-in once. When you open a portal, the app fills your user ID
        and password into the insurer&rsquo;s own page; you complete any CAPTCHA and press the
        sign-in button. Details are stored encrypted on this computer only. Once signed in, keep the
        app open and the session stays for up to {SESSION_HOURS} hours, even if you close the
        insurer window. Quitting the app ends it for most insurers, and an insurer may end it
        sooner.
      </p>
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
      <ul className="insurer-list">
        {load.list.portals.map((portal) => {
          const fill = portal.lastFill ? FILL_MESSAGES[portal.lastFill] : null;
          return (
            <li key={portal.id} className="insurer-row">
              <div className="insurer-main">
                <div>
                  <strong>{portal.displayName}</strong>
                  <span className="insurer-mode">{automationText(portal)}</span>
                </div>
                <div className="insurer-actions">
                  {portal.automation === 'autofill' && (
                    <span className={portal.loginSaved ? 'badge saved' : 'badge'}>
                      {portal.loginSaved ? 'Sign-in saved' : 'No sign-in saved'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void run(() => window.fqf.insurers.openPortal(portal.id))}
                  >
                    {portal.windowOpen ? 'Show portal' : 'Open portal'}
                  </button>
                  {portal.automation === 'autofill' && !load.list.vaultError && (
                    <button type="button" onClick={() => setEditing(portal.id)}>
                      {portal.loginSaved ? 'Change sign-in' : 'Save sign-in'}
                    </button>
                  )}
                  {portal.sessionEndsAt && (
                    <button
                      type="button"
                      onClick={() => void run(() => window.fqf.insurers.signOut(portal.id))}
                    >
                      Sign out
                    </button>
                  )}
                  {portal.loginSaved && (
                    <button
                      type="button"
                      onClick={() => void run(() => window.fqf.insurers.forgetLogin(portal.id))}
                    >
                      Forget sign-in
                    </button>
                  )}
                </div>
              </div>
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
              {editing === portal.id && (
                <LoginForm
                  portal={portal}
                  onDone={(text) => {
                    setEditing(null);
                    if (text) setMessage(text);
                    void refresh();
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
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
