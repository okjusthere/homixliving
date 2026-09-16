"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import type { Notification } from "@/db/schema";
import { dbTimeMs } from "@/lib/db-time";
import { startNotificationPolling } from "@/lib/notification-polling";

const M = {
  en: {
    aria: "Notifications",
    empty: "No notifications yet",
    markAll: "Mark all read",
    title: "Notifications",
    loading: "Loading notifications…",
    error: "Couldn't load notifications. Close and reopen to retry.",
  },
  zh: {
    aria: "通知",
    empty: "暂无通知",
    markAll: "全部已读",
    title: "通知",
    loading: "正在加载通知…",
    error: "通知加载失败，请关闭后重新打开重试。",
  },
} as const;

function timeAgo(iso: string | null, locale: "en" | "zh"): string {
  const t = dbTimeMs(iso);
  if (t === null) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return locale === "zh" ? "刚刚" : "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return locale === "zh" ? `${m} 分钟前` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return locale === "zh" ? `${h} 小时前` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return locale === "zh" ? `${d} 天前` : `${d}d ago`;
}

export function NotificationBell({ agentId }: { agentId: number }) {
  const router = useRouter();
  const locale = useLocale();
  const t = M[locale];
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const client = useRef<ReturnType<typeof startNotificationPolling> | null>(null);

  useEffect(() => {
    const polling = startNotificationPolling(agentId, setUnread);
    client.current = polling;
    return () => { polling.stop(); client.current = null; };
  }, [agentId]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    client.current?.loadDetails()
      .then((details) => { if (active) setItems(details); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => { active = false; document.removeEventListener("mousedown", handler); };
  }, [open]);

  async function markAll() {
    try {
      await client.current?.markRead({ all: true });
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    } catch { setError(true); }
  }

  async function openItem(n: Notification) {
    if (!n.readAt) {
      void client.current?.markRead({ ids: [n.id] }).then(() => {
        setItems((prev) => prev.map((x) => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x));
      }).catch(() => {});
    }
    if (n.href) {
      setOpen(false);
      router.push(n.href);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          if (!open) { setLoading(true); setError(false); }
          setOpen((v) => !v);
        }}
        aria-label={t.aria}
        aria-expanded={open}
        className="relative h-9 w-9 rounded-md flex items-center justify-center transition-colors hover:opacity-80"
        style={{ border: `1px solid ${tone.line}`, color: tone.ink50 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3a6 6 0 0 0-6 6v3.3c0 .5-.2 1-.5 1.4L4 16h16l-1.5-2.3a2.5 2.5 0 0 1-.5-1.4V9a6 6 0 0 0-6-6Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-semibold"
            style={{ background: tone.rose, color: "#fff" }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-x-4 top-[72px] z-40 overflow-hidden rounded-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[340px]"
          style={{
            background: tone.card,
            border: `1px solid ${tone.line}`,
            boxShadow: "0 12px 30px -10px rgba(0,0,0,0.18)",
          }}
        >
          <div
            className="px-4 py-2.5 flex items-center justify-between"
            style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
          >
            <span className="font-serif" style={{ fontSize: 14, color: tone.ink }}>
              {t.title}
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="text-[12px] hover:opacity-80"
                style={{ color: tone.accent }}
              >
                {t.markAll}
              </button>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {loading || error || items.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12.5px]" style={{ color: tone.ink50 }}>
                {loading ? t.loading : error ? t.error : t.empty}
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  className="w-full text-left px-4 py-3 hover:bg-[#FAF7F0] transition-colors flex gap-2.5"
                  style={{ borderBottom: `1px solid ${tone.lineSoft}` }}
                >
                  <span
                    className="mt-1.5 h-2 w-2 rounded-full flex-none"
                    style={{ background: n.readAt ? "transparent" : tone.accent }}
                  />
                  <span className="min-w-0">
                    <span
                      className="block text-[13px] leading-snug"
                      style={{ color: tone.ink, fontWeight: n.readAt ? 400 : 600 }}
                    >
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="block text-[12px] mt-0.5 truncate" style={{ color: tone.ink50 }}>
                        {n.body}
                      </span>
                    )}
                    <span className="block text-[11px] mt-0.5" style={{ color: tone.ink30 }}>
                      {timeAgo(n.createdAt, locale)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
