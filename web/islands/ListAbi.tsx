import { useCallback, useRef, useState } from "preact/hooks";

import { AbiTable } from "~/components/AbiTable.tsx";
import {
  CollapsibleTable,
  CollapsibleTableRow,
} from "~/components/CollapsibleTable.tsx";
import { Modal } from "~/components/Modal.tsx";
import { Toast, type ToastProps } from "~/components/Toast.tsx";

import type { AbiEvent } from "https://esm.sh/abitype@0.9.0";

export interface AbiEntry {
  hash: string;
  signature: string;
  abi: AbiEvent;
}

const getSignatureFromAbiEvent = (event: AbiEvent) => {
  return `${event.name}(${
    event.inputs
      .map((input) =>
        `${input.type}${input.indexed ? " indexed" : ""} ${input.name}`
      )
      .join(", ")
  })`;
};

interface Props {
  entries: AbiEntry[];
}

export const ListAbi = ({ entries }: Props) => {
  const modalRef = useRef<HTMLDialogElement>(null);
  const [toast, setToast] = useState<ToastProps | null>(null);

  const handleSubmit = useCallback(async (e: Event) => {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);
    const abiJson = formData.get("abiJson");

    const res = await fetch(`/api/abi`, {
      method: "POST",
      body: abiJson,
    });

    if (!res.ok) {
      setToast({ type: "error", text: "Failed to register ABI entries." });
      return;
    }

    if ((await res.json()).length === 0) {
      setToast({ type: "info", text: "No new ABI entries to register." });
      modalRef.current?.close();
      return;
    }

    location.reload();
  }, []);

  const handleDelete = useCallback(
    (hash: string) => async (e: Event) => {
      e.preventDefault();

      const res = await fetch(`/api/abi`, {
        method: "DELETE",
        body: JSON.stringify({ hash }),
      });

      if (!res.ok) {
        setToast({ type: "error", text: "Failed to delete an ABI entry." });
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
        <Modal title="Register ABI" ref={modalRef}>
          <form onSubmit={handleSubmit} class="form-control w-full">
            <label class="label">
              <span class="label-text">ABI JSON</span>
            </label>
            <textarea
              type="text"
              name="abiJson"
              required
              class="input input-bordered w-full max-w-xs"
            />
            <input type="submit" class="btn" />
          </form>
        </Modal>
        {toast && <Toast {...toast} />}
      </div>
      <CollapsibleTable headers={["Hash", "Signature"]}>
        {entries.map((entry) => (
          <CollapsibleTableRow
            collapsible={
              <>
                <div class="float-right">
                  <button
                    class="btn btn-warning"
                    onClick={handleDelete(entry.hash)}
                  >
                    X
                  </button>
                </div>
                <div class="float-left">
                  <div>Hash: {entry.hash}</div>
                  <div>Sig: {getSignatureFromAbiEvent(entry.abi)}</div>
                </div>
                <AbiTable abi={entry.abi} />
              </>
            }
          >
            {entry.hash}
            {entry.signature}
          </CollapsibleTableRow>
        ))}
      </CollapsibleTable>
    </>
  );
};

export default ListAbi;
