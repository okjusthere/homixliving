import type { Sql } from "postgres";

export type AgentLifecycleSchemaState = {
  portal: {
    accountStatus: boolean;
    isActive: boolean;
    approvalStatus: boolean;
  };
  public: {
    exists: boolean;
    visibilityStatus: boolean;
    visible: boolean;
    editToken: boolean;
    portalAgentId: boolean;
  };
};

export async function getAgentLifecycleSchemaState(
  sql: Sql,
): Promise<AgentLifecycleSchemaState> {
  const [row] = await sql.unsafe(`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'portal' AND table_name = 'agents'
          AND column_name = 'account_status'
      ) AS portal_account_status,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'portal' AND table_name = 'agents'
          AND column_name = 'is_active'
      ) AS portal_is_active,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'portal' AND table_name = 'agents'
          AND column_name = 'approval_status'
      ) AS portal_approval_status,
      to_regclass('public.agents') IS NOT NULL AS public_exists,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'agents'
          AND column_name = 'visibility_status'
      ) AS public_visibility_status,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'agents'
          AND column_name = 'visible'
      ) AS public_visible,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'agents'
          AND column_name = 'edit_token'
      ) AS public_edit_token,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'agents'
          AND column_name = 'portal_agent_id'
      ) AS public_portal_agent_id
  `);

  return {
    portal: {
      accountStatus: Boolean(row.portal_account_status),
      isActive: Boolean(row.portal_is_active),
      approvalStatus: Boolean(row.portal_approval_status),
    },
    public: {
      exists: Boolean(row.public_exists),
      visibilityStatus: Boolean(row.public_visibility_status),
      visible: Boolean(row.public_visible),
      editToken: Boolean(row.public_edit_token),
      portalAgentId: Boolean(row.public_portal_agent_id),
    },
  };
}

/**
 * Backward-compatible lifecycle expansion. This is safe to run repeatedly and
 * is also called at boot before either application starts using the new
 * columns. It intentionally leaves the legacy columns in place.
 */
export async function ensureAgentLifecycleExpand(sql: Sql): Promise<void> {
  await sql.unsafe(`
    ALTER TABLE portal.agents
      ADD COLUMN IF NOT EXISTS account_status TEXT
  `);
  await sql.unsafe(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'portal' AND table_name = 'agents'
          AND column_name = 'is_active'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'portal' AND table_name = 'agents'
          AND column_name = 'approval_status'
      ) THEN
        UPDATE portal.agents
        SET account_status = CASE
          WHEN is_active THEN 'active'
          WHEN COALESCE(approval_status, '') = 'pending' THEN 'pending'
          ELSE 'inactive'
        END
        WHERE account_status IS NULL
           OR account_status NOT IN ('pending', 'active', 'inactive');
      ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'portal' AND table_name = 'agents'
          AND column_name = 'is_active'
      ) THEN
        UPDATE portal.agents
        SET account_status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END
        WHERE account_status IS NULL
           OR account_status NOT IN ('pending', 'active', 'inactive');
      END IF;
    END $$
  `);
  await sql.unsafe(`
    UPDATE portal.agents
    SET account_status = 'pending'
    WHERE account_status IS NULL
       OR account_status NOT IN ('pending', 'active', 'inactive')
  `);
  await sql.unsafe(`
    ALTER TABLE portal.agents
      ALTER COLUMN account_status SET DEFAULT 'pending',
      ALTER COLUMN account_status SET NOT NULL
  `);
  await sql.unsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'agents_account_status_check'
          AND conrelid = 'portal.agents'::regclass
      ) THEN
        ALTER TABLE portal.agents
          ADD CONSTRAINT agents_account_status_check
          CHECK (account_status IN ('pending', 'active', 'inactive'));
      END IF;
    END $$
  `);

  // public.agents is created by homixweb. Local/CI portal-only databases may
  // not have it, so the public projection expansion is conditional.
  await sql.unsafe(`
    DO $$ BEGIN
      IF to_regclass('public.agents') IS NOT NULL THEN
        ALTER TABLE public.agents
          ADD COLUMN IF NOT EXISTS visibility_status TEXT;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'agents'
            AND column_name = 'visible'
        ) THEN
          UPDATE public.agents
          SET visibility_status = CASE
            WHEN visible THEN 'visible'
            ELSE 'admin_hidden'
          END
          WHERE visibility_status IS NULL
             OR visibility_status NOT IN ('visible', 'agent_hidden', 'admin_hidden');
        ELSE
          UPDATE public.agents
          SET visibility_status = 'visible'
          WHERE visibility_status IS NULL
             OR visibility_status NOT IN ('visible', 'agent_hidden', 'admin_hidden');
        END IF;

        ALTER TABLE public.agents
          ALTER COLUMN visibility_status SET DEFAULT 'visible',
          ALTER COLUMN visibility_status SET NOT NULL;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'agents'
            AND column_name = 'edit_token'
        ) THEN
          ALTER TABLE public.agents
            ALTER COLUMN edit_token DROP NOT NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'agents_visibility_status_check'
            AND conrelid = 'public.agents'::regclass
        ) THEN
          ALTER TABLE public.agents
            ADD CONSTRAINT agents_visibility_status_check
            CHECK (visibility_status IN ('visible', 'agent_hidden', 'admin_hidden'));
        END IF;

        ALTER TABLE public.agents
          ADD COLUMN IF NOT EXISTS portal_agent_id INTEGER;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_public_agents_portal_link
          ON public.agents(portal_agent_id)
          WHERE portal_agent_id IS NOT NULL;

        DROP POLICY IF EXISTS "agents public read" ON public.agents;
        CREATE POLICY "agents public read"
          ON public.agents FOR SELECT
          USING (visibility_status = 'visible');
      END IF;
    END $$
  `);
}

/**
 * Remove columns used by the retired application versions. Call only after
 * both production deployments have been verified on the expanded schema.
 */
export async function contractAgentLifecycle(sql: Sql): Promise<void> {
  const state = await getAgentLifecycleSchemaState(sql);
  if (!state.portal.accountStatus) {
    throw new Error("Refusing contract: portal.agents.account_status is missing.");
  }
  if (state.public.exists && !state.public.visibilityStatus) {
    throw new Error("Refusing contract: public.agents.visibility_status is missing.");
  }

  await sql.unsafe(`
    ALTER TABLE portal.agents
      DROP COLUMN IF EXISTS is_active,
      DROP COLUMN IF EXISTS approval_status
  `);
  await sql.unsafe(`
    DO $$ BEGIN
      IF to_regclass('public.agents') IS NOT NULL THEN
        ALTER TABLE public.agents
          DROP COLUMN IF EXISTS visible,
          DROP COLUMN IF EXISTS edit_token;
      END IF;
    END $$
  `);
}

// Idempotent Postgres schema for the portal. Runs at boot via
// instrumentation.ts (and on demand via /api/admin/ensure-schema). All
// portal tables live in the "portal" schema. public.* belongs to the marketing
// site; only the one-time lifecycle expand/contract helpers above touch its
// advisor projection.
//
// The lifecycle migration keeps a temporary compatibility backfill while old
// columns still exist. Future column additions follow the ADD COLUMN IF NOT
// EXISTS pattern, paired with a marker bump in src/instrumentation.ts.
export async function ensureSchema(sql: Sql) {
  const run = (ddl: string) => sql.unsafe(ddl);

  await run(`CREATE SCHEMA IF NOT EXISTS portal`);

  console.log("Ensuring portal tables...");

  await run(`
    CREATE TABLE IF NOT EXISTS portal.buildings (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      region TEXT NOT NULL,
      name TEXT NOT NULL,
      management_company TEXT,
      submission_type TEXT NOT NULL DEFAULT 'email',
      submission_notes TEXT,
      invoice_number_format TEXT,
      bill_to_company TEXT,
      bill_to_address TEXT,
      contact_email TEXT,
      special_notes TEXT,
      is_out_of_state BOOLEAN DEFAULT FALSE,
      created_at TEXT,
      updated_at TEXT
    )`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.teams (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      name TEXT NOT NULL,
      leader_agent_id INTEGER,
      notes TEXT
    )`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.agents (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      license_number TEXT,
      license_expires_at TEXT,
      licensed_company TEXT,
      split_pct DOUBLE PRECISION NOT NULL DEFAULT 80,
      team_id INTEGER REFERENCES portal.teams(id) ON DELETE SET NULL,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      account_status TEXT NOT NULL DEFAULT 'pending',
      joined_at TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    )`);

  // Expand from the former account/visibility columns. Legacy columns remain
  // until the explicit contract step after both deployments are verified.
  await ensureAgentLifecycleExpand(sql);

  // teams.leader_agent_id → agents.id (added after both tables exist to break
  // the circular reference)
  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'teams_leader_agent_fk'
      ) THEN
        ALTER TABLE portal.teams
          ADD CONSTRAINT teams_leader_agent_fk
          FOREIGN KEY (leader_agent_id) REFERENCES portal.agents(id);
      END IF;
    END $$`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.rental_deals (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      building_id INTEGER NOT NULL REFERENCES portal.buildings(id),
      unit TEXT NOT NULL,
      tenant_name TEXT NOT NULL,
      tenant_email TEXT,
      tenant_phone TEXT,
      apartment_address TEXT,
      move_in_date TEXT,
      lease_start_date TEXT,
      lease_end_date TEXT,
      rent_amount DOUBLE PRECISION,
      lease_length_months INTEGER,
      total_commission DOUBLE PRECISION NOT NULL,
      licensed_company TEXT NOT NULL,
      referrer_name TEXT,
      referrer_type TEXT,
      referrer_amount DOUBLE PRECISION,
      referrer_payment_info TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      deal_date TEXT,
      source TEXT,
      notes TEXT,
      renewal_status TEXT,
      renewal_noted_at TEXT,
      renewed_to_rental_deal_id INTEGER REFERENCES portal.rental_deals(id) ON DELETE SET NULL,
      created_by_email TEXT,
      created_at TEXT,
      updated_at TEXT
    )`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.rental_deal_agents (
      rental_deal_id INTEGER NOT NULL REFERENCES portal.rental_deals(id) ON DELETE CASCADE,
      agent_id INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
      share_pct DOUBLE PRECISION NOT NULL,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT,
      PRIMARY KEY (rental_deal_id, agent_id)
    )`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_rental_deal_agents_agent
      ON portal.rental_deal_agents(agent_id)`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.sale_deals (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      representation_type TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'pre_contract',
      status TEXT NOT NULL DEFAULT 'active',
      property_address TEXT NOT NULL,
      city TEXT,
      state TEXT,
      zip TEXT,
      property_type TEXT,
      mls_number TEXT,
      file_id TEXT,
      buyer_names TEXT,
      seller_names TEXT,
      contract_date TEXT,
      closing_date TEXT,
      purchase_price DOUBLE PRECISION,
      gross_commission DOUBLE PRECISION NOT NULL DEFAULT 0,
      referral_amount DOUBLE PRECISION,
      brokerage_fee DOUBLE PRECISION,
      listing_agent_name TEXT,
      listing_agent_email TEXT,
      listing_brokerage TEXT,
      cooperating_agent_name TEXT,
      cooperating_agent_email TEXT,
      cooperating_brokerage TEXT,
      buyer_attorney TEXT,
      seller_attorney TEXT,
      title_company TEXT,
      lender_name TEXT,
      escrow_holder TEXT,
      source TEXT,
      notes TEXT,
      created_by_email TEXT,
      created_at TEXT,
      updated_at TEXT
    )`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.sale_deal_agents (
      sale_deal_id INTEGER NOT NULL REFERENCES portal.sale_deals(id) ON DELETE CASCADE,
      agent_id INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
      share_pct DOUBLE PRECISION NOT NULL,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT,
      PRIMARY KEY (sale_deal_id, agent_id)
    )`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_sale_deal_agents_agent
      ON portal.sale_deal_agents(agent_id)`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.invoices (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      building_id INTEGER REFERENCES portal.buildings(id),
      rental_deal_id INTEGER REFERENCES portal.rental_deals(id) ON DELETE SET NULL,
      invoice_number TEXT NOT NULL,
      file_name TEXT NOT NULL,
      email_subject TEXT,
      unit TEXT NOT NULL,
      tenant_name TEXT NOT NULL,
      agent_email TEXT,
      agent_name TEXT,
      agent_phone TEXT,
      apartment_address TEXT,
      move_in_date TEXT,
      licensed_company TEXT NOT NULL,
      year INTEGER NOT NULL DEFAULT 2026,
      line_items JSONB,
      total_amount DOUBLE PRECISION NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      sent_at TEXT,
      paid_at TEXT,
      paid_amount DOUBLE PRECISION,
      pdf_data TEXT,
      created_at TEXT,
      updated_at TEXT
    )`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.invoice_send_log (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      invoice_id INTEGER NOT NULL REFERENCES portal.invoices(id) ON DELETE CASCADE,
      sent_by_email TEXT,
      to_recipients TEXT NOT NULL,
      cc_recipients TEXT,
      reply_to TEXT,
      subject TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      sent_at TEXT
    )`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_invoice_send_log_invoice
      ON portal.invoice_send_log(invoice_id)`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.commerce_orders (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      product_key TEXT NOT NULL,
      product_name TEXT NOT NULL,
      billing_mode TEXT NOT NULL,
      stripe_price_id TEXT,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      status TEXT NOT NULL DEFAULT 'pending',
      stripe_checkout_session_id TEXT UNIQUE,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      stripe_payment_intent_id TEXT,
      checkout_url TEXT,
      customer_name TEXT,
      customer_email TEXT,
      requested_workspace_email TEXT,
      phone TEXT,
      referral_has_agent TEXT,
      referral_agent_name TEXT,
      message TEXT,
      workspace_status TEXT NOT NULL DEFAULT 'not_required',
      workspace_user_id TEXT,
      workspace_error TEXT,
      paid_at TEXT,
      created_at TEXT,
      updated_at TEXT
    )`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_commerce_orders_subscription
      ON portal.commerce_orders(stripe_subscription_id)`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_commerce_orders_customer_email
      ON portal.commerce_orders(customer_email)`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.stripe_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      commerce_order_id INTEGER REFERENCES portal.commerce_orders(id) ON DELETE SET NULL,
      received_at TEXT
    )`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.commerce_charges (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      commerce_order_id INTEGER REFERENCES portal.commerce_orders(id) ON DELETE SET NULL,
      stripe_invoice_id TEXT NOT NULL UNIQUE,
      stripe_subscription_id TEXT,
      stripe_customer_id TEXT,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'usd',
      status TEXT NOT NULL,
      product_name TEXT,
      customer_email TEXT,
      customer_name TEXT,
      period_start TEXT,
      period_end TEXT,
      paid_at TEXT,
      created_at TEXT
    )`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_commerce_charges_paid_at
      ON portal.commerce_charges(paid_at)`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_commerce_charges_subscription
      ON portal.commerce_charges(stripe_subscription_id)`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.training_videos (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'General',
      cloudflare_uid TEXT NOT NULL,
      duration_label TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100,
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TEXT,
      updated_at TEXT
    )`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.training_video_views (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      video_id INTEGER NOT NULL REFERENCES portal.training_videos(id) ON DELETE CASCADE,
      agent_id INTEGER REFERENCES portal.agents(id) ON DELETE SET NULL,
      agent_email TEXT NOT NULL,
      first_viewed_at TEXT NOT NULL,
      last_viewed_at TEXT NOT NULL,
      open_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    )`);
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_training_video_views_unique_viewer
      ON portal.training_video_views(video_id, agent_email)`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_training_video_views_agent
      ON portal.training_video_views(agent_email)`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.resources (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'General',
      url TEXT NOT NULL,
      sample_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100,
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TEXT,
      updated_at TEXT
    )`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.checklist_items (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      group_key TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT,
      updated_at TEXT
    )`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_checklist_items_group
      ON portal.checklist_items(group_key)`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.notifications (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      recipient_agent_id INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      href TEXT,
      dedupe_key TEXT UNIQUE,
      read_at TEXT,
      created_at TEXT
    )`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient
      ON portal.notifications(recipient_agent_id, read_at)`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.audit_log (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      actor_email TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      summary TEXT NOT NULL,
      detail TEXT,
      created_at TEXT
    )`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_entity
      ON portal.audit_log(entity_type, entity_id)`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.deal_documents (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      deal_type TEXT NOT NULL,
      deal_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      storage_provider TEXT NOT NULL DEFAULT 'r2',
      object_key TEXT NOT NULL DEFAULT '',
      content_type TEXT,
      size INTEGER,
      uploaded_by_email TEXT,
      checklist_item_id INTEGER,
      created_at TEXT
    )`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_deal_documents_deal
      ON portal.deal_documents(deal_type, deal_id)`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_deal_documents_object_key
      ON portal.deal_documents(object_key)`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.agent_payment_profiles (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      agent_id INTEGER NOT NULL UNIQUE REFERENCES portal.agents(id) ON DELETE CASCADE,
      payee_type TEXT,
      payee_name TEXT,
      bank_name TEXT,
      account_type TEXT,
      routing_number TEXT,
      account_number TEXT,
      w9_object_key TEXT,
      w9_file_name TEXT,
      w9_uploaded_at TEXT,
      updated_at TEXT
    )`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.agent_payouts (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      agent_id INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE CASCADE,
      amount_cents INTEGER NOT NULL,
      method TEXT NOT NULL DEFAULT 'ach',
      reference TEXT,
      memo TEXT,
      deal_type TEXT,
      deal_id INTEGER,
      paid_at TEXT NOT NULL,
      created_by_email TEXT,
      created_at TEXT,
      updated_at TEXT
    )`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_agent_payouts_agent_paid
      ON portal.agent_payouts(agent_id, paid_at DESC)`);

  // ---- Future column additions go here, mirroring the old pattern: ----
  // await run(`ALTER TABLE portal.xxx ADD COLUMN IF NOT EXISTS yyy TEXT`);

  console.log("Portal schema ensured.");
}
