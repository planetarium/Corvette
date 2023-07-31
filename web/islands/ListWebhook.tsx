import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  CollapsibleTable,
  CollapsibleTableRow,
} from "~/components/CollapsibleTable.tsx";
import { Modal } from "~/components/Modal.tsx";
import { Toast, ToastProps } from "~/components/Toast.tsx";
import { SearchDropdown } from "~/islands/SearchDropdown.tsx";
import { SourceEntry } from "~/islands/ListSources.tsx";

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
  const modalRef = useRef<HTMLDialogElement>(null);
  const [toast, setToast] = useState<ToastProps | null>(null);
  const [sources, setSources] = useState<SourceEntry[]>([]);

  useEffect(() => {
    const getAbis = async () => {
      const res = await fetch("/api/sources");
      setSources(await res.json());
    };

    getAbis();
  }, []);

  const handleSubmit = useCallback(async (e: Event) => {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);
    const addressAbiHash = formData.get("address_abiHash");
    if (!addressAbiHash) {
      setToast({ type: "error", text: "Failed to register a webhook entry." });
      return;
    }

    const [address, abiHash] = addressAbiHash.toString().split(":");
    formData.set("sourceAddress", address);
    formData.set("abiHash", abiHash);

    const res = await fetch("/api/webhook", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });

    if (!res.ok) {
      setToast({ type: "error", text: "Failed to register a webhook entry." });
      return;
    }

    location.reload();
  }, []);

  const handleDelete = useCallback(
    (id: number) => async (e: Event) => {
      e.preventDefault();

      const res = await fetch(`/api/webhook/`, {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        setToast({ type: "error", text: "Failed to delete a webhook entry." });
        return;
      }

      location.reload();
    },
    [],
  );

  return (
    <>
      <div class="float-right pb-4">
        <button class="btn" onClick={() => modalRef.current?.showModal()}>
          +
        </button>
        <Modal title="Register Webhook" ref={modalRef}>
          <form onSubmit={handleSubmit} class="form-control w-full">
            <label class="label">
              <span class="label-text">Event Source</span>
            </label>
            <SearchDropdown
              name="address_abiHash"
              list={sources}
              entrySelector={(e) => `${e.address}:${e.abiHash}`}
              entryTransform={(e) => (
                <>
                  <div>Address: {e.address}</div>
                  <div>ABI: {e.abiHash}</div>
                </>
              )}
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
        {toast && <Toast {...toast} />}
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
