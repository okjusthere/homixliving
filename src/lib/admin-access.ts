import "server-only";
import { and, eq, exists, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { agentEmailAddresses, agents } from "@/db/schema";
import { configuredAdminEmails, isConfiguredAdminEmail } from "@/lib/admin-emails";
import { logAudit } from "@/lib/audit";

function agentEmailPredicate(emails: string[]) {
  if (!emails.length) return sql`false`;
  return or(
    inArray(sql`lower(${agents.email})`, emails),
    exists(db.select({ id: agentEmailAddresses.id }).from(agentEmailAddresses).where(and(
      eq(agentEmailAddresses.agentId, agents.id),
      eq(agentEmailAddresses.canSignIn, true),
      isNotNull(agentEmailAddresses.verifiedAt),
      inArray(sql`lower(${agentEmailAddresses.email})`, emails),
    ))),
  );
}

// Stored role projection only. A different login on the same person must not
// clear this marker, or it would revoke another valid administrator session.
// Every authenticated admin action additionally requires the exact login below.
export async function hasConfiguredAdminAccess(agentId: number): Promise<boolean> {
  const [match] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(
      eq(agents.id, agentId),
      agentEmailPredicate(configuredAdminEmails()),
    ))
    .limit(1);
  return Boolean(match);
}

/** Never infer the actual Google login from a primary email or another alias. */
export async function hasConfiguredAdminLoginAccess(agentId: number, loginEmail: unknown): Promise<boolean> {
  if (typeof loginEmail !== "string" || !isConfiguredAdminEmail(loginEmail)) return false;
  const [match] = await db.select({ id: agents.id }).from(agents).where(and(
    eq(agents.id, agentId),
    agentEmailPredicate([loginEmail.trim().toLowerCase()]),
  )).limit(1);
  return Boolean(match);
}

export async function configuredActiveAdminIds(): Promise<number[]> {
  const rows = await db.select({ id: agents.id }).from(agents).where(and(
    eq(agents.isAdmin, true),
    eq(agents.accountStatus, "active"),
    agentEmailPredicate(configuredAdminEmails()),
  ));
  return rows.map(row => row.id);
}

export async function reconcileConfiguredAccess(
  existing: typeof agents.$inferSelect,
  name: string | null | undefined,
) {
  const configured = await hasConfiguredAdminAccess(existing.id);
  const roleChanged = configured !== existing.isAdmin;
  const fillName = !existing.name && Boolean(name);
  if (!roleChanged && !fillName) return existing;

  const [updated] = await db.update(agents).set({
    ...(roleChanged ? { isAdmin: configured } : {}),
    ...(fillName ? { name: name! } : {}),
    updatedAt: new Date().toISOString(),
  }).where(eq(agents.id, existing.id)).returning();

  // A configured role never overrides suspension or incomplete onboarding.
  // Only new administrator creation bootstraps an active account; restoring an
  // existing account must go through the explicit approval workflow.
  if (updated && roleChanged) {
    await logAudit(null, configured ? "configured_admin_granted" : "configured_admin_revoked",
      "agent", existing.id, configured ? "管理员配置授予权限" : "管理员配置撤销权限",
      { source: "ADMIN_EMAILS", previousIsAdmin: existing.isAdmin, isAdmin: configured });
  }
  return updated || existing;
}
