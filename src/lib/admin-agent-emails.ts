import "server-only";
import type { PoolClient } from "pg";
import { pgPool } from "@/db";
import { isConfiguredAdminEmail } from "@/lib/admin-emails";
import {
  EMAIL_CHANGE_TTL_MS,
  isValidLoginEmail,
  normalizeEmail,
} from "@/lib/email-change";

export class AgentEmailError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}

export type EmailOwner = {
  id: number;
  name: string;
  email: string;
  accountStatus: string;
};
export type AgentEmailPreview = {
  email: string;
  target: EmailOwner & { isAdmin: boolean };
  state: "available" | "linked" | "conflict" | "pending" | "reserved";
  owners: EmailOwner[];
};
export type ManagedAgentEmail = {
  email: string;
  isPrimary: boolean;
  canSignIn: boolean;
  verifiedAt: string | null;
  source: string;
};

function validEmail(value: unknown): string {
  const email = normalizeEmail(value);
  if (!email || !isValidLoginEmail(email))
    throw new AgentEmailError("INVALID_EMAIL", 400);
  return email;
}

async function inspect(
  client: PoolClient,
  agentId: number,
  email: string,
): Promise<AgentEmailPreview> {
  const {
    rows: [target],
  } = await client.query<AgentEmailPreview["target"]>(
    `SELECT id, name, email, account_status AS "accountStatus", is_admin AS "isAdmin"
     FROM portal.agents WHERE id=$1`,
    [agentId],
  );
  if (!target) throw new AgentEmailError("AGENT_NOT_FOUND", 404);

  // Check every identity source, including the legacy primary projection and
  // disabled Google subjects. An email conflict must never silently move a login.
  const { rows: owners } = await client.query<EmailOwner>(
    `SELECT id, name, email, account_status AS "accountStatus" FROM portal.agents WHERE id IN (
       SELECT agent_id FROM portal.agent_email_addresses WHERE lower(email)=$1
       UNION SELECT id FROM portal.agents WHERE lower(email)=$1
       UNION SELECT agent_id FROM portal.agent_login_identities WHERE lower(email_at_link)=$1
     ) ORDER BY id`,
    [email],
  );
  const { rows: pending } = await client.query<{ id: number }>(
    `SELECT id FROM portal.agents WHERE lower(pending_email)=$1
       AND email_change_requested_at > NOW() - ($2 * INTERVAL '1 millisecond')`,
    [email, EMAIL_CHANGE_TTL_MS],
  );
  const state = owners.some((owner) => owner.id !== agentId)
    ? "conflict"
    : owners.length
      ? "linked"
      : isConfiguredAdminEmail(email)
        ? "reserved"
        : pending.length
          ? "pending"
          : "available";
  return { email, target, state, owners };
}

export async function listAgentEmails(agentId: number) {
  const {
    rows: [agent],
  } = await pgPool.query(`SELECT id FROM portal.agents WHERE id=$1`, [agentId]);
  if (!agent) throw new AgentEmailError("AGENT_NOT_FOUND", 404);
  const { rows } = await pgPool.query<ManagedAgentEmail>(
    `SELECT email, is_primary AS "isPrimary", can_sign_in AS "canSignIn",
       verified_at AS "verifiedAt", source FROM portal.agent_email_addresses
     WHERE agent_id=$1 ORDER BY is_primary DESC, lower(email)`,
    [agentId],
  );
  return rows;
}

export async function previewAgentEmail(agentId: number, value: unknown) {
  const email = validEmail(value);
  const client = await pgPool.connect();
  try {
    return await inspect(client, agentId, email);
  } finally {
    client.release();
  }
}

export async function linkAgentEmail(input: {
  agentId: number;
  email: string;
  actorId: number;
  expectedAdmin: boolean;
}) {
  const email = validEmail(input.email);
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    // Order locks consistently even when two administrators edit each other.
    const { rows: locked } = await client.query<{
      id: number;
      is_admin: boolean;
      account_status: string;
      email: string;
    }>(
      `SELECT id,is_admin,account_status,email FROM portal.agents
       WHERE id=ANY($1::integer[]) ORDER BY id FOR UPDATE`,
      [[input.actorId, input.agentId]],
    );
    const actor = locked.find((row) => row.id === input.actorId);
    if (!actor?.is_admin || actor.account_status !== "active")
      throw new AgentEmailError("FORBIDDEN", 403);
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`agent-email:${email}`],
    );
    const preview = await inspect(client, input.agentId, email);
    if (preview.target.isAdmin !== input.expectedAdmin)
      throw new AgentEmailError("ACCESS_CHANGED");
    if (preview.state !== "available")
      throw new AgentEmailError(
        {
          linked: "ALREADY_LINKED",
          conflict: "EMAIL_IN_USE",
          pending: "EMAIL_PENDING",
          reserved: "RESERVED_ADMIN_EMAIL",
        }[preview.state],
      );

    // This is an administrator's ownership attestation, not Google verification.
    // Google still proves control of this mailbox at the next sign-in. Primary
    // email, company access, financial records and public profile stay on the person.
    await client.query(
      `INSERT INTO portal.agent_email_addresses
       (agent_id,email,kind,can_sign_in,is_primary,verified_at,source,created_by_agent_id)
       VALUES ($1,$2,'login',TRUE,FALSE,NOW(),'admin_assigned',$3)`,
      [input.agentId, email, input.actorId],
    );
    await client.query(
      `INSERT INTO portal.audit_log(actor_email,action,entity_type,entity_id,summary,detail)
       VALUES ($1,'admin_link_login_email','agent',$2,$3,$4)`,
      [
        actor.email,
        String(input.agentId),
        `管理员关联登录邮箱 ${email}`,
        JSON.stringify({
          actorAgentId: input.actorId,
          agentId: input.agentId,
          primaryEmail: preview.target.email,
          linkedEmail: email,
          isAdmin: preview.target.isAdmin,
          verification: "admin_attested",
        }),
      ],
    );
    await client.query("COMMIT");
    return { email };
  } catch (error) {
    await client.query("ROLLBACK");
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new AgentEmailError("EMAIL_IN_USE");
    }
    throw error;
  } finally {
    client.release();
  }
}
