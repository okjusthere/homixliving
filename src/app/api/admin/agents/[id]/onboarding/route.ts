import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  commerceOrders,
  onboardingEvents,
  teamJoinRequests,
} from "@/db/schema";
import { requireAdminApi } from "@/lib/auth-guards";
import { ESignApiError, getESignEvidence } from "@/lib/esign";
import { syncOnboardingAgreement } from "@/lib/onboarding-agreement";
import {
  inspectOnboardingSigning,
  requestOnboardingSigning,
  SigningAccessError,
} from "@/lib/onboarding-signing-access";
import { onboardingWorkflow } from "@/lib/onboarding-workflow";
import { z } from "zod";

const parseId = (id: string) =>
  /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0
    ? Number(id)
    : null;
const headers = { "Cache-Control": "private, no-store" };
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const id = parseId((await params).id);
  if (!id) return Response.json({ error: "Invalid agent" }, { status: 400 });
  let [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, id))
    .limit(1);
  if (!agent)
    return Response.json({ error: "Agent not found" }, { status: 404 });
  let warning = false;
  if (agent.esignEnvelopeId) {
    try {
      agent = await syncOnboardingAgreement(agent);
    } catch {
      warning = true;
    }
  }
  const [orders, requests, events] = await Promise.all([
    db
      .select({
        id: commerceOrders.id,
        channel: commerceOrders.paymentChannel,
        amountCents: commerceOrders.amountCents,
        paidAt: commerceOrders.paidAt,
        reference: commerceOrders.offlineReference,
        verifiedBy: commerceOrders.verifiedByEmail,
      })
      .from(commerceOrders)
      .where(
        and(
          eq(commerceOrders.agentId, id),
          gt(commerceOrders.licenseTransferFeeCents, 0),
          inArray(commerceOrders.status, ["paid", "active"]),
        ),
      )
      .orderBy(desc(commerceOrders.paidAt), desc(commerceOrders.id))
      .limit(1),
    db
      .select({ id: teamJoinRequests.id })
      .from(teamJoinRequests)
      .where(
        and(
          eq(teamJoinRequests.agentId, id),
          eq(teamJoinRequests.status, "pending"),
        ),
      )
      .limit(1),
    db
      .select({
        id: onboardingEvents.id,
        type: onboardingEvents.eventType,
        at: onboardingEvents.createdAt,
      })
      .from(onboardingEvents)
      .where(eq(onboardingEvents.agentId, id))
      .orderBy(desc(onboardingEvents.createdAt))
      .limit(12),
  ]);
  let signing = null;
  try {
    const { envelope, signer, countersigner } =
      await inspectOnboardingSigning(id);
    if (envelope) {
      const evidence =
        envelope.status === "COMPLETED"
          ? await getESignEvidence(envelope.id)
          : null;
      signing = {
        status: envelope.status,
        expiresAt: envelope.expiresAt,
        signer: signer && {
          name: signer.name,
          email: signer.email,
          status: signer.status,
        },
        countersigner: countersigner && {
          name: countersigner.name,
          email: countersigner.email,
          status: countersigner.status,
        },
        documents: (envelope.documents || []).map((d) => ({
          id: d.id,
          name: d.name,
        })),
        completedFiles:
          evidence?.verificationStatus === "VERIFIED"
            ? (evidence.files || [])
                .filter((f) => f.contentType === "application/pdf")
                .map((f) => f.name)
            : [],
      };
    }
  } catch {
    warning = true;
  }
  return Response.json(
    {
      agent: {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        accountStatus: agent.accountStatus,
        agreementStatus: agent.agreementStatus,
        agreementAgentSignedAt: agent.agreementAgentSignedAt,
        agreementCountersignedAt: agent.agreementCountersignedAt,
        paymentStatus: agent.paymentStatus,
      },
      workflow: onboardingWorkflow(
        agent,
        orders[0]?.channel || null,
        requests.length > 0,
      ),
      payment: orders[0] || null,
      signing,
      warning,
      events,
    },
    { headers },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const id = parseId((await params).id);
  if (!id) return Response.json({ error: "Invalid agent" }, { status: 400 });
  try {
    const body = z
      .object({
        action: z.literal("resend"),
        recipient: z.enum(["agent", "company"]),
      })
      .strict()
      .parse(await request.json());
    const result = await requestOnboardingSigning({
      agentId: id,
      actorId: auth.session.user.agentId!,
      action: "resend",
      countersigner: body.recipient === "company",
    });
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof SigningAccessError)
      return Response.json({ code: error.code }, { status: error.status });
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json({ code: "INVALID_REQUEST" }, { status: 400 });
    return Response.json(
      { code: "SIGNING_UNAVAILABLE" },
      {
        status:
          error instanceof ESignApiError && error.status === 429 ? 429 : 502,
      },
    );
  }
}
