import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import type { LimitedCapability } from "@/db/schema";
import { onboardingAccessGrants } from "@/db/onboarding-schema";
import { effectiveAccess } from "@/lib/onboarding-requirements";
import { hasConfiguredAdminLoginAccess } from "@/lib/admin-access";

// A cached JWT must not preserve administrator access after it is revoked.
// Read only the current access fields, and deduplicate within a server render.
export const currentSession = cache(async () => {
  const session = await auth();
  if (!session?.user) return session;
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
  // Revocation takes effect on the next guarded request even while the JWT or
  // database role projection still contains the former administrator grant.
  const isAdmin = access.isAdmin && access.accountStatus === "active"
    && await hasConfiguredAdminLoginAccess(id!, session.user.loginEmail);
  const grants = access.accountStatus === "pending"
    ? await db.select().from(onboardingAccessGrants).where(eq(onboardingAccessGrants.agentId, id!))
    : [];
  const effective = effectiveAccess(access, grants);
  return {
    ...session,
    user: {
      ...session.user,
      ...access,
      isAdmin,
      isActive: access.accountStatus === "active",
      limitedCapabilities: effective.capabilities,
    },
  };
});

export async function requireCapability(capability: LimitedCapability) {
  const session = await currentSession();
  if (!session?.user?.email) redirect("/login");
  if (!session.user.limitedCapabilities?.includes(capability)) redirect("/pending");
  return session;
}

export async function requireCapabilityApi(capability: LimitedCapability) {
  const session = await currentSession();
  if (!session?.user?.email) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!session.user.limitedCapabilities?.includes(capability)) return { error: NextResponse.json({ error: "This capability is unavailable or its temporary grant has expired" }, { status: 403 }) };
  return { session };
}

export async function requireActiveAgent() {
  const session = await currentSession();

  if (!session?.user?.email) {
    redirect("/login");
  }

  if (session.user.accountStatus !== "active") {
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

  if (session.user.accountStatus !== "active") {
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
