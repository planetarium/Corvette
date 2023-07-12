import type { ComponentChild } from "preact";

interface CollapsibleTableRowProps {
  children: ComponentChild | ComponentChild[];
  collapsible?: ComponentChild;
}

export const CollapsibleTableRow = ({
  children,
  collapsible,
}: CollapsibleTableRowProps) => {
  const columns = Array.isArray(children) ? children : [children];
  const wClass = `w-1/${columns.length}`;
  const collapsePlusClass = collapsible ? "collapse-plus" : "";

  return (
    <div class={`bg-base-200 join-item collapse ${collapsePlusClass}`}>
      <input type="checkbox" class="peer" />
      <div class="collapse-title">
        {columns.map((column) => (
          <div class={`${wClass} px-2 inline-block truncate text-ellipsis`}>
            {column}
          </div>
        ))}
      </div>
      {collapsible && <div class="collapse-content w-full">{collapsible}</div>}
    </div>
  );
};

interface CollapsibleTableProps {
  headers: string[];
  children: ReturnType<typeof CollapsibleTableRow>[];
}

export const CollapsibleTable = ({
  headers,
  children,
}: CollapsibleTableProps) => {
  return (
    <div class="join join-vertical w-full min-w-min">
      <div class="bg-base-300 collapse-title join-item">
        {headers.map((header) => (
          <div class={`w-1/${headers.length} px-2 inline-block`}>{header}</div>
        ))}
      </div>
      {children}
    </div>
  );
};

export default CollapsibleTable;
