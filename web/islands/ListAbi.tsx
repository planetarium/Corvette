import type { AbiEvent } from "https://esm.sh/abitype@0.9.0";
import { useCallback, useRef } from "preact/hooks";
import {
  CollapsibleTable,
  CollapsibleTableRow,
} from "~/components/CollapsibleTable.tsx";

export interface AbiEntry {
  id: string;
  signature: string;
  abi: AbiEvent;
}

interface AbiTableProps {
  abi: AbiEvent;
}

const AbiTable = ({ abi }: AbiTableProps) => {
  return (
    <table class="table">
      <thead>
        <tr>
          <td>name</td>
          <td>type</td>
          <td>indexed</td>
        </tr>
      </thead>
      {abi.inputs.map((input) => (
        <tr>
          <td>{input.name || "(empty)"}</td>
          <td>
            {input.type} ({input.internalType})
          </td>
          <td>{String(input.indexed)}</td>
        </tr>
      ))}
    </table>
  );
};

const getSignatureFromAbiEvent = (event: AbiEvent) => {
  return `${event.name}(${
    event.inputs
      .map((input) =>
        `${input.type}${input.indexed ? " indexed" : ""} ${input.name}`
      )
      .join(", ")
  })`;
};

interface ListAbiProps {
  entries: AbiEntry[];
}

export default function ListAbi({ entries }: ListAbiProps) {
  const handleSubmit = useCallback((e: Event) => {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);
    const abiJson = formData.get("abiJson");

    fetch(`http://localhost:8000/abi`, {
      method: "PUT",
      body: abiJson,
    });
  }, []);

  const handleDelete = useCallback(
    (id: string) => (e: Event) => {
      e.preventDefault();

      fetch(`http://localhost:8000/abi/${id}`, {
        method: "DELETE",
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
          </form>
          <form method="dialog" class="modal-backdrop">
            <button>close</button>
          </form>
        </dialog>
      </div>
      <CollapsibleTable headers={["ID", "Signature"]}>
        {entries.map((entry) => (
          <CollapsibleTableRow
            collapsible={
              <>
                <button
                  onClick={handleDelete(entry.id)}
                  class="btn btn-warning float-right"
                >
                  X
                </button>
                <div class="float-left">
                  <div>ID: {entry.id}</div>
                  <div>Sig: {getSignatureFromAbiEvent(entry.abi)}</div>
                </div>
                <AbiTable abi={entry.abi} />
              </>
            }
          >
            {entry.id}
            {entry.signature}
          </CollapsibleTableRow>
        ))}
      </CollapsibleTable>
    </>
  );
}
