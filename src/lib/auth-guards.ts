import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";

// A cached JWT must not preserve administrator access after it is revoked.
// Read only the current access fields, and deduplicate within a server render.
const currentSession = cache(async () => {
  const session = await auth();
  if (!session?.user?.isAdmin) return session;
  const id = session.user.agentId;
  const [access] = id
    ? await db
        .select({
          isAdmin: agents.isAdmin,
          accountStatus: agents.accountStatus,
        })
        .from(agents)
        .where(eq(agents.id, id))
        .limit(1)
    : [];
  if (!access) return null;
  return {
    ...session,
    user: {
      ...session.user,
      ...access,
      isAdmin: access.isAdmin && access.accountStatus === "active",
      isActive: access.accountStatus === "active",
    },
  };
});

export async function requireActiveAgent() {
  const session = await currentSession();

  if (!session?.user?.email) {
    redirect("/login");
  }

  if (!session.user.isAdmin && session.user.accountStatus !== "active") {
    redirect("/pending");
  }

  return session;
}

export async function requireActiveAgentApi() {
  const session = await currentSession();

  if (!session?.user?.email) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!session.user.isAdmin && session.user.accountStatus !== "active") {
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

export async function requireAdmin() {
  const session = await requireActiveAgent();
  if (!session.user.isAdmin) redirect("/");
  return session;
}
