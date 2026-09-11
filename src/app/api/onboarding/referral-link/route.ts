import { NextResponse } from "next/server";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { getOrCreatePersonalReferral } from "@/lib/personal-referral";

export async function POST(request: Request) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;
  if (!auth.session.user.agentId) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    // The authenticated agent is always the sponsor; request data cannot
    // assign another person, a company, or a team to this standing link.
    const referral = await getOrCreatePersonalReferral(auth.session.user.agentId);
    if (!referral) return NextResponse.json({ error: "Only active agents may invite." }, { status: 403 });
    return NextResponse.json({ path: `/join/${referral.token}` }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Could not prepare your invitation. Please try again." }, { status: 500 });
  }
}
