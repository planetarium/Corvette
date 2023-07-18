import { useCallback, useRef } from "preact/hooks";

import { AbiTable } from "~/components/AbiTable.tsx";
import {
  CollapsibleTable,
  CollapsibleTableRow,
} from "~/components/CollapsibleTable.tsx";
import { Modal } from "~/components/Modal.tsx";

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
  const handleSubmit = useCallback(async (e: Event) => {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);
    const abiJson = formData.get("abiJson");

    await fetch(`http://localhost:8000/abi`, {
      method: "PUT",
      body: abiJson,
    });

    location.reload();
  }, []);

  const handleDelete = useCallback(
    (hash: string) => async (e: Event) => {
      e.preventDefault();

      await fetch(`http://localhost:8000/abi/${hash}`, {
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
