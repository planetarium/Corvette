import type { AbiEvent } from "https://esm.sh/abitype@0.9.0";
import { useCallback, useRef } from "preact/hooks";
import {
  CollapsibleTable,
  CollapsibleTableRow,
} from "~/components/CollapsibleTable.tsx";

export interface AbiEntry {
  hash: string;
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
        <dialog ref={modalRef} class="modal">
          <form method="dialog" class="modal-box">
            <button class="btn btn-sm btn-circle btn-ghost float-right">
              ✕
            </button>
            <h3 class="font-bold text-lg">Register ABI</h3>
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
}
