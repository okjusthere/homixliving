import { NextResponse } from "next/server";
import { cleanupExpiredSuspendedWorkspaceUsers } from "@/lib/google-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorizedCronRequest(request: Request): boolean {
  // Fail closed: require the CRON_SECRET bearer. Vercel Cron automatically sends
  // `Authorization: Bearer $CRON_SECRET` when the CRON_SECRET env var is set.
  // The previous fallback trusted `User-Agent: vercel-cron` + a schedule header,
  // both of which any client can spoof — that let any logged-in (even pending)
  // user trigger permanent Google Workspace mailbox deletion.
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) return false;
  const authorization = request.headers.get("authorization") || "";
  return authorization === `Bearer ${configuredSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await cleanupExpiredSuspendedWorkspaceUsers();
    const responseBody = {
      retentionDays: result.retentionDays,
      cutoffIso: result.cutoffIso,
      scanned: result.scanned,
      deleted: result.deleted,
      skipped: result.skipped,
      failed: result.failed,
    };

    if (result.failed > 0) {
      console.error("Workspace retention cleanup had failures", result.failures);
      return NextResponse.json(responseBody, { status: 500 });
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("Workspace retention cleanup failed", error);
    return NextResponse.json({ error: "Workspace retention cleanup failed." }, { status: 500 });
  }
}
