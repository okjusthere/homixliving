import { z } from "zod";
import { currentSession } from "@/lib/auth-guards";
import { LicenseDeclarationConflict, saveLicenseDeclaration } from "@/lib/onboarding-license-records";

export async function PUT(request: Request) {
  const session = await currentSession();
  if (!session?.user?.agentId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const result = await saveLicenseDeclaration(session.user.agentId, await request.json());
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json({ error: "Enter the release status and previous brokerage; explain if not applicable." }, { status: 400 });
    if (error instanceof LicenseDeclarationConflict)
      return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: "Could not save the release declaration" }, { status: 500 });
  }
}
