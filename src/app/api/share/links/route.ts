import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { shareLinks } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { logAudit } from "@/lib/audit";
import { fetchPublicProfile, fetchShareCatalogItem } from "@/lib/homixweb";
import {
  isShareLocale,
  loadShareLinkSummaries,
  newShareCode,
  withShareSchemaRetry,
} from "@/lib/share-center";
import { publicShareUrl } from "@/lib/share-url";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  const ownAgentId = auth.session.user.agentId;
  if (!ownAgentId && !auth.session.user.isAdmin) {
    return NextResponse.json(
      { error: "Your account is not linked to an agent profile." },
      { status: 409 },
    );
  }
  const companyScope =
    auth.session.user.isAdmin &&
    request.nextUrl.searchParams.get("scope") === "all";
  const includeAnalytics =
    request.nextUrl.searchParams.get("analytics") === "1";
  const links = await loadShareLinkSummaries(
    companyScope ? null : ownAgentId ?? null,
    includeAnalytics,
  );
  return NextResponse.json(
    { links, scope: companyScope ? "all" : "mine" },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  const agentId = auth.session.user.agentId;
  if (!agentId) {
    return NextResponse.json(
      { error: "Your account is not linked to an agent profile." },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  const contentPath = String(body?.contentPath || "").trim().slice(0, 500);
  const locale = body?.locale;
  if (!contentPath.startsWith("/") || !isShareLocale(locale)) {
    return NextResponse.json({ error: "Invalid content" }, { status: 400 });
  }

  const publicProfile = await fetchPublicProfile(agentId);
  if (
    !publicProfile.linked ||
    publicProfile.profile?.visibility_status !== "visible" ||
    !publicProfile.profile.photo_url ||
    publicProfile.profile.photo_url.endsWith("/agent-placeholder-logo.png")
  ) {
    return NextResponse.json(
      {
        error:
          "Publish your public profile and add your own headshot before creating personal share links.",
      },
      { status: publicProfile.unreachable ? 503 : 409 },
    );
  }

  // Re-load from Homix Web by canonical path. The browser only supplies a
  // selection; titles, images, type, and destination are trusted snapshots
  // from the website's own catalog.
  const item = await fetchShareCatalogItem(contentPath, locale);
  if (!item) {
    return NextResponse.json(
      { error: "That Homix Web page is unavailable or cannot be shared." },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  const [link] = await withShareSchemaRetry(() =>
    db
      .insert(shareLinks)
      .values({
        code: newShareCode(),
        agentId,
        contentKind: item.kind,
        contentKey: item.key,
        contentPath: item.path,
        contentTitle: item.title,
        contentSubtitle: item.subtitle || null,
        contentImage: item.image || null,
        locale,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          shareLinks.agentId,
          shareLinks.contentKind,
          shareLinks.contentKey,
          shareLinks.locale,
        ],
        set: {
          contentPath: item.path,
          contentTitle: item.title,
          contentSubtitle: item.subtitle || null,
          contentImage: item.image || null,
          isActive: true,
          updatedAt: now,
        },
      })
      .returning(),
  );
  if (!link) {
    return NextResponse.json({ error: "Unable to create link" }, { status: 500 });
  }

  await logAudit(
    auth.session,
    "create",
    "share_link",
    link.id,
    `生成分享链接 ${item.title}`,
  );
  return NextResponse.json({
    link: {
      ...link,
      shareUrl: publicShareUrl(link.code, link.updatedAt),
    },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  const id = Number(body?.id);
  const isActive = body?.isActive;
  if (!Number.isInteger(id) || id <= 0 || typeof isActive !== "boolean") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const [updated] = await withShareSchemaRetry(() =>
    db
      .update(shareLinks)
      .set({ isActive, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(shareLinks.id, id),
          auth.session.user.isAdmin
            ? undefined
            : eq(shareLinks.agentId, auth.session.user.agentId ?? -1),
        ),
      )
      .returning(),
  );
  if (!updated) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }
  await logAudit(
    auth.session,
    "update",
    "share_link",
    updated.id,
    isActive ? "启用分享链接" : "停用分享链接",
  );
  return NextResponse.json({ ok: true });
}
