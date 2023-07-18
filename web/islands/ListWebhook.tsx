import { useCallback, useRef } from "preact/hooks";
import {
  CollapsibleTable,
  CollapsibleTableRow,
} from "~/components/CollapsibleTable.tsx";
import { Modal } from "~/components/Modal.tsx";

export interface WebhookEntry {
  id: number;
  sourceAddress: string;
  abiHash: string;
  webhookUrl: string;
  topic1: string | null;
  topic2: string | null;
  topic3: string | null;
}

interface ListWebhookProps {
  entries: WebhookEntry[];
}

export const ListWebhook = ({ entries }: ListWebhookProps) => {
  const handleSubmit = useCallback(async (e: Event) => {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);

    // TODO: configuration
    await fetch("http://localhost:8000/webhook", {
      method: "PUT",
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });

    location.reload();
  }, []);

  const handleDelete = useCallback(
    (id: number) => async (e: Event) => {
      e.preventDefault();

      // TODO: configuration
      await fetch(`http://localhost:8000/webhook/${id}`, {
        method: "DELETE",
      });

      location.reload();
    },
    []
  );

  const modalRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <div class="float-right pb-4">
        <button class="btn" onClick={() => modalRef.current?.showModal()}>
          +
        </button>
        <Modal title="Register Webhook" ref={modalRef}>
          <form onSubmit={handleSubmit} class="form-control w-full">
            <label class="label">
              <span class="label-text">Contract Address</span>
            </label>
            <input
              type="text"
              name="sourceAddress"
              required
              class="input input-bordered w-full max-w-xs"
            />
            <label class="label">
              <span class="label-text">ABI Hash</span>
            </label>
            <input
              type="text"
              name="abiHash"
              required
              class="input input-bordered w-full max-w-xs"
            />
            <label class="label">
              <span class="label-text">Webhook URL</span>
            </label>
            <input
              type="text"
              name="webhookUrl"
              required
              class="input input-bordered w-full max-w-xs"
            />
            <input type="submit" class="btn" />
          </form>
        </Modal>
      </div>

      <CollapsibleTable
        headers={["Contract Address", "ABI Hash", "Webhook URL"]}
      >
        {entries.map((entry) => (
          <CollapsibleTableRow
            collapsible={
              <>
                <div class="float-right">
                  <button
                    class="btn btn-warning"
                    onClick={handleDelete(entry.id)}
                  >
                    X
                  </button>
                </div>
                <div class="float-left">
                  <div>Contract Address: {entry.sourceAddress}</div>
                  <div>ABI Hash: {entry.abiHash}</div>
                  <div>Webhook URL: {entry.webhookUrl}</div>
                  {entry.topic1 && <div>Topic 1: {entry.topic1}</div>}
                  {entry.topic2 && <div>Topic 2: {entry.topic2}</div>}
                  {entry.topic3 && <div>Topic 3: {entry.topic3}</div>}
                </div>
              </>
            }
          >
            {entry.sourceAddress}
            {entry.abiHash}
            {entry.webhookUrl}
          </CollapsibleTableRow>
        ))}
      </CollapsibleTable>
    </>
  );
};

export default ListWebhook;
