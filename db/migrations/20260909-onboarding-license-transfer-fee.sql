ALTER TABLE portal.commerce_orders
  ADD COLUMN IF NOT EXISTS license_transfer_fee_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE portal.commerce_orders
  DROP CONSTRAINT IF EXISTS commerce_orders_license_transfer_fee_check;

ALTER TABLE portal.commerce_orders
  ADD CONSTRAINT commerce_orders_license_transfer_fee_check
  CHECK (
    license_transfer_fee_cents >= 0
    AND license_transfer_fee_cents <= amount_cents
  );
