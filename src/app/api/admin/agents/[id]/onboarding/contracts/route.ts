import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, onboardingEvents } from "@/db/schema";
import { onboardingContracts } from "@/db/onboarding-schema";
import { requireAdminApi } from "@/lib/auth-guards";
import {
  createDealDocumentUploadUrl,
  putAgentDocument,
  readPrivatePdf,
  R2ConfigurationError,
} from "@/lib/r2-storage";
import { lockOnboardingAgent } from "@/lib/advisory-locks";
import { onboardingEventValues } from "@/lib/onboarding-events";

const pastDate = z.iso
  .date()
  .refine((v) => v <= new Date().toISOString().slice(0, 10));
const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upload"),
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .regex(/\.pdf$/i),
    byteSize: z
      .number()
      .int()
      .positive()
      .max(25 * 1024 * 1024),
  }),
  z.object({
    action: z.literal("register"),
    uploadId: z.uuid(),
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .regex(/\.pdf$/i),
    source: z.enum(["paper", "historic"]),
    company: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(200),
    version: z.string().trim().min(1).max(120),
    purpose: z.literal("agent_affiliation"),
    agentSignedAt: pastDate,
    companySignedAt: pastDate.nullable(),
    replacesId: z.uuid().nullable().default(null),
  }),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const id = (await params).id;
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1)
    return Response.json({ error: "Invalid agent" }, { status: 400 });
  const agentId = Number(id),
    actorId = auth.session.user.agentId!;
  try {
    const body = input.parse(await request.json());
    const [agent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.id, agentId));
    if (!agent)
      return Response.json({ error: "Agent not found" }, { status: 404 });
    if (body.action === "upload") {
      const uploadId = randomUUID();
      const url = await createDealDocumentUploadUrl(
        `hr-staging/${actorId}/${agentId}/${uploadId}.pdf`,
        "application/pdf",
      );
      return Response.json(
        { uploadId, uploadUrl: url },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const [existing] = await db
      .select({ id: onboardingContracts.id })
      .from(onboardingContracts)
      .where(
        and(
          eq(onboardingContracts.id, body.uploadId),
          eq(onboardingContracts.agentId, agentId),
        ),
      );
    if (existing)
      return Response.json({ contractId: existing.id, replayed: true });
    const bytes = await readPrivatePdf(
      `hr-staging/${actorId}/${agentId}/${body.uploadId}.pdf`,
    );
    // The presigned staging object can be overwritten until expiry. Copy to a
    // fresh server-only key before verification so accepted bytes are immutable.
    const objectKey = `hr-contracts/${agentId}/${randomUUID()}.pdf`;
    await putAgentDocument(objectKey, bytes, "application/pdf");
    const contractId = await db.transaction(async (tx) => {
      await lockOnboardingAgent(tx, agentId);
      const [prior] = await tx
        .select()
        .from(onboardingContracts)
        .where(eq(onboardingContracts.id, body.uploadId));
      if (prior) {
        if (prior.agentId !== agentId)
          throw new Error("Upload already bound to another person");
        return prior.id;
      }
      if (body.replacesId) {
        const [replaced] = await tx
          .select()
          .from(onboardingContracts)
          .where(
            and(
              eq(onboardingContracts.id, body.replacesId),
              eq(onboardingContracts.agentId, agentId),
            ),
          );
        if (!replaced)
          throw new Error("The replaced version does not belong to this agent");
      }
      await tx
        .insert(onboardingContracts)
        .values({
          id: body.uploadId,
          agentId,
          source: body.source,
          company: body.company,
          title: body.title,
          version: body.version,
          purpose: body.purpose,
          objectKey,
          fileName: body.fileName,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          byteSize: bytes.length,
          agentSignedAt: `${body.agentSignedAt}T12:00:00.000Z`,
          companySignedAt: body.companySignedAt
            ? `${body.companySignedAt}T12:00:00.000Z`
            : null,
          replacesId: body.replacesId,
          uploadedBy: actorId,
        });
      await tx
        .insert(onboardingEvents)
        .values(
          onboardingEventValues({
            agentId,
            actorAgentId: actorId,
            eventType: "manual_contract_uploaded",
            detail: {
              contractId: body.uploadId,
              source: body.source,
              title: body.title,
              replacesId: body.replacesId,
            },
          }),
        );
      return body.uploadId;
    });
    return Response.json({ contractId });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json(
        { error: "Check the PDF, contract details and signing dates" },
        { status: 400 },
      );
    if (error instanceof R2ConfigurationError)
      return Response.json({ error: error.message }, { status: 503 });
    console.error("Manual contract upload failed", error);
    return Response.json(
      { error: "Unable to register this PDF. No verification was recorded." },
      { status: 500 },
    );
  }
}
