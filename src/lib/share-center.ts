import { randomBytes } from "node:crypto";
import {
  avg,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  max,
  sql,
} from "drizzle-orm";
import { db, pgClient } from "@/db";
import {
  agents,
  shareEvents,
  shareLinks,
  shareVisits,
} from "@/db/schema";
import { ensureSchema } from "@/db/ensure-schema";
import { homixwebBase } from "@/lib/homixweb";

export const SHARE_KINDS = [
  "listing",
  "neighborhood",
  "community",
  "development",
  "guide",
] as const;

export type ShareKind = (typeof SHARE_KINDS)[number];

export type ShareLinkSummary = {
  id: number;
  code: string;
  agentId: number;
  agentName: string;
  contentKind: ShareKind;
  contentKey: string;
  contentPath: string;
  contentTitle: string;
  contentSubtitle: string | null;
  contentImage: string | null;
  locale: "en" | "zh";
  isActive: boolean;
  createdAt: string | null;
  shareUrl: string;
  visits: number;
  uniqueVisitors: number;
  averageActiveSeconds: number;
  medianActiveSeconds: number;
  averageScrollDepth: number;
  lastVisitAt: string | null;
  callClicks: number;
  emailClicks: number;
  wechatClicks: number;
  profileClicks: number;
  inquiries: number;
};

export function isShareKind(value: unknown): value is ShareKind {
  return (
    typeof value === "string" &&
    (SHARE_KINDS as readonly string[]).includes(value)
  );
}

export function isShareLocale(value: unknown): value is "en" | "zh" {
  return value === "en" || value === "zh";
}

export function newShareCode(): string {
  return randomBytes(8).toString("base64url");
}

export function publicShareUrl(code: string): string {
  return `${homixwebBase()}/s/${encodeURIComponent(code)}`;
}

export async function withShareSchemaRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch {
    await ensureSchema(pgClient);
    return operation();
  }
}

async function queryShareLinkSummaries(
  agentId: number | null,
): Promise<ShareLinkSummary[]> {
  const links = await db
    .select({
      id: shareLinks.id,
      code: shareLinks.code,
      agentId: shareLinks.agentId,
      agentName: agents.name,
      contentKind: shareLinks.contentKind,
      contentKey: shareLinks.contentKey,
      contentPath: shareLinks.contentPath,
      contentTitle: shareLinks.contentTitle,
      contentSubtitle: shareLinks.contentSubtitle,
      contentImage: shareLinks.contentImage,
      locale: shareLinks.locale,
      isActive: shareLinks.isActive,
      createdAt: shareLinks.createdAt,
    })
    .from(shareLinks)
    .innerJoin(agents, eq(shareLinks.agentId, agents.id))
    .where(agentId == null ? undefined : eq(shareLinks.agentId, agentId))
    .orderBy(desc(shareLinks.createdAt), desc(shareLinks.id));

  if (links.length === 0) return [];
  const linkIds = links.map((link) => link.id);
  const visitRows = await db
    .select({
      shareLinkId: shareVisits.shareLinkId,
      visits: count(shareVisits.id),
      uniqueVisitors: countDistinct(shareVisits.visitorHash),
      averageActiveSeconds: avg(shareVisits.activeSeconds),
      medianActiveSeconds:
        sql<number>`COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${shareVisits.activeSeconds}))::int, 0)`,
      averageScrollDepth: avg(shareVisits.maxScrollDepth),
      lastVisitAt: max(shareVisits.lastSeenAt),
    })
    .from(shareVisits)
    .where(inArray(shareVisits.shareLinkId, linkIds))
    .groupBy(shareVisits.shareLinkId);
  const eventRows = await db
    .select({
      shareLinkId: shareEvents.shareLinkId,
      callClicks:
        sql<number>`COUNT(*) FILTER (WHERE ${shareEvents.eventType} = 'call')::int`,
      emailClicks:
        sql<number>`COUNT(*) FILTER (WHERE ${shareEvents.eventType} = 'email')::int`,
      wechatClicks:
        sql<number>`COUNT(*) FILTER (WHERE ${shareEvents.eventType} = 'wechat')::int`,
      profileClicks:
        sql<number>`COUNT(*) FILTER (WHERE ${shareEvents.eventType} = 'profile')::int`,
      inquiries:
        sql<number>`COUNT(*) FILTER (WHERE ${shareEvents.eventType} = 'inquiry')::int`,
    })
    .from(shareEvents)
    .where(inArray(shareEvents.shareLinkId, linkIds))
    .groupBy(shareEvents.shareLinkId);

  const visitsByLink = new Map(
    visitRows.map((row) => [row.shareLinkId, row]),
  );
  const eventsByLink = new Map(
    eventRows.map((row) => [row.shareLinkId, row]),
  );

  return links.map((link) => {
    const visits = visitsByLink.get(link.id);
    const events = eventsByLink.get(link.id);
    return {
      ...link,
      contentKind: link.contentKind as ShareKind,
      locale: link.locale === "en" ? "en" : "zh",
      shareUrl: publicShareUrl(link.code),
      visits: Number(visits?.visits ?? 0),
      uniqueVisitors: Number(visits?.uniqueVisitors ?? 0),
      averageActiveSeconds: Math.round(
        Number(visits?.averageActiveSeconds ?? 0),
      ),
      medianActiveSeconds: Number(visits?.medianActiveSeconds ?? 0),
      averageScrollDepth: Math.round(
        Number(visits?.averageScrollDepth ?? 0),
      ),
      lastVisitAt: visits?.lastVisitAt ?? null,
      callClicks: Number(events?.callClicks ?? 0),
      emailClicks: Number(events?.emailClicks ?? 0),
      wechatClicks: Number(events?.wechatClicks ?? 0),
      profileClicks: Number(events?.profileClicks ?? 0),
      inquiries: Number(events?.inquiries ?? 0),
    };
  });
}

export async function loadShareLinkSummaries(
  agentId: number | null,
): Promise<ShareLinkSummary[]> {
  return withShareSchemaRetry(() => queryShareLinkSummaries(agentId));
}
