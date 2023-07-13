import { useCallback, useRef } from "preact/hooks";
import {
  CollapsibleTable,
  CollapsibleTableRow,
} from "~/components/CollapsibleTable.tsx";

export interface SourceEntry {
  address: string;
  abi: string;
  abiId: string;
}

interface ListSourcesProps {
  entries: SourceEntry[];
}

export default ({ entries }: ListSourcesProps) => {
  const handleSubmit = useCallback(async (e: Event) => {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);

    await fetch("http://localhost:8000/sources", {
      method: "PUT",
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });

    location.reload();
  }, []);

  const handleDelete = useCallback(
    (address: string, abiId: string) => async (e: Event) => {
      e.preventDefault();

      await fetch(`http://localhost:8000/sources`, {
        method: "DELETE",
        body: JSON.stringify({ address, abiId }),
      });

      location.reload();
    },
    [],
  );

  const handleWebhookTest = useCallback(
    (address: string, abiId: string) => (e: Event) => {
      e.preventDefault();

      fetch(`http://localhost:8000/callback/test`, {
        method: "POST",
        body: JSON.stringify({ address, abiId }),
      });
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
            <h3 class="font-bold text-lg">Register Event Source</h3>
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
              <input type="submit" class="btn" />
            </form>
          </form>
          <form method="dialog" class="modal-backdrop">
            <button>close</button>
          </form>
        </dialog>
      </div>

      <CollapsibleTable headers={["Contract Address", "ABI ID"]}>
        {entries.map((entry) => (
          <CollapsibleTableRow
            collapsible={
              <>
                <div class="float-right join join-horizontal">
                  <button
                    class="btn join-item"
                    onClick={handleWebhookTest(entry.address, entry.abiId)}
                  >
                    Webhook Test
                  </button>
                  <button
                    class="btn btn-warning join-item"
                    onClick={handleDelete(entry.address, entry.abiId)}
                  >
                    X
                  </button>
                </div>
                <div class="float-left">
                  <div>Contract Address: {entry.address}</div>
                  <div>ABI ID: {entry.abiId}</div>
                  <div>ABI Signature: {entry.abi}</div>
                </div>
              </>
            }
          >
            {entry.address}
            {entry.abiId}
          </CollapsibleTableRow>
        ))}
      </CollapsibleTable>
    </>
  );
};
