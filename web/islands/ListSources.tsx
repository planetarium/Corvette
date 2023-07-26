import { useCallback, useRef } from "preact/hooks";

import {
  CollapsibleTable,
  CollapsibleTableRow,
} from "~/components/CollapsibleTable.tsx";
import { Modal } from "~/components/Modal.tsx";

export interface SourceEntry {
  address: string;
  abi: string;
  abiHash: string;
}

interface ListSourcesProps {
  entries: SourceEntry[];
  apiUrl: string
}

export const ListSources = ({ apiUrl, entries }: ListSourcesProps) => {
  const handleSubmit = useCallback(async (e: Event) => {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);

    await fetch(`${apiUrl}/sources`, {
      method: "PUT",
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });

    location.reload();
  }, []);

  const handleDelete = useCallback(
    (address: string, abiHash: string) => async (e: Event) => {
      e.preventDefault();

      await fetch(`${apiUrl}/sources`, {
        method: "DELETE",
        body: JSON.stringify({ address, abiHash }),
      });

      location.reload();
    },
    []
  );

  const handleWebhookTest = useCallback(
    (address: string, abiHash: string) => (e: Event) => {
      e.preventDefault();

      fetch(`${apiUrl}/sources/testWebhook`, {
        method: "POST",
        body: JSON.stringify({ address, abiHash }),
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
        <Modal title="Register Event Source" ref={modalRef}>
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
              <span class="label-text">ABI Hash</span>
            </label>
            <input
              type="text"
              name="abiHash"
              required
              class="input input-bordered w-full max-w-xs"
            />
            <input type="submit" class="btn" />
          </form>
        </Modal>
      </div>

      <CollapsibleTable headers={["Contract Address", "ABI Hash"]}>
        {entries.map((entry) => (
          <CollapsibleTableRow
            collapsible={
              <>
                <div class="float-right join join-horizontal">
                  <button
                    class="btn join-item"
                    onClick={handleWebhookTest(entry.address, entry.abiHash)}
                  >
                    Webhook Test
                  </button>
                  <button
                    class="btn btn-warning join-item"
                    onClick={handleDelete(entry.address, entry.abiHash)}
                  >
                    X
                  </button>
                </div>
                <div class="float-left">
                  <div>Contract Address: {entry.address}</div>
                  <div>ABI Hash: {entry.abiHash}</div>
                  <div>ABI Signature: {entry.abi}</div>
                </div>
              </>
            }
          >
            {entry.address}
            {entry.abiHash}
          </CollapsibleTableRow>
        ))}
      </CollapsibleTable>
    </>
  );
};

export default ListSources;
