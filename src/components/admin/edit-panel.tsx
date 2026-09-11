"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n-client";

type BrowserNavigation = EventTarget & {
  traverseTo: (key: string) => { finished: Promise<unknown> };
};

export function EditPanel({
  title,
  description,
  children,
  footer,
  onClose,
  dirty = false,
  saving = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  dirty?: boolean;
  saving?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const zh = useLocale() === "zh";
  const router = useRouter();
  const [confirmClose, setConfirmClose] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const pendingTraversal = useRef<string | null>(null);
  const allowTraversal = useRef(false);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (!dirty && !saving) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigation = (window as Window & { navigation?: BrowserNavigation })
      .navigation;
    const back = (rawEvent: Event) => {
      const event = rawEvent as Event & {
        navigationType: string;
        destination: { url: string; key: string };
      };
      if (
        allowTraversal.current ||
        event.navigationType !== "traverse" ||
        !event.cancelable
      )
        return;
      // Cancel before history changes; popstate is too late for the App Router.
      event.preventDefault();
      if (!saving) {
        const destination = new URL(event.destination.url);
        pendingTraversal.current = event.destination.key;
        setPendingHref(
          destination.pathname + destination.search + destination.hash,
        );
        setConfirmClose(true);
      }
    };
    window.addEventListener("beforeunload", handler);
    navigation?.addEventListener("navigate", back);
    return () => {
      window.removeEventListener("beforeunload", handler);
      navigation?.removeEventListener("navigate", back);
    };
  }, [dirty, saving]);
  const close = () => {
    if (saving) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };
  return (
    <dialog
      ref={ref}
      className="admin-edit-panel"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClickCapture={(event) => {
        const link = (event.target as HTMLElement).closest("a");
        if (!link || link.target === "_blank" || (!dirty && !saving)) return;
        event.preventDefault();
        event.stopPropagation();
        if (!saving) {
          setPendingHref(link.getAttribute("href"));
          setConfirmClose(true);
        }
      }}
    >
      <header className="panel-header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button
          type="button"
          className="panel-close"
          aria-label={zh ? "关闭编辑" : "Close editor"}
          disabled={saving}
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      <div className="panel-body">{children}</div>
      {confirmClose ? (
        <div className="panel-footer" role="alert">
          <p>
            {zh ? "有未保存的修改，是否放弃？" : "Discard unsaved changes?"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="admin-control"
              onClick={() => {
                setConfirmClose(false);
                setPendingHref(null);
                pendingTraversal.current = null;
                Array.from(
                  ref.current?.querySelectorAll<HTMLElement>(
                    "input:not([disabled]):not([type=file]):not([type=hidden]), textarea:not([disabled]), select:not([disabled])",
                  ) || [],
                )
                  .find(
                    (field) =>
                      field.getClientRects().length > 0 &&
                      !field.closest("details:not([open])"),
                  )
                  ?.focus();
              }}
            >
              {zh ? "继续编辑" : "Keep editing"}
            </button>
            <button
              type="button"
              className="admin-control"
              onClick={() => {
                const navigation = (
                  window as Window & { navigation?: BrowserNavigation }
                ).navigation;
                if (pendingTraversal.current && navigation) {
                  allowTraversal.current = true;
                  void navigation
                    .traverseTo(pendingTraversal.current)
                    .finished.catch(() => {
                      allowTraversal.current = false;
                    });
                } else if (pendingHref) router.push(pendingHref);
                else onClose();
              }}
            >
              {zh ? "放弃修改" : "Discard changes"}
            </button>
          </div>
        </div>
      ) : (
        footer && <footer className="panel-footer">{footer}</footer>
      )}
    </dialog>
  );
}
