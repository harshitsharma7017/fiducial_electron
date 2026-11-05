// A confirmation for destructive actions (deleting a client, forgetting a sign-in).
import { Trash2 } from 'lucide-react';
import { Modal } from './Modal';

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  return (
    <Modal open={props.open} title={props.title} size="narrow" onClose={props.onCancel}>
      <div className="confirm-body">
        <span className="confirm-icon" aria-hidden="true">
          <Trash2 size={18} />
        </span>
        <p>{props.message}</p>
      </div>
      <div className="modal-actions">
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
        <button type="button" className="danger-solid" onClick={props.onConfirm}>
          {props.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
