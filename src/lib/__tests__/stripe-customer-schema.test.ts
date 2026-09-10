import assert from "node:assert/strict";
import { closeDatabaseConnections, pgClient } from "@/db";
import { ensureStripeCustomerBillingSchema } from "@/db/ensure-schema";

type AgentRow = { id: number; email: string; stripe_customer_id: string | null };

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const emails = {
    active: `stripe-active-${suffix}@example.com`,
    paid: `stripe-paid-${suffix}@example.com`,
    conflict: `stripe-conflict-${suffix}@example.com`,
    empty: `stripe-empty-${suffix}@example.com`,
    duplicate: `stripe-duplicate-${suffix}@example.com`,
  };

  const inserted = await pgClient<AgentRow[]>`
    INSERT INTO portal.agents (name, email, account_status, created_at, updated_at)
    VALUES
      ('Active Subscription', ${emails.active}, 'active', NOW(), NOW()),
      ('Latest Paid', ${emails.paid}, 'active', NOW(), NOW()),
      ('Conflicting Active', ${emails.conflict}, 'active', NOW(), NOW()),
      ('No History', ${emails.empty}, 'active', NOW(), NOW()),
      ('Duplicate Historical', ${emails.duplicate}, 'active', NOW(), NOW())
    RETURNING id, email, stripe_customer_id
  `;
  const idByEmail = new Map(inserted.map((row) => [row.email, row.id]));
  const agentIds = inserted.map((row) => row.id);
  const requireId = (email: string) => {
    const id = idByEmail.get(email);
    assert.ok(id, `Missing inserted agent for ${email}`);
    return id;
  };
  const activeId = requireId(emails.active);
  const paidId = requireId(emails.paid);
  const conflictId = requireId(emails.conflict);
  const emptyId = requireId(emails.empty);
  const duplicateId = requireId(emails.duplicate);

  try {
    await pgClient`
      INSERT INTO portal.commerce_orders (
        agent_id, product_key, product_name, billing_mode, amount_cents,
        currency, status, stripe_customer_id, payment_channel, paid_at,
        created_at, updated_at
      ) VALUES
        (${activeId}, 'company_domain_email', 'Email', 'subscription', 1000,
         'usd', 'active', 'cus_activecanonical', 'stripe', NOW(), NOW(), NOW()),
        (${paidId}, 'libor', 'LIBOR old', 'payment', 1000,
         'usd', 'paid', 'cus_oldpaid', 'stripe', NOW() - INTERVAL '2 days', NOW(), NOW()),
        (${paidId}, 'libor', 'LIBOR latest', 'payment', 2000,
         'usd', 'paid', 'cus_latestpaid', 'stripe', NOW() - INTERVAL '1 day', NOW(), NOW()),
        (${conflictId}, 'company_domain_email', 'Email A', 'subscription', 1000,
         'usd', 'active', 'cus_conflictone', 'stripe', NOW(), NOW(), NOW()),
        (${conflictId}, 'elite_desk_fee', 'Plan B', 'subscription', 1000,
         'usd', 'past_due', 'cus_conflicttwo', 'stripe', NOW(), NOW(), NOW()),
        (${duplicateId}, 'libor', 'Duplicate', 'payment', 1000,
         'usd', 'paid', 'cus_activecanonical', 'stripe', NOW(), NOW(), NOW())
    `;

    await ensureStripeCustomerBillingSchema(pgClient);

    const rows = await pgClient<AgentRow[]>`
      SELECT id, email, stripe_customer_id
      FROM portal.agents
      WHERE id = ANY(${agentIds})
    `;
    const customerByEmail = new Map(rows.map((row) => [row.email, row.stripe_customer_id]));
    assert.equal(customerByEmail.get(emails.active), "cus_activecanonical");
    assert.equal(customerByEmail.get(emails.paid), "cus_latestpaid");
    assert.equal(customerByEmail.get(emails.conflict), null);
    assert.equal(customerByEmail.get(emails.empty), null);
    assert.equal(customerByEmail.get(emails.duplicate), null);

    await pgClient`
      UPDATE portal.agents
      SET stripe_customer_id = 'cus_manualoverride'
      WHERE id = ${paidId}
    `;
    await ensureStripeCustomerBillingSchema(pgClient);
    const [manual] = await pgClient<AgentRow[]>`
      SELECT id, email, stripe_customer_id
      FROM portal.agents
      WHERE id = ${paidId}
    `;
    assert.equal(manual?.stripe_customer_id, "cus_manualoverride");

    await assert.rejects(async () => {
      await pgClient`
        UPDATE portal.agents
        SET stripe_customer_id = 'cus_activecanonical'
        WHERE id = ${emptyId}
      `;
    },
      /uq_agents_stripe_customer|duplicate key value/,
    );
  } finally {
    await pgClient`
      DELETE FROM portal.commerce_orders
      WHERE agent_id = ANY(${agentIds})
    `;
    await pgClient`
      DELETE FROM portal.agents
      WHERE id = ANY(${agentIds})
    `;
  }

  console.log("Stripe Customer schema tests passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnections();
  });
