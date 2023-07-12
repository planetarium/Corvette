import { useCallback, useRef } from "preact/hooks";
import { CollapsibleTable, CollapsibleTableRow } from "~/components/CollapsibleTable.tsx";

export interface SourceEntry {
  address: string;
  abi: string;
  abiId: string;
}

interface ListSourcesProps {
  entries: SourceEntry[];
}

export default ({ entries }: ListSourcesProps) => {
  const handleSubmit = useCallback((e: Event) => {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);

    fetch("http://localhost:8000/sources", {
      method: "PUT",
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });
  }, []);

  const handleDelete = useCallback(
    (address: string, abiId: string) => (e: Event) => {
      e.preventDefault();

      fetch(`http://localhost:8000/sources`, {
        method: "DELETE",
        body: JSON.stringify({ address, abiId }),
      });
    },
    []
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
            <button class="btn btn-sm btn-circle btn-ghost float-right">✕</button>
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

      <CollapsibleTable headers={["Contract Address", "ABI ID", "ABI"]}>
        {entries.map((entry) => (
          <CollapsibleTableRow
            collapsible={
              <>
                <button
                  onClick={handleDelete(entry.address, entry.abiId)}
                  class="btn btn-warning float-right"
                >
                  X
                </button>
              </>
            }
          >
            {entry.address}
            {entry.abiId}
            {entry.abi}
          </CollapsibleTableRow>
        ))}
      </CollapsibleTable>
    </>
  );
};
