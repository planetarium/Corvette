import type { ComponentChildren, Ref } from "preact";
import { forwardRef } from "preact/compat";

interface Props {
  title: string;
  children: ComponentChildren;
  onClose?: () => void;
}

export const Modal = forwardRef(
  ({ title, children, ...props }: Props, ref: Ref<HTMLDialogElement>) => {
    return (
      <dialog ref={ref} class="modal" onClose={props.onClose}>
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
