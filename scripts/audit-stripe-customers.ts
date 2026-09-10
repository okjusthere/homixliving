import { closeDatabaseConnections, pgClient } from "../src/db";

type AuditRow = {
  agent_id: number;
  email: string;
  canonical_customer_id: string | null;
  historical_customer_count: number;
  active_customer_count: number;
};

async function main() {
  const rows = await pgClient<AuditRow[]>`
    SELECT
      agents.id AS agent_id,
      agents.email,
      agents.stripe_customer_id AS canonical_customer_id,
      COUNT(DISTINCT orders.stripe_customer_id)::INTEGER AS historical_customer_count,
      COUNT(DISTINCT orders.stripe_customer_id) FILTER (
        WHERE orders.billing_mode = 'subscription'
          AND orders.status IN ('active', 'canceling', 'past_due')
      )::INTEGER AS active_customer_count
    FROM portal.agents AS agents
    LEFT JOIN portal.commerce_orders AS orders ON orders.agent_id = agents.id
    GROUP BY agents.id, agents.email, agents.stripe_customer_id
    ORDER BY
      COUNT(DISTINCT orders.stripe_customer_id) FILTER (
        WHERE orders.billing_mode = 'subscription'
          AND orders.status IN ('active', 'canceling', 'past_due')
      ) DESC,
      COUNT(DISTINCT orders.stripe_customer_id) DESC,
      agents.id
  `;

  const summary = {
    agents: rows.length,
    canonicalAssigned: rows.filter((row) => row.canonical_customer_id).length,
    noHistoricalCustomer: rows.filter((row) => row.historical_customer_count === 0).length,
    oneHistoricalCustomer: rows.filter((row) => row.historical_customer_count === 1).length,
    multipleHistoricalCustomers: rows.filter((row) => row.historical_customer_count > 1).length,
    conflictingActiveCustomers: rows.filter((row) => row.active_customer_count > 1).length,
  };

  console.log("Stripe Customer audit summary");
  console.table(summary);

  const conflicts = rows.filter(
    (row) => row.historical_customer_count > 1 || row.active_customer_count > 1,
  );
  if (conflicts.length > 0) {
    console.log("Agents requiring billing identity review");
    console.table(conflicts);
    process.exitCode = 2;
  } else {
    console.log("No Stripe Customer conflicts found.");
  }
}

main()
  .catch((error) => {
    console.error("Stripe Customer audit failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabaseConnections();
  });
