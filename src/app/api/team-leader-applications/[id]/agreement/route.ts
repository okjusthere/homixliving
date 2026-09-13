import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { teamLeaderApplications } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import {
  availableTeamLeaderPackage,
  getTeamLeaderSigningRequest,
  prepareTeamLeaderSigning,
  recoverTeamLeaderSigning,
} from "@/lib/signing-team-leader";
import { syncTeamLeaderAgreement } from "@/lib/team-leader-agreement";
import {
  signingActor,
  signingApiError,
  signingBridgeFetch,
  signingBridgeJson,
  SigningBridgeError,
} from "@/lib/signing-bridge";
import { signingRequestSchema } from "@/lib/signing-contract";
import { hrFileManifest } from "@/lib/signing-hr-files";

export const runtime = "nodejs";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };
async function ownedApplication(id: number, agentId: number, admin: boolean) {
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new SigningBridgeError("NOT_FOUND", 404);
  const [application] = await db
    .select()
    .from(teamLeaderApplications)
    .where(
      and(
        eq(teamLeaderApplications.id, id),
        admin
          ? undefined
          : eq(teamLeaderApplications.applicantAgentId, agentId),
      ),
    )
    .limit(1);
  if (!application) throw new SigningBridgeError("NOT_FOUND", 404);
  return application;
}
export async function GET(request: Request, context: Context) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  try {
    const actor = await signingActor(),
      id = Number((await context.params).id);
    const application = await ownedApplication(id, actor.agentId, actor.admin);
    const synced = await syncTeamLeaderAgreement(application);
    const signing = synced.signingRequestId
      ? await getTeamLeaderSigningRequest(synced)
      : null;
    const query = new URL(request.url).searchParams,
      document = query.get("document"),
      partId = query.get("part"),
      kind = query.get("kind") || "original";
    if (document || partId) {
      if (!signing) throw new SigningBridgeError("AGREEMENT_NOT_STARTED", 404);
      const part = signing.parts.find((p) =>
        partId
          ? p.id === partId
          : p.document?.files.some((f) => `${p.id}:${f.id}` === document),
      );
      const file = part?.document?.files.find(
        (f) => `${part.id}:${f.id}` === document,
      );
      if (
        !part ||
        !["original", "signed", "certificate", "audit-log"].includes(kind) ||
        (["original", "signed"].includes(kind) && !file)
      )
        throw new SigningBridgeError("DOCUMENT_NOT_FOUND", 404);
      const response = await signingBridgeFetch(
        `/v1/requests/${signing.id}/parts/${part.id}/files?${new URLSearchParams({ kind, ...(file ? { itemId: file.id } : {}) })}`,
        actor,
      );
      return new Response(response.body, {
        headers: {
          ...headers,
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="team-leader-${kind}.pdf"`,
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    let configured = Boolean(synced.signingPreparation);
    if (!configured) {
      try {
        configured = Boolean(await availableTeamLeaderPackage(application));
      } catch {
        configured = false;
      }
    }
    return Response.json(
      {
        configured,
        agreementStatus: signing ? synced.agreementStatus : "not_started",
        teamId: synced.teamId,
        signing,
        files: signing
          ? hrFileManifest(
              signing,
              `/api/team-leader-applications/${id}/agreement`,
            )
          : null,
      },
      { headers },
    );
  } catch (error) {
    return signingApiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  try {
    const actor = await signingActor(),
      id = Number((await context.params).id);
    const application = await ownedApplication(id, actor.agentId, actor.admin);
    const body = z
      .object({
        action: z
          .enum(["prepare", "recover", "continue", "resend"])
          .default("prepare"),
        recipient: z.enum(["owner", "company"]).default("owner"),
      })
      .strict()
      .parse(
        request.headers.get("content-type")?.includes("application/json")
          ? await request.json()
          : {},
      );
    if (body.action === "prepare" || body.action === "recover") {
      if (application.applicantAgentId !== actor.agentId)
        throw new SigningBridgeError("FORBIDDEN", 403);
      const updated =
        body.action === "recover"
          ? await recoverTeamLeaderSigning(application)
          : await prepareTeamLeaderSigning(application);
      return Response.json(
        { success: true, agreementStatus: updated.agreementStatus },
        { headers },
      );
    }
    if (
      (body.recipient === "company" ||
        application.applicantAgentId !== actor.agentId) &&
      !actor.admin
    )
      throw new SigningBridgeError("FORBIDDEN", 403);
    const signing = await getTeamLeaderSigningRequest(application);
    if (body.action === "resend") {
      await signingBridgeJson(
        `/v1/requests/${signing.id}/commands`,
        actor,
        signingRequestSchema,
        { action: "remind", recipientActor: body.recipient },
      );
      return Response.json({ sent: true }, { headers });
    }
    for (const part of signing.parts) {
      const recipient =
        part.document?.status === "PENDING" &&
        part.document.recipients.find(
          (r) =>
            r.actor === body.recipient &&
            r.role === "SIGNER" &&
            r.signingStatus === "NOT_SIGNED" &&
            actor.verifiedEmails.includes(r.email.toLowerCase()),
        );
      if (recipient)
        return Response.json(
          await signingBridgeJson(
            `/v1/requests/${signing.id}/parts/${part.id}/access`,
            actor,
            z.object({ url: z.url() }),
            { kind: "signer", recipientId: recipient.id },
          ),
          { headers },
        );
    }
    throw new SigningBridgeError("SIGNER_ACCESS_DENIED", 403);
  } catch (error) {
    return signingApiError(error);
  }
}
