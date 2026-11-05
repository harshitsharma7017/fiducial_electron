// Import from Excel or CSV, for one kind of client (health clients, travel clients, vehicles):
// download a template, choose a filled file, check the preview (each row new, already saved,
// repeated in the file, or with problems), then save. The file is read and checked in the main
// process; this screen sees names and short descriptions only, never Aadhaar or passport numbers.
import { FileSpreadsheet, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ERROR_INFO } from '../../../shared/ipc/errors';
import type { ImportKind } from '../../../shared/import/import-kinds';
import type { ImportCommitResult, ImportPreview } from '../../../shared/ipc/contract';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/toast';

const NOUNS: Record<ImportKind, { one: string; many: string; title: string }> = {
  clients: { one: 'client', many: 'clients', title: 'Import health clients' },
  travellers: { one: 'travel client', many: 'travel clients', title: 'Import travel clients' },
  vehicles: { one: 'vehicle', many: 'vehicles', title: 'Import vehicles' },
};

const STATUS: Record<ImportPreview['rows'][number]['status'], { label: string; tone: string }> = {
  new: { label: 'New', tone: 'success' },
  'saved-already': { label: 'Already saved', tone: 'warning' },
  repeated: { label: 'Repeated in file', tone: 'warning' },
  problems: { label: 'Has problems', tone: 'danger' },
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Step =
  | { step: 'start' }
  | { step: 'preview'; preview: ImportPreview }
  | { step: 'done'; result: ImportCommitResult };

/** The "Import" button and its dialog. `onImported` refreshes the panel's list. */
export function ImportButton(props: {
  kind: ImportKind;
  onImported: () => void;
  /** Opens the dialog whenever this number goes up (a request from another screen). */
  openRequest?: number;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ step: 'start' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const noun = NOUNS[props.kind];
  const seenRequest = useRef(props.openRequest ?? 0);

  const close = () => {
    setOpen(false);
    if (step.step === 'done' && step.result.saved > 0) props.onImported();
  };
  const reset = () => {
    setStep({ step: 'start' });
    setError(null);
    setNotice(null);
    setIncludeDuplicates(false);
  };

  useEffect(() => {
    if ((props.openRequest ?? 0) > seenRequest.current) {
      seenRequest.current = props.openRequest ?? 0;
      reset();
      setOpen(true);
    }
  });

  const template = async (format: 'xlsx' | 'csv') => {
    setError(null);
    setNotice(null);
    const r = await window.fqf.imports.template(props.kind, format).catch(() => null);
    if (!r) setError('The template could not be saved.');
    else if (!r.ok) setError(r.error.message);
    else if (r.data.saved) setNotice('Template saved. Fill it in, then choose it here.');
  };

  const choose = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    const r = await window.fqf.imports.preview(props.kind).catch(() => null);
    setBusy(false);
    if (!r) setError('The file could not be read.');
    else if (!r.ok) {
      if (r.error.code !== 'CANCELLED') setError(r.error.message);
    } else if (r.data.problem) setError(`${r.data.fileName}: ${r.data.problem}`);
    else setStep({ step: 'preview', preview: r.data });
  };

  const save = async (token: string) => {
    setError(null);
    setBusy(true);
    const r = await window.fqf.imports.commit(token, includeDuplicates).catch(() => null);
    setBusy(false);
    if (!r) setError('The import could not be saved.');
    else if (!r.ok)
      setError(
        r.error.code === 'VALIDATION_FAILED'
          ? 'This preview has expired or was already saved. Choose the file again.'
          : r.error.message,
      );
    else {
      setStep({ step: 'done', result: r.data });
      if (r.data.saved > 0) toast(`Imported ${count(r.data.saved, noun.one, noun.many)}.`);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Upload size={16} aria-hidden="true" />
        Import
      </button>
      <Modal open={open} title={noun.title} onClose={close} wide={step.step === 'preview'}>
        {step.step === 'start' && (
          <>
            <p className="lead">
              Import {noun.many} from an Excel workbook (.xlsx) or a CSV file. Start from the
              template: one row per {noun.one}, with a &ldquo;How to fill&rdquo; sheet. Every row is
              checked before anything is saved
              {props.kind === 'vehicles'
                ? '.'
                : '; Aadhaar and passport numbers go to the encrypted vault.'}
            </p>
            <div className="import-actions">
              <button type="button" onClick={() => void template('xlsx')}>
                <FileSpreadsheet size={16} aria-hidden="true" />
                Excel template
              </button>
              <button type="button" onClick={() => void template('csv')}>
                <FileSpreadsheet size={16} aria-hidden="true" />
                CSV template
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void choose()}
              >
                <Upload size={16} aria-hidden="true" />
                {busy ? 'Reading the file…' : 'Choose file…'}
              </button>
            </div>
            {props.kind !== 'vehicles' && (
              <p className="insurer-note">
                The file holds the numbers in plain text: delete it, or keep it somewhere safe, once
                imported.
              </p>
            )}
          </>
        )}
        {step.step === 'preview' && (
          <PreviewStep
            preview={step.preview}
            noun={noun}
            busy={busy}
            includeDuplicates={includeDuplicates}
            onIncludeDuplicates={setIncludeDuplicates}
            onSave={(token) => void save(token)}
            onBack={reset}
          />
        )}
        {step.step === 'done' && <DoneStep result={step.result} noun={noun} onClose={close} />}
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </Modal>
    </>
  );
}

function PreviewStep(props: {
  preview: ImportPreview;
  noun: { one: string; many: string };
  busy: boolean;
  includeDuplicates: boolean;
  onIncludeDuplicates: (value: boolean) => void;
  onSave: (token: string) => void;
  onBack: () => void;
}): React.JSX.Element {
  const { preview, noun } = props;
  const by = (s: ImportPreview['rows'][number]['status']) =>
    preview.rows.filter((r) => r.status === s).length;
  const fresh = by('new');
  const duplicates = by('saved-already') + by('repeated');
  const problems = by('problems');
  const toSave = fresh + (props.includeDuplicates ? duplicates : 0);
  return (
    <>
      <p className="lead">
        <strong>{preview.fileName}</strong>: {count(preview.rows.length, 'row', 'rows')} read. Rows
        with problems are not saved: correct them in the file and choose it again.
      </p>
      <div className="import-summary" role="status">
        <span className="status status-success">
          <span className="status-dot" aria-hidden="true" />
          {fresh} new
        </span>
        {duplicates > 0 && (
          <span className="status status-warning">
            <span className="status-dot" aria-hidden="true" />
            {duplicates} duplicate{duplicates === 1 ? '' : 's'}
          </span>
        )}
        {problems > 0 && (
          <span className="status status-danger">
            <span className="status-dot" aria-hidden="true" />
            {problems} with problems
          </span>
        )}
      </div>
      {preview.ignoredColumns.length > 0 && (
        <p className="insurer-note">
          Columns not imported (not in the template): {preview.ignoredColumns.join(', ')}.
        </p>
      )}
      <div className="table-wrap">
        <table className="data-table import-table">
          <thead>
            <tr>
              <th scope="col">Row</th>
              <th scope="col">Name</th>
              <th scope="col">Details</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr key={row.line}>
                <td className="line">{row.line}</td>
                <th scope="row">{row.label}</th>
                <td>
                  <span className="muted">{row.detail}</span>
                  {row.problems.length > 0 && (
                    <ul>
                      {row.problems.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  )}
                </td>
                <td>
                  <span className={`status status-${STATUS[row.status].tone}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {STATUS[row.status].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {duplicates > 0 && (
        <label className="check import-actions">
          <input
            type="checkbox"
            checked={props.includeDuplicates}
            onChange={(e) => props.onIncludeDuplicates(e.target.checked)}
          />
          Also save the {count(duplicates, 'duplicate', 'duplicates')} as new {noun.many}
        </label>
      )}
      <div className="import-actions">
        <button
          type="button"
          className="primary"
          disabled={props.busy || toSave === 0 || !preview.token}
          onClick={() => preview.token && props.onSave(preview.token)}
        >
          {props.busy ? 'Saving…' : `Save ${count(toSave, noun.one, noun.many)}`}
        </button>
        <button type="button" disabled={props.busy} onClick={props.onBack}>
          Choose another file
        </button>
      </div>
    </>
  );
}

function DoneStep(props: {
  result: ImportCommitResult;
  noun: { one: string; many: string };
  onClose: () => void;
}): React.JSX.Element {
  const { result, noun } = props;
  return (
    <>
      <p role="status">
        Saved {count(result.saved, noun.one, noun.many)}.
        {result.skipped > 0 && ` ${count(result.skipped, 'duplicate', 'duplicates')} left out.`}
      </p>
      {result.failed.length > 0 && (
        <>
          <p className="error" role="alert">
            {count(result.failed.length, 'row was', 'rows were')} not saved:
          </p>
          <ul className="error">
            {result.failed.map((f) => (
              <li key={f.line}>
                Row {f.line}:{' '}
                {f.code === 'CANCELLED'
                  ? 'not tried (saving stopped at an earlier row).'
                  : f.code === 'SECRET_STORE_UNAVAILABLE'
                    ? 'secure storage is unavailable. Check this row in the list: it may be saved without its Aadhaar or passport number.'
                    : ERROR_INFO[f.code].message}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="import-actions">
        <button type="button" className="primary" onClick={props.onClose}>
          Done
        </button>
      </div>
    </>
  );
}
