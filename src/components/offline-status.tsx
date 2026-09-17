"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const browserOnline = () => navigator.onLine;
const serverOnline = () => true;

export function OfflineStatus() {
  const online = useSyncExternalStore(subscribe, browserOnline, serverOnline);
  const locale = useLocale();
  // This is only a connection notice. Reconnection must never replay a payment,
  // upload, or form submission; each workflow owns its explicit retry action.
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {!online && (
        <div className="pointer-events-none fixed inset-x-4 z-50 mx-auto flex max-w-xl items-start gap-3 rounded-xl border px-4 py-3 shadow-sm"
          style={{ bottom: "max(1rem, env(safe-area-inset-bottom))", background: tone.amberSoft, borderColor: tone.line, color: tone.ink }}>
          <WifiOff size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-[13px] leading-5">
            {locale === "zh"
              ? "当前已断网。连接恢复后，请先核对操作结果，再决定是否重新提交。"
              : "You’re offline. When connected again, check your last action’s result before resubmitting."}
          </p>
        </div>
      )}
    </div>
  );
}
