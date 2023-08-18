import { useEffect, useRef } from "preact/hooks";

import { Modal } from "web/components/Modal.tsx";
import type { ToastProps } from "web/components/Toast.tsx";

const Input = (props: { name: string; pattern?: string }) => (
  <input
    type="text"
    pattern="^0x[a-fA-F0-9]{64}$"
    placeholder="0x0000000000000000000000000000000000000000000000000000000000000000"
    class="input input-bordered w-full max-w-xs"
    {...props}
  />
);

export interface TestWebhookProps {
  address: string;
  abiHash: string;
  setToast: (props: ToastProps | null) => void;
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
      <Modal title="Test Webhook" ref={modalRef} onClose={() => setToast(null)}>
        <form onSubmit={handleSubmit} class="form-control w-full">
          <label class="label">
            Transaction Hash
            <Input name="txHash" />
          </label>
          <label class="label">
            Block Hash
            <Input name="blockHash" />
          </label>
          <label class="label">
            Topic 1
            <Input name="topic1" />
          </label>
          <label class="label">
            Topic 2
            <Input name="topic2" />
          </label>
          <label class="label">
            Topic 3
            <Input name="topic3" />
          </label>
          <label class="label">
            Data
            <Input name="data" pattern="^0x([a-fA-F0-9]{2}){32,}$" />
          </label>
          <label class="label">
            <span class="label-text-alt">
              * 32 bytes hex string (64 characters) prepended by 0x (total 66
              characters)
              <br />* data can be longer than 32 bytes
            </span>
          </label>
          <input type="submit" class="btn" />
        </form>
      </Modal>
    </>
  );
};
