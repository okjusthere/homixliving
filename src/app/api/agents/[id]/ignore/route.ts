import { requireAdminApi } from "@/lib/auth-guards";
export async function POST() {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  return Response.json({ error: "Use Manage onboarding → Defer / resume intake and record a reason." }, { status: 410 });
}
