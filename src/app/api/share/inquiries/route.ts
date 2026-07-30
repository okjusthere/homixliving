import { NextRequest, NextResponse } from "next/server";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { loadShareInquiryDetails } from "@/lib/share-center";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;

  const linkId = Number(request.nextUrl.searchParams.get("linkId"));
  if (!Number.isInteger(linkId) || linkId <= 0) {
    return NextResponse.json(
      { error: "Invalid share link" },
      {
        status: 400,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  const viewerAgentId = auth.session.user.agentId;
  if (!viewerAgentId && !auth.session.user.isAdmin) {
    return NextResponse.json(
      { error: "Your account is not linked to an agent profile." },
      {
        status: 409,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  const result = await loadShareInquiryDetails({
    linkId,
    viewerAgentId: viewerAgentId ?? null,
    isAdmin: auth.session.user.isAdmin,
  });
  if (!result) {
    return NextResponse.json(
      { error: "Share link not found" },
      {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
