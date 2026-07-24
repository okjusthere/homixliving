import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runResourcesImport } from "@/db/import-resources-data";
import { logAudit } from "@/lib/audit";
import { pgClient } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Imports/refreshes the "常用做单表格" library + required-documents checklists
// from the structured data in src/db/import-resources-data.ts. Same
// operational story as /api/admin/ensure-schema: the import runs inside the
// deployed app against Supabase Postgres. Idempotent — safe to re-run.
//
// Auth: an admin session OR the CRON_SECRET bearer.
async function isAuthorized(request: Request): Promise<{ ok: boolean; actor: string }> {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") || "";
  if (configuredSecret && authorization === `Bearer ${configuredSecret}`) {
    return { ok: true, actor: "cron-secret" };
  }
  try {
    const session = await auth();
    if (session?.user?.isAdmin) {
      return { ok: true, actor: session.user.email || "admin" };
    }
  } catch {
    // No request scope / no session — fall through to unauthorized.
  }
  return { ok: false, actor: "" };
}

export async function POST(request: Request) {
  const authz = await isAuthorized(request);
  if (!authz.ok) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const summary = await runResourcesImport(pgClient);
    await logAudit(
      { user: { email: authz.actor } },
      "import",
      "resource",
      "sheet-import",
      `导入做单表格库：表格 +${summary.formsInserted}/更新 ${summary.formsUpdated}，清单 +${summary.checklistInserted}`,
    );
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("import-resources failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "import failed" },
      { status: 500 },
    );
  }
}
