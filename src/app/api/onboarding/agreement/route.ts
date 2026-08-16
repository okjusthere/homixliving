import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { agents, teams } from "@/db/schema";
import {
  createESignEnvelope,
  createESignTransaction,
  getESignEnvelope,
  getESignTemplate,
  isOnboardingESignConfigured,
  onboardingESignTemplateId,
  sendESignEnvelope,
  type ESignEnvelope,
} from "@/lib/esign";
import { onboardingPaymentProduct } from "@/lib/onboarding";

async function currentAgent() {
  const session = await auth();
  if (!session?.user?.agentId) return null;
  const [agent] = await db.select().from(agents).where(eq(agents.id, session.user.agentId)).limit(1);
  return agent || null;
}

function agreementState(status: ESignEnvelope["status"]) {
  if (status === "DRAFT" || status === "PREPARED" || status === "READY_TO_SEND") {
    return "not_started" as const;
  }
  if (status === "COMPLETED") return "completed" as const;
  if (status === "DECLINED") return "declined" as const;
  if (status === "VOIDED") return "voided" as const;
  if (status === "EXPIRED") return "expired" as const;
  if (status === "FAILED_FINALIZATION") return "failed" as const;
  return "sent" as const;
}

async function syncEnvelope(agent: typeof agents.$inferSelect) {
  if (!agent.esignEnvelopeId || !isOnboardingESignConfigured()) return agent;
  const envelope = await getESignEnvelope(agent.esignEnvelopeId);
  const status = agreementState(envelope.status);
  const paymentRequired = onboardingPaymentProduct(agent.plan, agent.affiliationTermMonths);
  const onboardingStage = status === "completed"
    ? paymentRequired && agent.paymentStatus !== "paid" ? "payment" : "review"
    : "agreement";
  if (status === agent.agreementStatus && onboardingStage === agent.onboardingStage) return agent;
  const [updated] = await db.update(agents).set({
    agreementStatus: status,
    onboardingStage,
    updatedAt: new Date().toISOString(),
  }).where(eq(agents.id, agent.id)).returning();
  return updated || agent;
}

export async function GET() {
  const agent = await currentAgent();
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const synced = await syncEnvelope(agent);
    return NextResponse.json({
      configured: isOnboardingESignConfigured(),
      agreementStatus: synced.agreementStatus,
      onboardingStage: synced.onboardingStage,
      paymentStatus: synced.paymentStatus,
      paymentProduct: onboardingPaymentProduct(synced.plan, synced.affiliationTermMonths),
    });
  } catch (error) {
    console.error("Unable to sync onboarding agreement", error);
    return NextResponse.json({
      configured: isOnboardingESignConfigured(),
      agreementStatus: agent.agreementStatus,
      onboardingStage: agent.onboardingStage,
      paymentStatus: agent.paymentStatus,
      paymentProduct: onboardingPaymentProduct(agent.plan, agent.affiliationTermMonths),
      syncError: true,
    });
  }
}

export async function POST() {
  const agent = await currentAgent();
  if (!agent) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOnboardingESignConfigured()) {
    return NextResponse.json({ error: "eSign onboarding is not configured." }, { status: 503 });
  }
  if (!agent.onboardingCompletedAt) {
    return NextResponse.json({ error: "Complete the onboarding profile first." }, { status: 409 });
  }
  try {
    if (agent.esignEnvelopeId) {
      const synced = await syncEnvelope(agent);
      if (synced.agreementStatus === "not_started") {
        await sendESignEnvelope(agent.esignEnvelopeId, agent.id);
        await db.update(agents).set({
          agreementStatus: "sent",
          onboardingStage: "agreement",
          updatedAt: new Date().toISOString(),
        }).where(eq(agents.id, agent.id));
        return NextResponse.json({ success: true, agreementStatus: "sent" });
      }
      return NextResponse.json({ success: true, agreementStatus: synced.agreementStatus });
    }

    const templateId = onboardingESignTemplateId();
    const template = await getESignTemplate(templateId);
    const version = template.versions.find((candidate) => candidate.id === template.activeVersionId);
    if (!version || version.status !== "PUBLISHED") {
      return NextResponse.json({ error: "The onboarding template is not published." }, { status: 409 });
    }
    if (version.approvalRequired) {
      return NextResponse.json({ error: "The onboarding template must not require preparer approval." }, { status: 409 });
    }
    const signerRoles = version.roles.filter((role) => role.kind === "signer");
    if (signerRoles.length !== 1) {
      return NextResponse.json(
        { error: "The onboarding template must contain exactly one agent signer role." },
        { status: 409 },
      );
    }
    const [signerRole] = signerRoles;
    const [team] = agent.teamId
      ? await db.select({ name: teams.name }).from(teams).where(eq(teams.id, agent.teamId)).limit(1)
      : [];
    const [sponsor] = agent.referredByAgentId
      ? await db.select({ name: agents.name }).from(agents).where(eq(agents.id, agent.referredByAgentId)).limit(1)
      : [];
    const transaction = await createESignTransaction({
      name: `${agent.legalName || agent.name} onboarding`,
      externalReference: `homix-agent-${agent.id}`,
    });
    const envelope = await createESignEnvelope({
      transactionId: transaction.id,
      templateId,
      agentId: agent.id,
      name: agent.legalName || agent.name,
      email: agent.email,
      roleId: signerRole.id,
      mergeData: {
        agent_id: agent.id,
        agent_name: agent.legalName || agent.name,
        agent_email: agent.email,
        agent_phone: agent.phone || "",
        license_number: agent.licenseNumber || "",
        licensed_company: agent.licensedCompany || "",
        compensation_plan: agent.plan,
        split_pct: agent.splitPct,
        team_name: team?.name || "",
        sponsor_name: sponsor?.name || "",
        affiliation_term_months: agent.affiliationTermMonths || 12,
      },
    });
    await db.update(agents).set({
      esignTransactionId: transaction.id,
      esignEnvelopeId: envelope.id,
      agreementStatus: "not_started",
      onboardingStage: "agreement",
      updatedAt: new Date().toISOString(),
    }).where(eq(agents.id, agent.id));
    await sendESignEnvelope(envelope.id, agent.id);
    await db.update(agents).set({
      agreementStatus: "sent",
      updatedAt: new Date().toISOString(),
    }).where(eq(agents.id, agent.id));
    return NextResponse.json({ success: true, agreementStatus: "sent" });
  } catch (error) {
    console.error("Unable to create onboarding agreement", error);
    return NextResponse.json({ error: "Unable to prepare the onboarding agreement." }, { status: 502 });
  }
}
