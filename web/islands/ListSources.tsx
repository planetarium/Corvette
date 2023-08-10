import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import {
  CollapsibleTable,
  CollapsibleTableRow,
} from "~/components/CollapsibleTable.tsx";
import { Modal } from "~/components/Modal.tsx";
import { Toast, type ToastProps } from "~/components/Toast.tsx";
import { SearchDropdown } from "~/islands/SearchDropdown.tsx";
import type { AbiEntry } from "~/islands/ListAbi.tsx";

export interface SourceEntry {
  address: string;
  abi: string;
  abiHash: string;
}

interface ListSourcesProps {
  entries: SourceEntry[];
}

export const ListSources = ({ entries }: ListSourcesProps) => {
  const modalRef = useRef<HTMLDialogElement>(null);
  const [toast, setToast] = useState<ToastProps | null>(null);
  const [abis, setAbis] = useState<AbiEntry[]>([]);

  useEffect(() => {
    const getAbis = async () => {
      const res = await fetch("/api/abi");
      setAbis(await res.json());
    };

    getAbis();
  }, []);

  const handleSubmit = useCallback(async (e: Event) => {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);

    const res = await fetch("/api/sources", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });

    if (!res.ok) {
      setToast({
        type: "error",
        text: "Failed to register a event source entry.",
      });
      return;
    }

    location.reload();
  }, []);

  const handleDelete = useCallback(
    (address: string, abiHash: string) => async (e: Event) => {
      e.preventDefault();

      const res = await fetch(`/api/sources`, {
        method: "DELETE",
        body: JSON.stringify({ address, abiHash }),
      });

      if (!res.ok) {
        setToast({
          type: "error",
          text: "Failed to delete an event source entry.",
        });
        return;
      }

      location.reload();
    },
    [],
  );

  const handleWebhookTest = useCallback(
    (address: string, abiHash: string) => async (e: Event) => {
      e.preventDefault();

      const res = await fetch(`/api/sources/testWebhook`, {
        method: "POST",
        body: JSON.stringify({ address, abiHash }),
      });

      if (!res.ok) {
        setToast({ type: "error", text: "Failed to trigger test webhook." });
      }

      setToast({ type: "success", text: "Test webhook triggered." });
    },
    [],
  );

  return (
    <>
      <div class="float-right pb-4">
        <button class="btn" onClick={() => modalRef.current?.show()}>
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
            <SearchDropdown
              name="abiHash"
              list={abis}
              entrySelector={(e) => e.hash}
            />
            <input type="submit" class="btn" />
          </form>
        </Modal>
        {toast && <Toast {...toast} />}
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
