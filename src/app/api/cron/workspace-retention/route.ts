import { NextResponse } from "next/server";
import { cleanupExpiredSuspendedWorkspaceUsers } from "@/lib/google-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_RETENTION_CRON_SCHEDULE = "17 13 * * *";

function isAuthorizedCronRequest(request: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") || "";
  if (configuredSecret && authorization === `Bearer ${configuredSecret}`) return true;

  const userAgent = request.headers.get("user-agent") || "";
  const schedule = request.headers.get("x-vercel-cron-schedule") || "";
  return userAgent.includes("vercel-cron/1.0") && schedule === WORKSPACE_RETENTION_CRON_SCHEDULE;
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
