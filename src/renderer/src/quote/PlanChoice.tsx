// Which plan(s) go in the PDF (request of 26 November 2026: "if there are multiple quotes, ask the
// user which one to show when they click generate PDF"). Stop & make PDF reads the insurer's page;
// when it shows several plans (ICICI Elevate's Basic, Essential and Recommended; United India's
// calculator list), the app asks here before saving, and the PDF holds only the plans chosen.
// One dialog for every place Stop & make PDF is pressed (the quote drawer, the top bar, Compare
// quotes' cards), drawn by the app shell.
import { FileDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { showAppScreens } from '../insurers/PortalTabs';

interface Ask {
  insurer: string;
  plans: { name: string; amount: string }[];
  answer: (names: string[] | null) => void;
}

let current: Ask | null = null;
const listeners = new Set<(ask: Ask | null) => void>();
const announce = () => {
  for (const listener of listeners) listener(current);
};

/** Asks which plans to put in the PDF; null when the advisor cancels (the form stays kept). */
export function askWhichPlans(
  insurer: string,
  plans: { name: string; amount: string }[],
): Promise<string[] | null> {
  // The app's screens in front, where the question is drawn (over an insurer's page otherwise).
  showAppScreens();
  current?.answer(null);
  return new Promise((resolve) => {
    current = {
      insurer,
      plans,
      answer: (names) => {
        current = null;
        announce();
        resolve(names);
      },
    };
    announce();
  });
}

export function PlanChoiceDialog(): React.JSX.Element | null {
  const [ask, setAsk] = useState<Ask | null>(current);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    const listener = (next: Ask | null) => {
      setAsk(next);
      setPicked([]);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const toggle = (name: string, on: boolean) =>
    setPicked((p) => (on ? [...p, name] : p.filter((n) => n !== name)));
  return (
    <Modal
      open={ask !== null}
      title="Which plan for the PDF?"
      subtitle={ask ? `${ask.insurer} shows ${ask.plans.length} plans` : ''}
      size="narrow"
      onClose={() => ask?.answer(null)}
    >
      {ask && (
        <form
          className="plan-choice"
          onSubmit={(e) => {
            e.preventDefault();
            if (picked.length > 0)
              ask.answer(ask.plans.map((p) => p.name).filter((n) => picked.includes(n)));
          }}
        >
          <p className="insurer-note">
            Tick the plan to put in the quote&rsquo;s PDF (or several: the PDF then lists each, the
            first in this list as its premium). The comparison uses it too.
          </p>
          {ask.plans.map((plan) => (
            <label key={plan.name} className="check plan-choice-row">
              <input
                type="checkbox"
                checked={picked.includes(plan.name)}
                onChange={(e) => toggle(plan.name, e.target.checked)}
              />
              <span>{plan.name}</span>
              <strong>₹{plan.amount}</strong>
            </label>
          ))}
          <div className="insurer-actions">
            <button type="submit" className="primary" disabled={picked.length === 0}>
              <FileDown size={16} aria-hidden="true" />
              Save PDF
            </button>
            <button type="button" className="ghost" onClick={() => ask.answer(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
