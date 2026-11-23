// ICICI Lombard's partner API settings (request of 21 November 2026): which environment premiums
// come from (UAT for testing, or Production) and the partner login for each, as ICICI issued it.
// Logins are kept in the encrypted vault and never shown again: only whether one is saved.
import { useEffect, useState } from 'react';
import {
  ICICI_API_MODE_NAMES,
  ICICI_API_MODES,
  type IciciApiMode,
  type IciciApiStatus,
} from '../../../shared/insurers/icici-api';
import { toast } from '../ui/toast';

export function IciciApiSettings(props: { onDone: () => void }): React.JSX.Element {
  const [status, setStatus] = useState<IciciApiStatus | null>(null);
  const [mode, setMode] = useState<IciciApiMode | 'off'>('off');
  const [loginFor, setLoginFor] = useState<IciciApiMode>('uat');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [imid, setImid] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; problem: boolean } | null>(null);

  useEffect(() => {
    void window.fqf.iciciApi.status().then((r) => {
      if (!r.ok) {
        setMessage({ text: r.error.message, problem: true });
        return;
      }
      setStatus(r.data);
      setMode(r.data.mode ?? 'off');
      if (r.data.mode) setLoginFor(r.data.mode);
    });
  }, []);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const typed = login.trim() !== '' || password.trim() !== '';
    const r = await window.fqf.iciciApi
      .save({
        mode: mode === 'off' ? null : mode,
        ...(typed
          ? {
              loginFor,
              login: {
                login: login.trim(),
                encryptedPassword: password.trim(),
                ...(imid.trim() ? { imidCode: imid.trim() } : {}),
              },
            }
          : {}),
      })
      .catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      setMessage({ text: r ? r.error.message : 'The settings could not be saved.', problem: true });
      return;
    }
    setStatus(r.data);
    setLogin('');
    setPassword('');
    setImid('');
    toast('ICICI Lombard API settings saved.');
  };
  const test = async () => {
    setBusy(true);
    setMessage(null);
    const r = await window.fqf.iciciApi.test().catch(() => null);
    setBusy(false);
    setMessage(
      r?.ok
        ? { text: r.data.message, problem: !r.data.ok }
        : { text: r ? r.error.message : 'The sign-in could not be checked.', problem: true },
    );
  };
  const forget = async (which: IciciApiMode) => {
    setBusy(true);
    const r = await window.fqf.iciciApi
      .save({ mode: mode === 'off' || mode === which ? null : mode, forget: which })
      .catch(() => null);
    setBusy(false);
    if (r?.ok) {
      setStatus(r.data);
      setMode(r.data.mode ?? 'off');
      toast(`${ICICI_API_MODE_NAMES[which]} login forgotten.`);
    }
  };
  const typedPartly = (login.trim() === '') !== (password.trim() === '');

  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="insurer-note">
        With ICICI Lombard&rsquo;s partner API the app asks ICICI for motor (car, two-wheeler) and
        health (Elevate, Activate Booster) premiums directly, without filling NYSA. Only premiums
        are asked: never a proposal, payment or KYC. Production needs this computer&rsquo;s IP
        address allow-listed by ICICI.
      </p>
      <label>
        Premiums from{' '}
        <select value={mode} onChange={(e) => setMode(e.target.value as IciciApiMode | 'off')}>
          <option value="off">Not used</option>
          {ICICI_API_MODES.map((m) => (
            <option key={m} value={m}>
              {ICICI_API_MODE_NAMES[m]}
              {status && !status.saved[m] ? ' (no login saved)' : ''}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Partner login</legend>
        <ul>
          {ICICI_API_MODES.map((m) => (
            <li key={m}>
              {ICICI_API_MODE_NAMES[m]}: {status?.saved[m] ? 'saved' : 'not saved'}
              {status?.saved[m] && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="ghost btn-sm"
                    disabled={busy}
                    onClick={() => void forget(m)}
                  >
                    Forget
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        <label>
          Save a login for{' '}
          <select value={loginFor} onChange={(e) => setLoginFor(e.target.value as IciciApiMode)}>
            {ICICI_API_MODES.map((m) => (
              <option key={m} value={m}>
                {ICICI_API_MODE_NAMES[m]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Login{' '}
          <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" />
        </label>
        <label>
          Password, encrypted as ICICI gave it{' '}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          IMID code (optional){' '}
          <input value={imid} onChange={(e) => setImid(e.target.value)} placeholder="IM-…" />
        </label>
      </fieldset>
      {message && (
        <p className={message.problem ? 'error' : undefined} role="status">
          {message.text}
        </p>
      )}
      <div className="insurer-actions">
        <button type="submit" className="primary" disabled={busy || typedPartly}>
          Save
        </button>
        <button type="button" disabled={busy || mode === 'off'} onClick={() => void test()}>
          Check sign-in
        </button>
        <button type="button" className="ghost" onClick={props.onDone}>
          Close
        </button>
      </div>
    </form>
  );
}
