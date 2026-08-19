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
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
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
      license_expires_at DATE,
      licensed_company TEXT,
      split_pct INTEGER NOT NULL DEFAULT 80,
      team_id INTEGER REFERENCES portal.teams(id) ON DELETE SET NULL,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      account_status TEXT NOT NULL DEFAULT 'pending',
      joined_at DATE,
      notes TEXT,
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
    )`);

  // Expand from the former account/visibility columns. Legacy columns remain
  // until the explicit contract step after both deployments are verified.
  await ensureAgentLifecycleExpand(sql);

  // Roster detail added for the admin agent list:
  //  - legal_name: the name on the licence / tax forms, which often differs
  //    from the display name Google supplies (e.g. "Zhengle Wei (Eric)").
  //  - referred_by_agent_id: which existing agent recruited this one. Set by an
  //    admin by hand — never inferred — and nulled rather than cascading if the
  //    referrer's row is ever removed, so a deletion can't erase roster history.
  await run(`
    ALTER TABLE portal.agents
      ADD COLUMN IF NOT EXISTS legal_name TEXT,
      ADD COLUMN IF NOT EXISTS referred_by_agent_id INTEGER`);

  // Login-email changes are staged until Google verifies the new address.
  await run(`
    ALTER TABLE portal.agents
      ADD COLUMN IF NOT EXISTS pending_email TEXT,
      ADD COLUMN IF NOT EXISTS email_change_requested_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS email_change_token_hash TEXT`);
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_agents_pending_email_lower
      ON portal.agents(lower(pending_email))
      WHERE pending_email IS NOT NULL`);

  // Commission plan + practice area. Plans mirror the desk-fee products in
  // lib/commerce/catalog.ts; practice is rental | sales | both.
  await run(`
    ALTER TABLE portal.agents
      ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'solo',
      ADD COLUMN IF NOT EXISTS practice TEXT`);
  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agents_referred_by_fk'
      ) THEN
        ALTER TABLE portal.agents
          ADD CONSTRAINT agents_referred_by_fk
          FOREIGN KEY (referred_by_agent_id) REFERENCES portal.agents(id)
          ON DELETE SET NULL;
      END IF;
    END $$`);

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
      move_in_date DATE,
      lease_start_date DATE,
      lease_end_date DATE,
      rent_amount NUMERIC(14,2),
      lease_length_months INTEGER,
      total_commission NUMERIC(14,2) NOT NULL,
      licensed_company TEXT NOT NULL,
      referrer_name TEXT,
      referrer_type TEXT,
      referrer_amount NUMERIC(14,2),
      referrer_payment_info TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      deal_date DATE,
      source TEXT,
      notes TEXT,
      renewal_status TEXT,
      renewal_noted_at TIMESTAMPTZ,
      renewed_to_rental_deal_id INTEGER REFERENCES portal.rental_deals(id) ON DELETE SET NULL,
      created_by_email TEXT,
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
    )`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.rental_deal_agents (
      rental_deal_id INTEGER NOT NULL REFERENCES portal.rental_deals(id) ON DELETE CASCADE,
      agent_id INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
      share_pct NUMERIC(6,3) NOT NULL,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ,
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
      contract_date DATE,
      closing_date DATE,
      purchase_price NUMERIC(14,2),
      gross_commission NUMERIC(14,2) NOT NULL DEFAULT 0,
      referral_amount NUMERIC(14,2),
      brokerage_fee NUMERIC(14,2),
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
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
    )`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.sale_deal_agents (
      sale_deal_id INTEGER NOT NULL REFERENCES portal.sale_deals(id) ON DELETE CASCADE,
      agent_id INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
      share_pct NUMERIC(6,3) NOT NULL,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ,
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
      move_in_date DATE,
      licensed_company TEXT NOT NULL,
      year INTEGER NOT NULL DEFAULT 2026,
      line_items JSONB,
      total_amount NUMERIC(14,2) NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      sent_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      paid_amount NUMERIC(14,2),
      pdf_data TEXT,
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
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
      sent_at TIMESTAMPTZ
    )`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_invoice_send_log_invoice
      ON portal.invoice_send_log(invoice_id)`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.commerce_orders (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      agent_id INTEGER REFERENCES portal.agents(id) ON DELETE SET NULL,
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
      payment_channel TEXT NOT NULL DEFAULT 'stripe',
      offline_method TEXT,
      offline_reference TEXT,
      verified_by_email TEXT,
      external_payment_key TEXT,
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
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
    )`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_commerce_orders_subscription
      ON portal.commerce_orders(stripe_subscription_id)`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_commerce_orders_customer_email
      ON portal.commerce_orders(customer_email)`);
  await run(`ALTER TABLE portal.commerce_orders ADD COLUMN IF NOT EXISTS agent_id INTEGER REFERENCES portal.agents(id) ON DELETE SET NULL`);
  await run(`ALTER TABLE portal.commerce_orders ADD COLUMN IF NOT EXISTS payment_channel TEXT NOT NULL DEFAULT 'stripe'`);
  await run(`ALTER TABLE portal.commerce_orders ADD COLUMN IF NOT EXISTS offline_method TEXT`);
  await run(`ALTER TABLE portal.commerce_orders ADD COLUMN IF NOT EXISTS offline_reference TEXT`);
  await run(`ALTER TABLE portal.commerce_orders ADD COLUMN IF NOT EXISTS verified_by_email TEXT`);
  await run(`ALTER TABLE portal.commerce_orders ADD COLUMN IF NOT EXISTS external_payment_key TEXT`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_orders_external_payment_key ON portal.commerce_orders(external_payment_key) WHERE external_payment_key IS NOT NULL`);
  await run(`ALTER TABLE portal.commerce_orders DROP CONSTRAINT IF EXISTS commerce_orders_payment_channel_check`);
  await run(`ALTER TABLE portal.commerce_orders ADD CONSTRAINT commerce_orders_payment_channel_check CHECK (payment_channel IN ('stripe','offline'))`);
  await run(`ALTER TABLE portal.commerce_orders DROP CONSTRAINT IF EXISTS commerce_orders_offline_evidence_check`);
  await run(`ALTER TABLE portal.commerce_orders ADD CONSTRAINT commerce_orders_offline_evidence_check CHECK (payment_channel <> 'offline' OR (offline_method IN ('cash','check','ach','zelle','wire','other') AND offline_reference IS NOT NULL AND verified_by_email IS NOT NULL AND external_payment_key IS NOT NULL AND paid_at IS NOT NULL))`);
  await run(`CREATE INDEX IF NOT EXISTS idx_commerce_orders_agent ON portal.commerce_orders(agent_id, created_at DESC)`);
  await run(`
    UPDATE portal.commerce_orders AS orders
    SET agent_id = agents.id
    FROM portal.agents AS agents
    WHERE orders.agent_id IS NULL
      AND orders.customer_email IS NOT NULL
      AND lower(orders.customer_email) = lower(agents.email)`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.stripe_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      commerce_order_id INTEGER REFERENCES portal.commerce_orders(id) ON DELETE SET NULL,
      received_at TIMESTAMPTZ
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
      period_start TIMESTAMPTZ,
      period_end TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ
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
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
    )`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.training_video_views (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      video_id INTEGER NOT NULL REFERENCES portal.training_videos(id) ON DELETE CASCADE,
      agent_id INTEGER REFERENCES portal.agents(id) ON DELETE SET NULL,
      agent_email TEXT NOT NULL,
      first_viewed_at TIMESTAMPTZ NOT NULL,
      last_viewed_at TIMESTAMPTZ NOT NULL,
      open_count INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
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
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
    )`);

  await run(`
    CREATE TABLE IF NOT EXISTS portal.checklist_items (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      group_key TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
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
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ
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
      created_at TIMESTAMPTZ
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
      created_at TIMESTAMPTZ
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
      w9_uploaded_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
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
      paid_at DATE NOT NULL,
      created_by_email TEXT,
      idempotency_key TEXT,
      created_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ
    )`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_agent_payouts_agent_paid
      ON portal.agent_payouts(agent_id, paid_at DESC)`);
  await run(`ALTER TABLE portal.agent_payouts ADD COLUMN IF NOT EXISTS idempotency_key TEXT`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_payouts_idempotency_key ON portal.agent_payouts(idempotency_key) WHERE idempotency_key IS NOT NULL`);

  await run(`
    CREATE TABLE IF NOT EXISTS public.share_links (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      code TEXT NOT NULL UNIQUE,
      agent_id INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE CASCADE,
      content_kind TEXT NOT NULL
        CHECK (content_kind IN ('listing', 'neighborhood', 'community', 'development', 'market', 'guide', 'news')),
      content_key TEXT NOT NULL,
      content_path TEXT NOT NULL,
      content_title TEXT NOT NULL,
      content_subtitle TEXT,
      content_image TEXT,
      locale TEXT NOT NULL DEFAULT 'zh'
        CHECK (locale IN ('en', 'zh')),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (agent_id, content_kind, content_key, locale)
    )`);
  await run(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.share_links'::regclass
          AND conname = 'share_links_content_kind_check'
          AND pg_get_constraintdef(oid) NOT LIKE '%market%'
      ) THEN
        ALTER TABLE public.share_links
          DROP CONSTRAINT share_links_content_kind_check;
        ALTER TABLE public.share_links
          ADD CONSTRAINT share_links_content_kind_check
          CHECK (content_kind IN ('listing', 'neighborhood', 'community', 'development', 'market', 'guide', 'news'));
      END IF;
    END $$`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_share_links_agent_created
      ON public.share_links(agent_id, created_at DESC)`);

  await run(`
    CREATE TABLE IF NOT EXISTS public.share_visits (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      share_link_id INTEGER NOT NULL
        REFERENCES public.share_links(id) ON DELETE CASCADE,
      session_key TEXT NOT NULL UNIQUE,
      visitor_hash TEXT NOT NULL,
      referrer_domain TEXT,
      device_type TEXT,
      active_seconds INTEGER NOT NULL DEFAULT 0
        CHECK (active_seconds >= 0),
      max_scroll_depth INTEGER NOT NULL DEFAULT 0
        CHECK (max_scroll_depth BETWEEN 0 AND 100),
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_share_visits_link_started
      ON public.share_visits(share_link_id, started_at DESC)`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_share_visits_link_visitor
      ON public.share_visits(share_link_id, visitor_hash)`);

  await run(`
    CREATE TABLE IF NOT EXISTS public.share_events (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      share_link_id INTEGER NOT NULL
        REFERENCES public.share_links(id) ON DELETE CASCADE,
      visit_id INTEGER REFERENCES public.share_visits(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL
        CHECK (event_type IN ('call', 'email', 'wechat', 'profile', 'inquiry')),
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_share_events_link_created
      ON public.share_events(share_link_id, created_at DESC)`);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_share_events_type_created
      ON public.share_events(event_type, created_at DESC)`);

  // These rows contain pseudonymous analytics and agent attribution. Keeping
  // RLS enabled with no anon/authenticated policies means only the website's
  // service role and the Portal's server DB role can access them.
  await run(`ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY`);
  await run(`ALTER TABLE public.share_visits ENABLE ROW LEVEL SECURITY`);
  await run(`ALTER TABLE public.share_events ENABLE ROW LEVEL SECURITY`);
  await run(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE
          ON public.share_links, public.share_visits, public.share_events
          TO service_role;
        GRANT USAGE, SELECT
          ON SEQUENCE public.share_links_id_seq,
                      public.share_visits_id_seq,
                      public.share_events_id_seq
          TO service_role;
      END IF;
    END $$`);

  await run(`
    DO $$ BEGIN
      IF to_regclass('public.inquiries') IS NOT NULL THEN
        ALTER TABLE public.inquiries
          ADD COLUMN IF NOT EXISTS share_link_id INTEGER
            REFERENCES public.share_links(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS referred_agent_id INTEGER
            REFERENCES portal.agents(id) ON DELETE SET NULL;
      END IF;
    END $$`);
  await run(`
    DO $$ BEGIN
      IF to_regclass('public.inquiries') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_inquiries_share_link
          ON public.inquiries(share_link_id)
          WHERE share_link_id IS NOT NULL;
      END IF;
    END $$`);

  // Compensation & growth system v3.1. Additive only: legacy plan/split
  // columns remain readable while new transactions use frozen snapshots.
  await run(`
    ALTER TABLE portal.agents
      ADD COLUMN IF NOT EXISTS plan_effective_from DATE,
      ADD COLUMN IF NOT EXISTS anniversary_start DATE,
      ADD COLUMN IF NOT EXISTS team_terms_config_id INTEGER,
      ADD COLUMN IF NOT EXISTS team_terms_effective_from DATE,
      ADD COLUMN IF NOT EXISTS team_terms_accepted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS affiliation_term_months INTEGER,
      ADD COLUMN IF NOT EXISTS affiliation_paid_at DATE,
      ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS onboarding_stage TEXT NOT NULL DEFAULT 'profile',
      ADD COLUMN IF NOT EXISTS onboarding_source TEXT NOT NULL DEFAULT 'direct',
      ADD COLUMN IF NOT EXISTS onboarding_invite_id INTEGER,
      ADD COLUMN IF NOT EXISTS agreement_status TEXT NOT NULL DEFAULT 'not_started',
      ADD COLUMN IF NOT EXISTS esign_transaction_id TEXT,
      ADD COLUMN IF NOT EXISTS esign_envelope_id TEXT,
      ADD COLUMN IF NOT EXISTS esign_template_version_id TEXT,
      ADD COLUMN IF NOT EXISTS esign_evidence_package_id TEXT,
      ADD COLUMN IF NOT EXISTS agreement_completed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'`);
  await run(`
    CREATE TABLE IF NOT EXISTS portal.onboarding_invitations (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      token_hash TEXT NOT NULL UNIQUE,
      email TEXT,
      kind TEXT NOT NULL DEFAULT 'admin',
      source TEXT NOT NULL DEFAULT 'direct',
      team_id INTEGER REFERENCES portal.teams(id) ON DELETE SET NULL,
      sponsor_agent_id INTEGER REFERENCES portal.agents(id) ON DELETE SET NULL,
      plan TEXT NOT NULL DEFAULT 'solo',
      affiliation_term_months INTEGER NOT NULL DEFAULT 12,
      lock_plan BOOLEAN NOT NULL DEFAULT TRUE,
      lock_team BOOLEAN NOT NULL DEFAULT TRUE,
      lock_sponsor BOOLEAN NOT NULL DEFAULT TRUE,
      lock_term BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMPTZ NOT NULL,
      max_uses INTEGER NOT NULL DEFAULT 1,
      use_count INTEGER NOT NULL DEFAULT 0,
      created_by_agent_id INTEGER REFERENCES portal.agents(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    )`);
  await run(`ALTER TABLE portal.onboarding_invitations
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'admin',
    ADD COLUMN IF NOT EXISTS lock_plan BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS lock_team BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS lock_sponsor BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS lock_term BOOLEAN NOT NULL DEFAULT TRUE`);
  await run(`CREATE INDEX IF NOT EXISTS idx_onboarding_invites_team ON portal.onboarding_invitations(team_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_onboarding_invites_expires ON portal.onboarding_invitations(expires_at)`);
  await run(`
    UPDATE portal.agents
    SET plan = CASE plan
      WHEN 'standard' THEN 'solo'
      WHEN 'growth' THEN 'legacy_growth'
      WHEN 'elite' THEN 'solo_pro'
      ELSE COALESCE(plan, 'solo')
    END`);
  await run(`
    UPDATE portal.agents
    SET anniversary_start = COALESCE(anniversary_start, joined_at, created_at::date),
        plan_effective_from = COALESCE(plan_effective_from, joined_at, created_at::date),
        split_pct = CASE plan
          WHEN 'solo' THEN 85
          WHEN 'solo_pro' THEN 100
          WHEN 'team_member' THEN 90
          WHEN 'team_leader' THEN 100
          WHEN 'legacy_growth' THEN 92
          ELSE split_pct
        END`);
  await run(`ALTER TABLE portal.agents ALTER COLUMN plan SET DEFAULT 'solo'`);
  await run(`
    UPDATE portal.agents AS agents
    SET payment_status = 'paid'
    WHERE EXISTS (
      SELECT 1 FROM portal.commerce_orders AS orders
      WHERE orders.agent_id = agents.id
        AND orders.product_key IN ('one_year_membership','two_year_membership','elite_desk_fee','growth_desk_fee')
        AND orders.status IN ('paid','active')
    )`);
  await run(`
    ALTER TABLE portal.rental_deals
      ADD COLUMN IF NOT EXISTS compensation_source TEXT NOT NULL DEFAULT 'self',
      ADD COLUMN IF NOT EXISTS client_rebate NUMERIC(14,2) NOT NULL DEFAULT 0`);
  await run(`
    ALTER TABLE portal.sale_deals
      ADD COLUMN IF NOT EXISTS compensation_source TEXT NOT NULL DEFAULT 'self',
      ADD COLUMN IF NOT EXISTS client_rebate NUMERIC(14,2) NOT NULL DEFAULT 0`);
  await run(`
    CREATE TABLE IF NOT EXISTS portal.team_compensation_configs (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      team_id INTEGER NOT NULL REFERENCES portal.teams(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      effective_from DATE NOT NULL,
      default_team_split_pct INTEGER NOT NULL DEFAULT 10 CHECK (default_team_split_pct IN (10,15,20)),
      team_lead_split_pct INTEGER NOT NULL DEFAULT 10 CHECK (team_lead_split_pct IN (10,15,20,25,30)),
      team_cap_cents INTEGER CHECK (team_cap_cents IS NULL OR team_cap_cents IN (1000000,1500000,2000000,2500000)),
      created_by_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_team_comp_config_version UNIQUE (team_id, version)
    )`);
  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'agents_team_terms_config_fk'
      ) THEN
        ALTER TABLE portal.agents
          ADD CONSTRAINT agents_team_terms_config_fk
          FOREIGN KEY (team_terms_config_id)
          REFERENCES portal.team_compensation_configs(id)
          ON DELETE SET NULL;
      END IF;
    END $$`);
  await run(`CREATE INDEX IF NOT EXISTS idx_agents_team_terms_config ON portal.agents(team_terms_config_id)`);
  await run(`
    ALTER TABLE portal.team_compensation_configs
      DROP CONSTRAINT IF EXISTS team_compensation_configs_default_team_split_pct_check,
      DROP CONSTRAINT IF EXISTS team_compensation_configs_team_lead_split_pct_check`);
  await run(`
    ALTER TABLE portal.team_compensation_configs
      ADD CONSTRAINT team_compensation_configs_default_team_split_pct_check
        CHECK (default_team_split_pct IN (10,15,20)),
      ADD CONSTRAINT team_compensation_configs_team_lead_split_pct_check
        CHECK (team_lead_split_pct IN (10,15,20,25,30))`);
  await run(`
    INSERT INTO portal.team_compensation_configs
      (team_id, version, effective_from, default_team_split_pct, team_lead_split_pct, team_cap_cents)
    SELECT id, 1, CURRENT_DATE, 10, 10, NULL FROM portal.teams
    ON CONFLICT (team_id, version) DO NOTHING`);
  await run(`
    UPDATE portal.agents AS agent
    SET team_terms_config_id = (
          SELECT config.id
          FROM portal.team_compensation_configs AS config
          WHERE config.team_id = agent.team_id
            AND config.effective_from <= CURRENT_DATE
          ORDER BY config.effective_from DESC, config.version DESC
          LIMIT 1
        ),
        team_terms_effective_from = CURRENT_DATE,
        team_terms_accepted_at = NOW()
    WHERE agent.plan = 'team_member'
      AND agent.team_id IS NOT NULL
      AND agent.team_terms_config_id IS NULL`);
  await run(`
    CREATE TABLE IF NOT EXISTS portal.deal_compensation_snapshots (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      deal_type TEXT NOT NULL CHECK (deal_type IN ('rental','sale')),
      deal_id INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'estimated' CHECK (status IN ('estimated','finalized','void')),
      effective_date DATE NOT NULL,
      gross_commission NUMERIC(14,2) NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'self',
      source_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
      outside_referral NUMERIC(14,2) NOT NULL DEFAULT 0,
      commission_base NUMERIC(14,2) NOT NULL,
      company_dollar NUMERIC(14,2) NOT NULL DEFAULT 0,
      team_allocation NUMERIC(14,2) NOT NULL DEFAULT 0,
      transaction_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
      rebate_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      sponsor_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      agent_net_total NUMERIC(14,2) NOT NULL DEFAULT 0,
      homix_retained NUMERIC(14,2) NOT NULL DEFAULT 0,
      policy_version TEXT NOT NULL DEFAULT '3.1',
      configuration JSONB,
      finalized_at TIMESTAMPTZ,
      finalized_by_email TEXT,
      superseded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_deal_comp_snapshot_version UNIQUE (deal_type, deal_id, version)
    )`);
  await run(`
    CREATE TABLE IF NOT EXISTS portal.deal_compensation_allocations (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      snapshot_id INTEGER NOT NULL REFERENCES portal.deal_compensation_snapshots(id) ON DELETE CASCADE,
      agent_id INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
      share_pct NUMERIC(6,3) NOT NULL,
      plan TEXT NOT NULL,
      team_id INTEGER REFERENCES portal.teams(id) ON DELETE SET NULL,
      team_config_id INTEGER REFERENCES portal.team_compensation_configs(id) ON DELETE SET NULL,
      team_leader_agent_id INTEGER REFERENCES portal.agents(id) ON DELETE SET NULL,
      sponsor_agent_id INTEGER REFERENCES portal.agents(id) ON DELETE SET NULL,
      gross_share NUMERIC(14,2) NOT NULL,
      company_dollar NUMERIC(14,2) NOT NULL DEFAULT 0,
      company_cap_credit NUMERIC(14,2) NOT NULL DEFAULT 0,
      team_leader_allocation NUMERIC(14,2) NOT NULL DEFAULT 0,
      team_cap_credit NUMERIC(14,2) NOT NULL DEFAULT 0,
      transaction_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
      rebate_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      sponsor_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      agent_net NUMERIC(14,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_deal_comp_allocation_agent UNIQUE (snapshot_id, agent_id)
    )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_team_comp_config_effective ON portal.team_compensation_configs(team_id, effective_from DESC)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_deal_comp_snapshot_current ON portal.deal_compensation_snapshots(deal_type, deal_id) WHERE superseded_at IS NULL`);
  await run(`CREATE INDEX IF NOT EXISTS idx_deal_comp_allocation_agent ON portal.deal_compensation_allocations(agent_id, snapshot_id)`);
  await run(`
    CREATE TABLE IF NOT EXISTS portal.compensation_obligations (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      snapshot_id INTEGER NOT NULL REFERENCES portal.deal_compensation_snapshots(id) ON DELETE CASCADE,
      allocation_id INTEGER NOT NULL REFERENCES portal.deal_compensation_allocations(id) ON DELETE CASCADE,
      recipient_agent_id INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
      source_agent_id INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
      kind TEXT NOT NULL CHECK (kind IN ('agent_net','team_split','sponsor_reward')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
      paid_cents INTEGER NOT NULL DEFAULT 0 CHECK (paid_cents >= 0 AND paid_cents <= amount_cents),
      status TEXT NOT NULL DEFAULT 'pending_receipt',
      available_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_comp_obligation_source UNIQUE (allocation_id, kind, recipient_agent_id)
    )`);
  await run(`
    ALTER TABLE portal.compensation_obligations
      DROP CONSTRAINT IF EXISTS compensation_obligations_status_check,
      ADD CONSTRAINT compensation_obligations_status_check
        CHECK (status IN ('pending_receipt','payable','partially_paid','paid','void'))`);
  await run(`CREATE INDEX IF NOT EXISTS idx_comp_obligation_recipient_status ON portal.compensation_obligations(recipient_agent_id, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_comp_obligation_snapshot ON portal.compensation_obligations(snapshot_id)`);
  await run(`
    CREATE TABLE IF NOT EXISTS portal.compensation_receipts (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      snapshot_id INTEGER NOT NULL UNIQUE REFERENCES portal.deal_compensation_snapshots(id) ON DELETE RESTRICT,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      received_at TIMESTAMPTZ NOT NULL,
      method TEXT NOT NULL DEFAULT 'other',
      reference TEXT,
      created_by_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await run(`
    INSERT INTO portal.compensation_receipts
      (snapshot_id, amount_cents, received_at, method, reference, created_by_email)
    SELECT snapshots.id,
           round(coalesce(invoices.paid_amount, invoices.total_amount) * 100)::INTEGER,
           invoices.paid_at, 'rental_invoice', invoices.invoice_number, 'schema-ensure'
    FROM portal.deal_compensation_snapshots AS snapshots
    JOIN portal.invoices AS invoices
      ON snapshots.deal_type = 'rental' AND snapshots.deal_id = invoices.rental_deal_id
    WHERE snapshots.status = 'finalized'
      AND snapshots.superseded_at IS NULL
      AND invoices.status = 'paid'
      AND invoices.paid_at IS NOT NULL
      AND coalesce(invoices.paid_amount, invoices.total_amount) > 0
    ON CONFLICT (snapshot_id) DO NOTHING`);
  await run(`
    INSERT INTO portal.compensation_obligations
      (snapshot_id, allocation_id, recipient_agent_id, source_agent_id, kind, amount_cents, status, available_at)
    SELECT allocations.snapshot_id, allocations.id, obligations.recipient_agent_id,
           allocations.agent_id, obligations.kind, obligations.amount_cents,
           CASE WHEN receipts.id IS NULL THEN 'pending_receipt' ELSE 'payable' END,
           receipts.received_at
    FROM portal.deal_compensation_allocations AS allocations
    JOIN portal.deal_compensation_snapshots AS snapshots ON snapshots.id = allocations.snapshot_id
    LEFT JOIN portal.compensation_receipts AS receipts ON receipts.snapshot_id = snapshots.id
    CROSS JOIN LATERAL (
      VALUES
        ('agent_net', allocations.agent_id, round(allocations.agent_net * 100)::INTEGER),
        ('team_split', allocations.team_leader_agent_id, round(allocations.team_leader_allocation * 100)::INTEGER),
        ('sponsor_reward', allocations.sponsor_agent_id, round(allocations.sponsor_amount * 100)::INTEGER)
    ) AS obligations(kind, recipient_agent_id, amount_cents)
    WHERE snapshots.status = 'finalized'
      AND snapshots.superseded_at IS NULL
      AND obligations.recipient_agent_id IS NOT NULL
      AND obligations.amount_cents > 0
    ON CONFLICT (allocation_id, kind, recipient_agent_id) DO NOTHING`);
  await run(`
    CREATE TABLE IF NOT EXISTS portal.payout_applications (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      payout_id INTEGER NOT NULL REFERENCES portal.agent_payouts(id) ON DELETE CASCADE,
      obligation_id INTEGER REFERENCES portal.compensation_obligations(id) ON DELETE RESTRICT,
      sponsor_plan_reward_id INTEGER,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_payout_application UNIQUE (payout_id, obligation_id)
    )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payout_application_obligation ON portal.payout_applications(obligation_id)`);
  await run(`
    CREATE TABLE IF NOT EXISTS portal.anonymous_suggestions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'zh',
      status TEXT NOT NULL DEFAULT 'new',
      admin_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await run(`
    ALTER TABLE portal.anonymous_suggestions
      DROP CONSTRAINT IF EXISTS anonymous_suggestions_status_check,
      ADD CONSTRAINT anonymous_suggestions_status_check
        CHECK (status IN ('new','reviewing','planned','closed'))`);
  await run(`
    CREATE TABLE IF NOT EXISTS portal.sponsor_plan_rewards (
      id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
      source_key TEXT NOT NULL UNIQUE,
      commerce_order_id INTEGER REFERENCES portal.commerce_orders(id) ON DELETE SET NULL,
      sponsor_agent_id INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
      referred_agent_id INTEGER NOT NULL REFERENCES portal.agents(id) ON DELETE RESTRICT,
      amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
      paid_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued','partially_paid','paid','void')),
      earned_at TIMESTAMPTZ NOT NULL,
      available_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_sponsor_plan_rewards_sponsor_earned ON portal.sponsor_plan_rewards(sponsor_agent_id, earned_at DESC)`);
  await run(`ALTER TABLE portal.sponsor_plan_rewards ADD COLUMN IF NOT EXISTS paid_cents INTEGER NOT NULL DEFAULT 0`);
  await run(`ALTER TABLE portal.sponsor_plan_rewards ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ`);
  await run(`UPDATE portal.sponsor_plan_rewards SET available_at = earned_at WHERE available_at IS NULL`);
  await run(`ALTER TABLE portal.sponsor_plan_rewards DROP CONSTRAINT IF EXISTS sponsor_plan_rewards_status_check`);
  await run(`ALTER TABLE portal.sponsor_plan_rewards ADD CONSTRAINT sponsor_plan_rewards_status_check CHECK (status IN ('accrued','partially_paid','paid','void'))`);
  await run(`ALTER TABLE portal.sponsor_plan_rewards DROP CONSTRAINT IF EXISTS sponsor_plan_rewards_paid_cents_check`);
  await run(`ALTER TABLE portal.sponsor_plan_rewards ADD CONSTRAINT sponsor_plan_rewards_paid_cents_check CHECK (paid_cents >= 0 AND paid_cents <= amount_cents)`);
  await run(`ALTER TABLE portal.payout_applications ALTER COLUMN obligation_id DROP NOT NULL`);
  await run(`ALTER TABLE portal.payout_applications ADD COLUMN IF NOT EXISTS sponsor_plan_reward_id INTEGER`);
  await run(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_applications_sponsor_plan_reward_fk') THEN ALTER TABLE portal.payout_applications ADD CONSTRAINT payout_applications_sponsor_plan_reward_fk FOREIGN KEY (sponsor_plan_reward_id) REFERENCES portal.sponsor_plan_rewards(id) ON DELETE RESTRICT; END IF; END $$`);
  await run(`ALTER TABLE portal.payout_applications DROP CONSTRAINT IF EXISTS payout_applications_exactly_one_target`);
  await run(`ALTER TABLE portal.payout_applications ADD CONSTRAINT payout_applications_exactly_one_target CHECK (num_nonnulls(obligation_id, sponsor_plan_reward_id) = 1)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_application_plan_reward ON portal.payout_applications(payout_id, sponsor_plan_reward_id) WHERE sponsor_plan_reward_id IS NOT NULL`);
  await run(`CREATE INDEX IF NOT EXISTS idx_payout_application_plan_reward ON portal.payout_applications(sponsor_plan_reward_id)`);

  // ---- Future column additions go here, mirroring the old pattern: ----
  // await run(`ALTER TABLE portal.xxx ADD COLUMN IF NOT EXISTS yyy TEXT`);

  console.log("Portal schema ensured.");
}
