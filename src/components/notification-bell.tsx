"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import type { Notification } from "@/db/schema";

const M = {
  en: {
    aria: "Notifications",
    empty: "No notifications yet",
    markAll: "Mark all read",
    title: "Notifications",
  },
  zh: {
    aria: "通知",
    empty: "暂无通知",
    markAll: "全部已读",
    title: "通知",
  },
} as const;

function timeAgo(iso: string | null, locale: "en" | "zh"): string {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return locale === "zh" ? "刚刚" : "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return locale === "zh" ? `${m} 分钟前` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return locale === "zh" ? `${h} 小时前` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return locale === "zh" ? `${d} 天前` : `${d}d ago`;
}

export function NotificationBell() {
  const router = useRouter();
  const locale = useLocale();
  const t = M[locale];
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items || []);
      setUnread(data.unread || 0);
    } catch {
      // network hiccup — keep whatever we had
    }
  }, []);

  useEffect(() => {
    // load() is async — its setState runs after the fetch resolves, not
    // synchronously in the effect body, so the set-state-in-effect rule is a
    // false positive here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async; see above
    load();
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, load]);

  async function markAll() {
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  }

  async function openItem(n: Notification) {
    if (!n.readAt) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
      );
      fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [n.id] }),
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
        onClick={() => setOpen((v) => !v)}
        aria-label={t.aria}
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
          className="absolute right-0 top-11 w-[340px] rounded-xl overflow-hidden z-40"
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
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12.5px]" style={{ color: tone.ink50 }}>
                {t.empty}
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
