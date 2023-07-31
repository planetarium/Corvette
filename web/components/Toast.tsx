import { useEffect, useRef } from "preact/hooks";

export interface ToastProps {
  text: string;
  type?: "info" | "success" | "warning" | "error";
  timeoutMs?: number;
}

export const Toast = ({ type, text, timeoutMs = 3000 }: ToastProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const timeoutRef = useRef<number | null>();
  const alertClass = type ? `alert-${type}` : "";

  useEffect(() => {
    dialogRef.current?.show();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      dialogRef.current?.close();
    }, timeoutMs);
  });

  return (
    <dialog ref={dialogRef} class="modal" style="width: 0; height: 0;">
      <form method="dialog" class="toast">
        <div class={`alert ${alertClass} inline`}>
          <span>{text}</span>
          <button class="btn btn-sm btn-ghost btn-circle">✕</button>
        </div>
      </form>
    </dialog>
  );
};
