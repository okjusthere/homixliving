import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentPaymentProfiles } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { logAudit } from "@/lib/audit";

// Self-service payment profile (ACH details for commission payouts). The
// actual money moves outside the system (QuickBooks / checks); these fields
// exist so the office has authoritative payout instructions + W-9 on file.

export async function GET() {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  const agentId = auth.session.user.agentId;
  if (!agentId) return NextResponse.json({ error: "No agent record" }, { status: 400 });

  const [profile] = await db
    .select()
    .from(agentPaymentProfiles)
    .where(eq(agentPaymentProfiles.agentId, agentId))
    .limit(1);

  // Full routing/account digits never leave the server — the UI only needs
  // masked confirmation of what's on file.
  return NextResponse.json({
    profile: profile
      ? {
          bankName: profile.bankName,
          accountType: profile.accountType,
          accountLast4: profile.accountNumber ? profile.accountNumber.slice(-4) : null,
          hasAch: Boolean(profile.routingNumber && profile.accountNumber),
          hasW9: Boolean(profile.w9ObjectKey),
          w9FileName: profile.w9FileName,
          w9UploadedAt: profile.w9UploadedAt,
        }
      : null,
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  const agentId = auth.session.user.agentId;
  if (!agentId) return NextResponse.json({ error: "No agent record" }, { status: 400 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const bankName = String(body.bankName || "").trim().slice(0, 120);
  const accountType = String(body.accountType || "").trim();
  const routingNumber = String(body.routingNumber || "").replace(/\D/g, "");
  const accountNumber = String(body.accountNumber || "").replace(/\D/g, "");

  if (accountType && !["checking", "savings"].includes(accountType)) {
    return NextResponse.json({ error: "accountType must be checking or savings" }, { status: 400 });
  }
  if (routingNumber && routingNumber.length !== 9) {
    return NextResponse.json({ error: "Routing number must be 9 digits" }, { status: 400 });
  }
  if (accountNumber && (accountNumber.length < 4 || accountNumber.length > 17)) {
    return NextResponse.json({ error: "Account number must be 4-17 digits" }, { status: 400 });
  }

  // Blank digit fields keep what's on file — the client never gets (and so
  // can never resend) the full numbers, only a masked confirmation.
  const [existing] = await db
    .select()
    .from(agentPaymentProfiles)
    .where(eq(agentPaymentProfiles.agentId, agentId))
    .limit(1);
  const finalRouting = routingNumber || existing?.routingNumber || null;
  const finalAccount = accountNumber || existing?.accountNumber || null;

  const now = new Date().toISOString();
  await db
    .insert(agentPaymentProfiles)
    .values({
      agentId,
      bankName: bankName || null,
      accountType: accountType || null,
      routingNumber: finalRouting,
      accountNumber: finalAccount,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: agentPaymentProfiles.agentId,
      set: {
        bankName: bankName || null,
        accountType: accountType || null,
        routingNumber: finalRouting,
        accountNumber: finalAccount,
        updatedAt: now,
      },
    });

  // Deliberately NO account/routing digits in the audit detail.
  await logAudit(auth.session, "update", "agent", agentId, "更新收款账户信息（ACH）");
  return NextResponse.json({ success: true });
}
