import { auth } from "@/auth";
import { requireAdminApi } from "@/lib/auth-guards";
import { inspectOnboardingSigning } from "@/lib/onboarding-signing-access";
import { downloadESignPdf, getESignEvidence } from "@/lib/esign";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.agentId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const target = query.get("agentId");
  const agentId = target ? Number(target) : session.user.agentId;
  if (!Number.isSafeInteger(agentId) || agentId <= 0)
    return Response.json({ error: "Invalid agent" }, { status: 400 });
  if (agentId !== session.user.agentId) {
    const admin = await requireAdminApi();
    if ("error" in admin) return admin.error;
  }
  try {
    const { envelope } = await inspectOnboardingSigning(agentId);
    if (!envelope)
      return Response.json({ error: "Agreement not started" }, { status: 404 });
    const headers = { "Cache-Control": "private, no-store" };
    const documentId = query.get("document");
    const filename = query.get("completed");
    if (!documentId && !filename)
      return Response.json(
        {
          documents: (envelope.documents || []).map((d) => ({
            id: d.id,
            name: d.name,
          })),
        },
        { headers },
      );
    let file: { documentId: string } | { filename: string };
    if (filename) {
      if (envelope.status !== "COMPLETED")
        return Response.json(
          { error: "Final document is not ready" },
          { status: 409 },
        );
      const evidence = await getESignEvidence(envelope.id);
      if (
        evidence.verificationStatus !== "VERIFIED" ||
        !evidence.files?.some(
          (f) => f.name === filename && f.contentType === "application/pdf",
        )
      )
        return Response.json({ error: "Document not found" }, { status: 404 });
      file = { filename };
    } else {
      if (!envelope.documents?.some((d) => d.id === documentId))
        return Response.json({ error: "Document not found" }, { status: 404 });
      file = { documentId: documentId! };
    }
    const bytes = await downloadESignPdf(envelope.id, file);
    return new Response(bytes, {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="onboarding-${filename ? "completed" : "original"}.pdf"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "Contract is temporarily unavailable. Please retry." },
      { status: 502 },
    );
  }
}
