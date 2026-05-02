import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

export async function requireActiveAgent() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/login");
  }

  if (!session.user.isAdmin && !session.user.isActive) {
    redirect("/pending");
  }

  return session;
}

export async function requireActiveAgentApi() {
  const session = await auth();

  if (!session?.user?.email) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!session.user.isAdmin && !session.user.isActive) {
    return {
      error: NextResponse.json({ error: "Inactive account" }, { status: 403 }),
    };
  }

  return { session };
}

export async function requireAdminApi() {
  const result = await requireActiveAgentApi();
  if ("error" in result) return result;

  if (!result.session.user.isAdmin) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return result;
}
