import type { ComponentChildren, Ref } from "preact";
import { forwardRef } from "preact/compat";

interface Props {
  title: string;
  children: ComponentChildren;
}

export const Modal = forwardRef(
  ({ title, children }: Props, ref: Ref<HTMLDialogElement>) => {
    return (
      <dialog ref={ref} class="modal">
        <form method="dialog" class="modal-box">
          <button class="btn btn-sm btn-circle btn-ghost float-right">✕</button>
          <h3 class="font-bold text-lg">{title}</h3>
          {children}
        </form>
        <form method="dialog" class="modal-backdrop bg-black opacity-30">
          <button aria-label="close" />
        </form>
      </dialog>
    );
  },
);
