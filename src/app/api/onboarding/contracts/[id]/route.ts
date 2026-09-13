import { eq } from "drizzle-orm";
import { db } from "@/db";
import { onboardingContracts } from "@/db/onboarding-schema";
import { currentSession } from "@/lib/auth-guards";
import { createAgentDocumentDownloadUrl } from "@/lib/r2-storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await currentSession();
  if (!session?.user.agentId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  if (!/^[a-f0-9-]{36}$/i.test(id))
    return Response.json({ error: "Invalid contract" }, { status: 400 });
  const [contract] = await db
    .select()
    .from(onboardingContracts)
    .where(eq(onboardingContracts.id, id));
  if (
    !contract ||
    (!session.user.isAdmin && session.user.agentId !== contract.agentId)
  )
    return Response.json({ error: "Contract not found" }, { status: 404 });
  return new Response(null, {
    status: 302,
    headers: {
      Location: await createAgentDocumentDownloadUrl(
        contract.objectKey,
        contract.fileName,
      ),
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
