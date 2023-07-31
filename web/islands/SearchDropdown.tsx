import { useCallback, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentChild, VNode } from "preact";

export interface SearchDropdownProps<T> {
  list: T[];
  defaultSelected?: T;
  name?: string;
  onSelect?: (selected: T) => unknown;
  entrySelector?: (entry: T) => string;
  entryTransform?: (entry: T) => ComponentChild;
}

export const SearchDropdown = <T,>(props: SearchDropdownProps<T>) => {
  if (props.list.length === 0) return null;

  if (!props.entrySelector && typeof props.list[0] !== "string") {
    throw new Error(
      "entrySelector should be provided if list is not string array.",
    );
  }

  const entrySelector = (entry: T | string | undefined) =>
    typeof entry === "string" ? entry : entry && props.entrySelector!(entry);

  const entryTransform = props.entryTransform ??
    (typeof props.list[0] === "object"
      ? entrySelector
      : (entry: T) => entry as ComponentChild);

  const [input, setInput] = useState<string>(
    entrySelector(props.defaultSelected) ?? "",
  );
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const list = useMemo(
    () =>
      new Map<string, T>(
        props.list.map((e) => [entrySelector(e) ?? (e as string), e]),
      ),
    [props.list, props.entrySelector],
  );

  const filteredList = useMemo(
    () => [...list.entries()].filter(([k]) => k.includes(input)),
    [list, input],
  );

  const setDetailsOpen = (open: boolean) => {
    if (detailsRef.current) detailsRef.current.open = open;
  };

  const onSelect = useCallback((e: T) => {
    setInput(entrySelector(e) ?? (e as string));
    setDetailsOpen(false);
    props.onSelect?.(e);
  }, []);

  return (
    <>
      <details class="dropdown w-full max-w-xs" ref={detailsRef}>
        <summary class="list-none">
          <input
            type="text"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onFocus={() => setDetailsOpen(true)}
            class="input input-bordered w-full max-w-xs"
          />
        </summary>
        <ul class="shadow menu dropdown-content bg-base-100 rounded-box">
          {filteredList.map(([k, v]) => (
            <div
              class="btn"
              value={k}
              onClick={() => onSelect(v)}
            >
              <div class="text-left truncate">{entryTransform(v)}</div>
            </div>
          ))}
        </ul>
      </details>
      {props.name && <input type="hidden" name={props.name} value={input} />}
    </>
  );
};
