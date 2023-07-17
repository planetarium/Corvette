import { useCallback, useRef } from "preact/hooks";
import {
  CollapsibleTable,
  CollapsibleTableRow,
} from "~/components/CollapsibleTable.tsx";

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

export default ({ entries }: ListWebhookProps) => {
  const handleSubmit = useCallback(async (e: Event) => {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);

    await fetch("http://localhost:8000/webhook", {
      method: "PUT",
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });

    location.reload();
  }, []);

  const handleDelete = useCallback(
    (id: number) => async (e: Event) => {
      e.preventDefault();

      await fetch(`http://localhost:8000/webhook/${id}`, {
        method: "DELETE",
      });

      location.reload();
    },
    [],
  );

  const modalRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <div class="float-right pb-4">
        <button class="btn" onClick={() => modalRef.current?.showModal()}>
          +
        </button>
        <dialog ref={modalRef} class="modal">
          <form method="dialog" class="modal-box">
            <button class="btn btn-sm btn-circle btn-ghost float-right">
              ✕
            </button>
            <h3 class="font-bold text-lg">Register Webhook</h3>
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
          </form>
          <form method="dialog" class="modal-backdrop">
            <button>close</button>
          </form>
        </dialog>
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
