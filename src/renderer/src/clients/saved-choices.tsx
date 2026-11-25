// The quote screens' view of a client's saved quote choices (request of 24 November 2026: a quote
// asks only the product; everything else comes from the client's details). Reads the client's
// record, shows what will be used, and says where to change it.
import { useEffect, useState } from 'react';
import {
  QUOTE_CHOICE_INSURER_NAMES,
  type ClientQuoteChoices,
  type QuoteChoiceInsurer,
} from '../../../shared/contracts/client-quote';
import type { QuoteRunResultView } from '../../../shared/ipc/contract';

/** The client's saved quote choices, read now (fresh before each run). */
export async function readChoices(
  clientId: string,
): Promise<{ choices: ClientQuoteChoices | undefined } | { error: string }> {
  const r = await window.fqf.clients.get(clientId).catch(() => null);
  if (!r) return { error: 'The client could not be read.' };
  if (!r.ok) return { error: r.error.message };
  return { choices: r.data.client.quoteChoices };
}

/** The client's saved quote choices, for showing; undefined until read. */
export function useSavedChoices(clientId: string): ClientQuoteChoices | null | undefined {
  const [choices, setChoices] = useState<ClientQuoteChoices | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void readChoices(clientId).then((r) => {
      if (live) setChoices('error' in r ? null : (r.choices ?? {}));
    });
    return () => {
      live = false;
    };
  }, [clientId]);
  return choices;
}

/** What the quote will use, from the client's details, and where to change it. */
export function SavedChoicesNote(props: {
  insurer: QuoteChoiceInsurer;
  lines: string[];
}): React.JSX.Element {
  return (
    <p className="insurer-note">
      <strong>From the client&rsquo;s details:</strong>{' '}
      {props.lines.length > 0 ? props.lines.join(' · ') : 'nothing more is needed'}. Change these in
      Edit client &rarr; Additional details &rarr; {QUOTE_CHOICE_INSURER_NAMES[props.insurer]}.
    </p>
  );
}

/** What to fill in the client's details before this quote can be fetched. */
export function missingMessage(missing: string[]): string {
  return `Add to the client's details first: ${missing.join('; ')}.`;
}

/** A quote's result: the premium, the insurer's message, problems and what is left by hand. */
export function QuoteResult(props: {
  result: QuoteRunResultView | { error: string } | null;
}): React.JSX.Element | null {
  const { result } = props;
  if (!result) return null;
  if ('error' in result) {
    return (
      <p className="error" role="alert">
        {result.error}
      </p>
    );
  }
  return (
    <div role="status">
      {result.premium && (
        <p>
          <strong>{result.premium.amount}</strong> &mdash; {result.premium.label}
        </p>
      )}
      <p className={result.outcome === 'ready' ? undefined : 'error'}>
        {result.step ? `${result.step}: ` : ''}
        {result.message}
      </p>
      {result.problems.length > 0 && (
        <ul>
          {result.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {result.toDo && result.toDo.length > 0 && (
        <>
          <p>Still to do by hand:</p>
          <ul>
            {result.toDo.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
