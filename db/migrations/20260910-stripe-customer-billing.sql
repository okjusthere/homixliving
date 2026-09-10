BEGIN;

ALTER TABLE portal.agents
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

WITH active_candidates AS (
  SELECT
    agent_id,
    MIN(stripe_customer_id) AS stripe_customer_id
  FROM portal.commerce_orders
  WHERE agent_id IS NOT NULL
    AND stripe_customer_id IS NOT NULL
    AND billing_mode = 'subscription'
    AND status IN ('active', 'canceling', 'past_due')
  GROUP BY agent_id
  HAVING COUNT(DISTINCT stripe_customer_id) = 1
), globally_unique AS (
  SELECT stripe_customer_id
  FROM active_candidates
  GROUP BY stripe_customer_id
  HAVING COUNT(*) = 1
)
UPDATE portal.agents AS agents
SET stripe_customer_id = candidates.stripe_customer_id
FROM active_candidates AS candidates
INNER JOIN globally_unique AS unique_ids
  ON unique_ids.stripe_customer_id = candidates.stripe_customer_id
WHERE agents.id = candidates.agent_id
  AND agents.stripe_customer_id IS NULL;

WITH active_conflicts AS (
  SELECT agent_id
  FROM portal.commerce_orders
  WHERE agent_id IS NOT NULL
    AND stripe_customer_id IS NOT NULL
    AND billing_mode = 'subscription'
    AND status IN ('active', 'canceling', 'past_due')
  GROUP BY agent_id
  HAVING COUNT(DISTINCT stripe_customer_id) > 1
), latest_paid AS (
  SELECT DISTINCT ON (orders.agent_id)
    orders.agent_id,
    orders.stripe_customer_id
  FROM portal.commerce_orders AS orders
  LEFT JOIN active_conflicts AS conflicts ON conflicts.agent_id = orders.agent_id
  WHERE orders.agent_id IS NOT NULL
    AND orders.stripe_customer_id IS NOT NULL
    AND orders.payment_channel = 'stripe'
    AND orders.paid_at IS NOT NULL
    AND conflicts.agent_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM portal.agents AS assigned
      WHERE assigned.stripe_customer_id = orders.stripe_customer_id
    )
  ORDER BY orders.agent_id, orders.paid_at DESC, orders.updated_at DESC, orders.id DESC
), globally_unique AS (
  SELECT stripe_customer_id
  FROM latest_paid
  GROUP BY stripe_customer_id
  HAVING COUNT(*) = 1
)
UPDATE portal.agents AS agents
SET stripe_customer_id = candidates.stripe_customer_id
FROM latest_paid AS candidates
INNER JOIN globally_unique AS unique_ids
  ON unique_ids.stripe_customer_id = candidates.stripe_customer_id
WHERE agents.id = candidates.agent_id
  AND agents.stripe_customer_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agents_stripe_customer
  ON portal.agents(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMIT;
