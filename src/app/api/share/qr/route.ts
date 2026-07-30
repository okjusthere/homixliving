import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { shareLinks } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { publicShareUrl, withShareSchemaRetry } from "@/lib/share-center";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  const code = request.nextUrl.searchParams.get("code") || "";
  if (!/^[A-Za-z0-9_-]{8,24}$/.test(code)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const [link] = await withShareSchemaRetry(() =>
    db
      .select({ code: shareLinks.code })
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.code, code),
          auth.session.user.isAdmin
            ? undefined
            : eq(shareLinks.agentId, auth.session.user.agentId ?? -1),
        ),
      )
      .limit(1),
  );
  if (!link) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }

  const svg = await QRCode.toString(publicShareUrl(link.code), {
    type: "svg",
    width: 512,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#1A1814", light: "#FCFAF5" },
  });
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
