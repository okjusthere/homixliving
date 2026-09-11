"use client";
import { useEffect, useId, useRef } from "react";
import { AlertCircle, X } from "lucide-react";
export function ContentErrorDialog({
  message,
  onClose,
  zh,
}: {
  message: string;
  onClose: () => void;
  zh: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    title = useId(),
    description = useId();
  useEffect(() => {
    const element = dialog.current;
    if (message && element && !element.open) element.showModal();
    if (!message && element?.open) element.close();
  }, [message]);
  return (
    <dialog
      ref={dialog}
      className="studio-error-dialog"
      aria-labelledby={title}
      aria-describedby={description}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <button
        type="button"
        className="studio-dialog-close"
        aria-label={zh ? "关闭提示" : "Close notification"}
        onClick={onClose}
      >
        <X size={20} />
      </button>
      <AlertCircle size={26} aria-hidden="true" />
      <h2 id={title}>
        {zh ? "暂时无法完成，请检查" : "Please check before continuing"}
      </h2>
      <p id={description}>
        {message
          .split("\n")
          .map((line) => {
            const versions = line.split(" / ");
            return versions.length === 2 ? versions[zh ? 1 : 0] : line;
          })
          .join("\n")}
      </p>
      <button
        type="button"
        className="studio-button"
        onClick={onClose}
        autoFocus
      >
        {zh ? "知道了，返回修改" : "Got it, return to editing"}
      </button>
    </dialog>
  );
}
