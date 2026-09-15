"use client";

import { Analytics } from "@vercel/analytics/next";

/** Bearer invitations must never enter page-view analytics. */
export function SafeAnalytics() {
  return <Analytics beforeSend={(event) => {
    const url = new URL(event.url);
    if (url.pathname === "/claim" || url.pathname.startsWith("/claim/")) return null;
    return event;
  }} />;
}
