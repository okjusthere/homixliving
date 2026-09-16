import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { NOTIFICATION_POLL_INTERVAL, startNotificationPolling } from "../notification-polling";

function tabs() {
  const storage = new Map<string, string>();
  const windows: EventTarget[] = [];
  const locks = new Map<string, Promise<unknown>>();
  const calls: Array<{ agentId: number; url: string; method: string }> = [];
  function tab(agentId: number, initiallyVisible = true) {
    const target = new EventTarget();
    windows.push(target);
    const document = Object.assign(new EventTarget(), { visibilityState: initiallyVisible ? "visible" : "hidden" });
    let unread = 4;
    let responseAgent = agentId;
    let fail = false;
    const browser = Object.assign(target, {
      document,
      navigator: { locks: { request<T>(key: string, work: () => Promise<T>) {
        const result = (locks.get(key) || Promise.resolve()).catch(() => {}).then(work);
        locks.set(key, result.catch(() => {}));
        return result;
      } } },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem(key: string, value: string) {
          storage.set(key, value);
          for (const other of windows) if (other !== target) {
            queueMicrotask(() => other.dispatchEvent(Object.assign(new Event("storage"), { key })));
          }
        },
        removeItem: (key: string) => storage.delete(key),
      },
      setInterval: (callback: () => void, delay: number) => setInterval(callback, delay),
      clearInterval: (id: ReturnType<typeof setInterval>) => clearInterval(id),
      async fetch(url: string, init?: RequestInit) {
        calls.push({ agentId, url, method: init?.method || "GET" });
        if (fail) return Response.json({ error: "temporary" }, { status: 503 });
        if (init?.method === "POST") {
          unread = 0;
          return Response.json({ success: true });
        }
        return Response.json({ agentId: responseAgent, unread, ...(url.includes("countOnly") ? {} : {
          items: [{ id: 1, title: "Private notification", recipientAgentId: agentId }],
        }) });
      },
    });
    return {
      browser: browser as unknown as Window,
      visible(visible: boolean) {
        document.visibilityState = visible ? "visible" : "hidden";
        document.dispatchEvent(new Event("visibilitychange"));
      },
      focus: () => target.dispatchEvent(new Event("focus")),
      responseAs: (id: number) => { responseAgent = id; },
      failing: (value: boolean) => { fail = value; },
    };
  }
  return { tab, calls, storage };
}

test("polls only counts every 15 minutes; pauses hidden tabs and refreshes on return", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 1_000_000 });
  const env = tabs(), tab = env.tab(101, false), badges: number[] = [];
  const client = startNotificationPolling(101, (count) => badges.push(count), tab.browser);
  t.after(() => client.stop());
  await setImmediate();
  assert.equal(env.calls.length, 0, "background mount must not fetch");
  tab.visible(true);
  await setImmediate();
  assert.deepEqual(env.calls.map((c) => c.url), ["/api/notifications?countOnly=1"]);
  t.mock.timers.tick(NOTIFICATION_POLL_INTERVAL - 1);
  await setImmediate();
  assert.equal(env.calls.length, 1);
  t.mock.timers.tick(1);
  await setImmediate();
  assert.equal(env.calls.length, 2);
  tab.visible(false);
  t.mock.timers.tick(60 * 60 * 1000);
  await setImmediate();
  assert.equal(env.calls.length, 2);
  tab.visible(true);
  tab.focus();
  await setImmediate();
  assert.equal(env.calls.length, 3, "focus and visibility events share one refresh");
  const details = await client.loadDetails();
  assert.equal(details[0].title, "Private notification");
  assert.equal(env.calls.at(-1)?.url, "/api/notifications");
  assert.ok([...env.storage.values()].every((value) => !value.includes("Private notification")));
  assert.equal(badges.at(-1), 4);
  client.stop();
  t.mock.timers.tick(NOTIFICATION_POLL_INTERVAL);
  tab.focus();
  await setImmediate();
  assert.equal(env.calls.length, 4, "unmounted bells must not restart polling");
});

test("same-account tabs share scheduled requests and synchronize read counts", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 1_000_000 });
  const env = tabs(), first = env.tab(101), second = env.tab(101);
  const badgesA: number[] = [], badgesB: number[] = [];
  const a = startNotificationPolling(101, (count) => badgesA.push(count), first.browser);
  const b = startNotificationPolling(101, (count) => badgesB.push(count), second.browser);
  t.after(() => { a.stop(); b.stop(); });
  await setImmediate();
  assert.equal(env.calls.length, 1, "overlapping mounts make a single request");
  assert.equal(badgesA.at(-1), 4);
  assert.equal(badgesB.at(-1), 4);
  t.mock.timers.tick(NOTIFICATION_POLL_INTERVAL);
  await setImmediate();
  assert.equal(env.calls.length, 2, "overlapping polling timers make a single request");
  await a.markRead({ all: true });
  await setImmediate();
  assert.equal(badgesA.at(-1), 0);
  assert.equal(badgesB.at(-1), 0);
  assert.equal(env.calls.filter((c) => c.method === "POST").length, 1);
});

test("account counts are isolated and responses from a changed login are rejected", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 1_000_000 });
  const env = tabs(), first = env.tab(101), second = env.tab(202);
  const badges: number[] = [];
  const a = startNotificationPolling(101, (count) => badges.push(count), first.browser);
  const b = startNotificationPolling(202, () => {}, second.browser);
  t.after(() => { a.stop(); b.stop(); });
  await setImmediate();
  assert.equal(env.calls.length, 2);
  assert.equal(env.storage.size, 2);
  first.responseAs(202);
  await assert.rejects(a.loadDetails(), /session changed/);
  assert.equal(badges.at(-1), 4);
  assert.equal(JSON.parse(env.storage.get("homix:notification-count:v1:101")!).unread, 4);
});

test("failed checks do not poison the shared cache or prevent retry on focus", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 1_000_000 });
  const env = tabs(), tab = env.tab(101);
  tab.failing(true);
  const client = startNotificationPolling(101, () => {}, tab.browser);
  t.after(() => client.stop());
  await setImmediate();
  assert.equal(env.storage.size, 0);
  tab.failing(false);
  tab.focus();
  await setImmediate();
  assert.equal(env.calls.length, 2);
  assert.equal(env.storage.size, 1);
});
