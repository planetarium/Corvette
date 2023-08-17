import { useEffect, useRef } from "preact/hooks";

import { Modal } from "web/components/Modal.tsx";
import type { ToastProps } from "web/components/Toast.tsx";

export interface TestWebhookProps {
  address: string;
  abiHash: string;
  setToast: (props: ToastProps) => void;
}
export const TestWebhookDialog = ({ setToast, ...props }: TestWebhookProps) => {
  const modalRef = useRef<HTMLDialogElement>(null);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();

    const formData = new FormData(e.target as HTMLFormElement);

    const res = await fetch(`/api/sources/testWebhook`, {
      method: "POST",
      body: JSON.stringify({
        ...props,
        ...Object.fromEntries([...formData.entries()]),
      }),
    });

    if (!res.ok) {
      setToast({ type: "error", text: "Failed to trigger test webhook." });
    }

    setToast({ type: "success", text: "Test webhook triggered." });
  };

  useEffect(() => {
    modalRef.current?.show();
  });

  return (
    <>
      <Modal title="Test Webhook" ref={modalRef}>
        <form onSubmit={handleSubmit} class="form-control w-full">
          <label>
            Transaction Hash
            <input
              type="text"
              name="txHash"
              class="input input-bordered w-full max-w-xs"
            />
          </label>
          <label>
            Block Hash
            <input
              type="text"
              name="blockHash"
              class="input input-bordered w-full max-w-xs"
            />
          </label>
          <label>
            Topic 1
            <input
              type="text"
              name="topic1"
              class="input input-bordered w-full max-w-xs"
            />
          </label>
          <label>
            Topic 2
            <input
              type="text"
              name="topic2"
              class="input input-bordered w-full max-w-xs"
            />
          </label>
          <label>
            Topic 3
            <input
              type="text"
              name="topic3"
              class="input input-bordered w-full max-w-xs"
            />
          </label>
          <label>
            Data
            <input
              type="text"
              name="data"
              class="input input-bordered w-full max-w-xs"
            />
          </label>
          <input type="submit" class="btn" />
        </form>
      </Modal>
    </>
  );
};
