import { useCallback, useRef } from "preact/hooks";
import {
  CollapsibleTable,
  CollapsibleTableRow,
} from "~/components/CollapsibleTable.tsx";

export interface WebhookEntry {
  address: string;
  abiId: string;
  callbackUrl: string;
}

interface ListWebhookProps {
  entries: WebhookEntry[];
}

export default ({ entries }: ListWebhookProps) => {
  const handleSubmit = useCallback(async (e: Event) => {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);

    await fetch("http://localhost:8000/callback", {
      method: "PUT",
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });

    location.reload();
  }, []);

  const handleDelete = useCallback(
    (address: string, abiId: string, callbackUrl: string) =>
    async (
      e: Event,
    ) => {
      e.preventDefault();

      await fetch(`http://localhost:8000/callback`, {
        method: "DELETE",
        body: JSON.stringify({ address, abiId, callbackUrl }),
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
                name="address"
                required
                class="input input-bordered w-full max-w-xs"
              />
              <label class="label">
                <span class="label-text">ABI ID</span>
              </label>
              <input
                type="text"
                name="abiId"
                required
                class="input input-bordered w-full max-w-xs"
              />
              <label class="label">
                <span class="label-text">Callback URL</span>
              </label>
              <input
                type="text"
                name="callbackUrl"
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
        headers={["Contract Address", "ABI ID", "Callback Url"]}
      >
        {entries.map((entry) => (
          <CollapsibleTableRow
            collapsible={
              <>
                <div class="float-right">
                  <button
                    class="btn btn-warning"
                    onClick={handleDelete(
                      entry.address,
                      entry.abiId,
                      entry.callbackUrl,
                    )}
                  >
                    X
                  </button>
                </div>
                <div class="float-left">
                  <div>Contract Address: {entry.address}</div>
                  <div>ABI ID: {entry.abiId}</div>
                  <div>Callback URL: {entry.callbackUrl}</div>
                </div>
              </>
            }
          >
            {entry.address}
            {entry.abiId}
            {entry.callbackUrl}
          </CollapsibleTableRow>
        ))}
      </CollapsibleTable>
    </>
  );
};
