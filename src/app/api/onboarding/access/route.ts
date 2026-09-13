import { currentSession } from "@/lib/auth-guards";

export async function GET() {
  const session = await currentSession();
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(
    {
      accountStatus: session.user.accountStatus,
      capabilities: session.user.limitedCapabilities || [],
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
