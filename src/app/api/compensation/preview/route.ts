import { NextRequest, NextResponse } from "next/server";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import {
  buildCompensationEstimate,
  normalizeCompensationSource,
} from "@/lib/compensation-service";

export async function POST(req: NextRequest) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  try {
    const body = await req.json();
    const dealType = body.dealType === "rental" ? "rental" : body.dealType === "sale" ? "sale" : null;
    if (!dealType) return NextResponse.json({ error: "Invalid deal type" }, { status: 400 });

    const participants: Array<{ agentId: number; sharePct: number }> = Array.isArray(body.participants)
      ? body.participants.map((row: Record<string, unknown>) => ({
          agentId: Number(row.agentId),
          sharePct: Number(row.sharePct),
        }))
      : [];
    const shareTotal = participants.reduce<number>((sum, row) => sum + row.sharePct, 0);
    if (
      participants.length === 0 ||
      participants.some((row) => !Number.isInteger(row.agentId) || row.agentId <= 0 || row.sharePct < 0) ||
      Math.abs(shareTotal - 100) > 0.01
    ) {
      return NextResponse.json({ error: "Agent shares must total 100%" }, { status: 400 });
    }
    const grossCommission = Number(body.grossCommission || 0);
    if (!Number.isFinite(grossCommission) || grossCommission <= 0) {
      return NextResponse.json({ error: "Gross commission is required" }, { status: 400 });
    }

    const result = await buildCompensationEstimate({
      dealType,
      effectiveDate: /^\d{4}-\d{2}-\d{2}$/.test(String(body.effectiveDate || ""))
        ? String(body.effectiveDate)
        : new Date().toISOString().slice(0, 10),
      grossCommission,
      source: normalizeCompensationSource(body.source, dealType),
      outsideReferralAmount: Math.max(0, Number(body.outsideReferralAmount || 0)),
      rebateAmount: Math.max(0, Number(body.rebateAmount || 0)),
      participants,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("compensation preview failed", error);
    return NextResponse.json({ error: "Unable to calculate compensation" }, { status: 500 });
  }
}
