import type { Notification } from "@/db/schema";

export const NOTIFICATION_POLL_INTERVAL = 15 * 60 * 1000;
const FOCUS_DEDUP_MS = 2000;

type Summary = { unread: number; checkedAt: number };
type NotificationResponse = { agentId: number; unread: number; items?: Notification[] };

/** Share only the badge count across tabs; notification bodies stay in memory. */
export function startNotificationPolling(
  agentId: number,
  onUnread: (unread: number) => void,
  browser: Window = window,
) {
  const key = `homix:notification-count:v1:${agentId}`;
  let stopped = false;
  let timer: number | undefined;
  let latest: Summary | null = null;

  function readSummary(): Summary | null {
    try {
      const value = JSON.parse(browser.localStorage.getItem(key) || "null");
      if (value && Number.isSafeInteger(value.unread) && value.unread >= 0 &&
          Number.isFinite(value.checkedAt) && value.checkedAt <= Date.now()) {
        return value;
      }
    } catch { /* Storage can be unavailable in private/embedded browsers. */ }
    return latest;
  }

  function publish(unread: number) {
    if (stopped) return;
    latest = { unread, checkedAt: Date.now() };
    try { browser.localStorage.setItem(key, JSON.stringify(latest)); } catch { /* Fall back to this tab. */ }
    onUnread(unread);
  }

  async function locked<T>(work: () => Promise<T>): Promise<T> {
    // Web Locks serialize overlapping requests from visible windows/tabs.
    if (browser.navigator.locks) return browser.navigator.locks.request(key, work);
    return work();
  }

  async function request(details: boolean): Promise<NotificationResponse> {
    const response = await browser.fetch(`/api/notifications${details ? "" : "?countOnly=1"}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        latest = null;
        try { browser.localStorage.removeItem(key); } catch { /* Storage is optional. */ }
        if (!stopped) onUnread(0);
      }
      throw new Error("Notifications unavailable");
    }
    const data: NotificationResponse = await response.json();
    // Another tab may have switched accounts while this tab still had an old session.
    if (data.agentId !== agentId || !Number.isSafeInteger(data.unread) || data.unread < 0) {
      throw new Error("Notification session changed");
    }
    publish(data.unread);
    return data;
  }

  async function refresh(force = false) {
    const requestedAt = Date.now();
    await locked(async () => {
      if (stopped || browser.document.visibilityState !== "visible") return;
      const summary = readSummary();
      // A simultaneous request in another tab can satisfy a focus refresh, too.
      const maxAge = force ? FOCUS_DEDUP_MS : NOTIFICATION_POLL_INTERVAL;
      if (summary && (Date.now() - summary.checkedAt < maxAge || summary.checkedAt >= requestedAt)) {
        latest = summary;
        onUnread(summary.unread);
        return;
      }
      await request(false);
    });
  }

  function schedule(force: boolean) {
    browser.clearInterval(timer);
    timer = undefined;
    if (stopped || browser.document.visibilityState !== "visible") return;
    void refresh(force).catch(() => { /* Keep the last badge on transient failures. */ });
    timer = browser.setInterval(() => {
      void refresh().catch(() => {});
    }, NOTIFICATION_POLL_INTERVAL);
  }

  function onVisibility() { schedule(true); }
  function onFocus() {
    if (browser.document.visibilityState === "visible") schedule(true);
  }
  function onStorage(event: StorageEvent) {
    if (event.key !== key || stopped) return;
    latest = null;
    const summary = readSummary();
    if (summary) { latest = summary; onUnread(summary.unread); }
    else onUnread(0);
  }

  browser.document.addEventListener("visibilitychange", onVisibility);
  browser.addEventListener("focus", onFocus);
  browser.addEventListener("storage", onStorage);
  schedule(false);

  return {
    async loadDetails() {
      return locked(async () => {
        if (stopped) return [];
        return (await request(true)).items || [];
      });
    },
    async markRead(body: { all: true } | { ids: number[] }) {
      return locked(async () => {
        if (stopped) return;
        const response = await browser.fetch("/api/notifications/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error("Could not mark notifications read");
        await request(false);
      });
    },
    stop() {
      stopped = true;
      browser.clearInterval(timer);
      browser.document.removeEventListener("visibilitychange", onVisibility);
      browser.removeEventListener("focus", onFocus);
      browser.removeEventListener("storage", onStorage);
    },
  };
}
