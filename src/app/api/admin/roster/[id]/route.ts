import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth-guards";
import { fetchPublicProfileById } from "@/lib/homixweb";

export const dynamic = "force-dynamic";
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireAdminApi();
  if ("error" in access) return access.error;
  const { id } = await context.params;
  if (!id || id.length > 128)
    return NextResponse.json({ error: "Invalid profile ID" }, { status: 400 });
  const result = await fetchPublicProfileById(id);
  if (result.notFound)
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (result.unreachable || !result.profile)
    return NextResponse.json({ error: "Website unavailable" }, { status: 502 });
  return NextResponse.json(
    { profile: result.profile },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
