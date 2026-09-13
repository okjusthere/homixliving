import { signingActor, signingApiError, signingBridgeFetch, SigningBridgeError } from "@/lib/signing-bridge";
import { inspectOnboardingSigning } from "@/lib/onboarding-signing-access";
import { hrFileManifest } from "@/lib/signing-hr-files";

export async function GET(request: Request) {
  try {
    const actor = await signingActor(), query = new URL(request.url).searchParams;
    const agentId = query.has("agentId") ? Number(query.get("agentId")) : actor.agentId;
    if (!Number.isSafeInteger(agentId) || agentId <= 0) throw new SigningBridgeError("INVALID_AGENT", 400);
    if (agentId !== actor.agentId && !actor.admin) throw new SigningBridgeError("FORBIDDEN", 403);
    const { request: signing } = await inspectOnboardingSigning(agentId);
    if (!signing) throw new SigningBridgeError("AGREEMENT_NOT_STARTED", 404);
    const document = query.get("document"), partId = query.get("part"), kind = query.get("kind") || "original";
    if (!document && !partId) return Response.json(hrFileManifest(signing, `/api/onboarding/agreement/documents?agentId=${agentId}`), { headers: { "Cache-Control": "private, no-store" } });
    const part = signing.parts.find((p) => partId ? p.id === partId : p.document?.files.some((f) => `${p.id}:${f.id}` === document));
    const file = part?.document?.files.find((f) => `${part.id}:${f.id}` === document);
    if (!part || !["original", "signed", "certificate", "audit-log"].includes(kind) || (["original", "signed"].includes(kind) && !file)) throw new SigningBridgeError("DOCUMENT_NOT_FOUND", 404);
    const parameters = new URLSearchParams({ kind, ...(file ? { itemId: file.id } : {}) });
    const response = await signingBridgeFetch(`/v1/requests/${signing.id}/parts/${part.id}/files?${parameters}`, actor);
    return new Response(response.body, { headers: { "Cache-Control": "private, no-store", "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="onboarding-${kind}.pdf"`, "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return signingApiError(error); }
}
