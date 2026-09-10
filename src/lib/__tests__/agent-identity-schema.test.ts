import assert from "node:assert/strict";
import { closeDatabaseConnections, pgClient } from "@/db";
import { ensureAgentIdentitySchema } from "@/db/ensure-schema";

type AgentRow = { id: number; email: string };
type EmailRow = {
  agent_id: number;
  email: string;
  can_sign_in: boolean;
  is_primary: boolean;
  verified_at: string | null;
};

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const primaryEmail = `identity-primary-${suffix}@example.com`;
  const otherEmail = `identity-other-${suffix}@example.com`;
  const aliasEmail = `identity-alias-${suffix}@example.com`;
  const subject = `google-sub-${suffix}`;

  const inserted = await pgClient<AgentRow[]>`
    INSERT INTO portal.agents (name, email, account_status, created_at, updated_at)
    VALUES
      ('Identity Primary', ${primaryEmail}, 'active', NOW(), NOW()),
      ('Identity Other', ${otherEmail}, 'active', NOW(), NOW())
    RETURNING id, email
  `;
  const primaryId = inserted.find((row) => row.email === primaryEmail)?.id;
  const otherId = inserted.find((row) => row.email === otherEmail)?.id;
  assert.ok(primaryId);
  assert.ok(otherId);

  try {
    await ensureAgentIdentitySchema(pgClient);

    const [backfilled] = await pgClient<EmailRow[]>`
      SELECT agent_id, email, can_sign_in, is_primary, verified_at
      FROM portal.agent_email_addresses
      WHERE lower(email) = lower(${primaryEmail})
    `;
    assert.equal(backfilled?.agent_id, primaryId);
    assert.equal(backfilled?.can_sign_in, true);
    assert.equal(backfilled?.is_primary, true);
    assert.ok(backfilled?.verified_at);

    await pgClient`
      INSERT INTO portal.agent_email_addresses (
        agent_id, email, kind, can_sign_in, is_primary, verified_at, source
      ) VALUES (${primaryId}, ${aliasEmail}, 'personal', TRUE, FALSE, NOW(), 'test')
    `;
    await assert.rejects(
      async () => {
        await pgClient`
          INSERT INTO portal.agent_email_addresses (
            agent_id, email, kind, can_sign_in, is_primary, verified_at, source
          ) VALUES (${otherId}, ${aliasEmail.toUpperCase()}, 'login', TRUE, FALSE, NOW(), 'test')
        `;
      },
      /uq_agent_email_addresses_lower|duplicate key value/,
    );

    await pgClient`
      INSERT INTO portal.agent_login_identities (
        agent_id, provider, provider_subject, email_at_link,
        is_primary, verified_at, last_used_at, source
      ) VALUES (${primaryId}, 'google', ${subject}, ${aliasEmail}, FALSE, NOW(), NOW(), 'test')
    `;
    await assert.rejects(
      async () => {
        await pgClient`
          INSERT INTO portal.agent_login_identities (
            agent_id, provider, provider_subject, email_at_link,
            is_primary, verified_at, last_used_at, source
          ) VALUES (${otherId}, 'google', ${subject}, ${otherEmail}, FALSE, NOW(), NOW(), 'test')
        `;
      },
      /uq_agent_login_identity_provider_subject|duplicate key value/,
    );

    const rlsRows = await pgClient<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT relname, relrowsecurity
      FROM pg_class
      WHERE oid IN (
        'portal.agent_email_addresses'::regclass,
        'portal.agent_login_identities'::regclass,
        'portal.agent_merge_history'::regclass
      )
    `;
    assert.equal(rlsRows.length, 3);
    assert.ok(rlsRows.every((row) => row.relrowsecurity));
  } finally {
    await pgClient`DELETE FROM portal.agents WHERE id IN (${primaryId}, ${otherId})`;
  }

  console.log("agent identity schema tests passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnections();
  });
