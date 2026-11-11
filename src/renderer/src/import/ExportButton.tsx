// Exports every saved client, of every kind, to one Excel workbook (a sheet per kind). The main
// process asks where to save it; Aadhaar and passport numbers are not exported.
import { FileDown } from 'lucide-react';
import { useState } from 'react';

export function ExportButton(): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const run = async () => {
    setBusy(true);
    setMessage(null);
    const r = await window.fqf.clients.exportAll().catch(() => null);
    setBusy(false);
    if (r?.ok) {
      if (r.data.saved)
        setMessage({ text: `Saved ${r.data.file ?? 'the workbook'}`, error: false });
    } else {
      setMessage({ text: r?.error.message ?? 'The clients could not be exported.', error: true });
    }
  };

  return (
    <>
      {message && (
        <span
          className={message.error ? 'error' : 'insurer-mode'}
          role={message.error ? 'alert' : 'status'}
        >
          {message.text}
        </span>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        title="Every client of every kind, a sheet per kind (no Aadhaar or passport numbers)"
      >
        <FileDown size={16} aria-hidden="true" />
        {busy ? 'Exporting…' : 'Export to Excel'}
      </button>
    </>
  );
}
