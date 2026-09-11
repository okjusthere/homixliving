-- One current checkout order per campaign. A completed payment stays attached
-- across delivery retries; only an expired, unpaid checkout can be replaced.
CREATE TABLE IF NOT EXISTS portal.listing_email_payments (
  campaign_id UUID PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES portal.agents(id),
  order_id INTEGER NOT NULL UNIQUE REFERENCES portal.commerce_orders(id),
  checkout_params JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_listing_email_payments_agent
  ON portal.listing_email_payments(agent_id);
