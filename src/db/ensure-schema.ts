// Schema DDL + column migrations, extracted from seed.ts so it can run both
// from the CLI seed and from the /api/admin/ensure-schema endpoint (which runs
// in production where the Turso credentials live). Everything here is
// idempotent: CREATE TABLE/INDEX IF NOT EXISTS and add-column-if-missing.
import type { Client } from "@libsql/client";

export async function ensureSchema(client: Client) {
async function tableExists(name: string) {
  const result = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [name],
  });
  return result.rows.length > 0;
}

async function columnExists(table: string, column: string) {
  const result = await client.execute(`PRAGMA table_info(${table})`);
  return result.rows.some((row) => row.name === column);
}

async function renameTableIfNeeded(oldName: string, newName: string) {
  const [oldExists, newExists] = await Promise.all([
    tableExists(oldName),
    tableExists(newName),
  ]);
  if (oldExists && !newExists) {
    await client.execute(`ALTER TABLE ${oldName} RENAME TO ${newName}`);
    console.log(`Renamed ${oldName} to ${newName}.`);
  }
}

async function renameColumnIfNeeded(
  table: string,
  oldName: string,
  newName: string
) {
  if (!(await tableExists(table))) return;
  const [oldExists, newExists] = await Promise.all([
    columnExists(table, oldName),
    columnExists(table, newName),
  ]);
  if (oldExists && !newExists) {
    await client.execute(`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName}`);
    console.log(`Renamed ${table}.${oldName} to ${table}.${newName}.`);
  }
}


  console.log("Creating tables...");

  await client.execute(`
    CREATE TABLE IF NOT EXISTS buildings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      is_out_of_state INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      leader_agent_id INTEGER REFERENCES agents(id),
      notes TEXT
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      license_number TEXT,
      licensed_company TEXT,
      split_pct REAL NOT NULL DEFAULT 80,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 0,
      approval_status TEXT NOT NULL DEFAULT 'pending',
      joined_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await renameTableIfNeeded("deals", "rental_deals");
  await renameTableIfNeeded("deal_agents", "rental_deal_agents");
  await renameColumnIfNeeded(
    "rental_deals",
    "renewed_to_deal_id",
    "renewed_to_rental_deal_id"
  );
  await renameColumnIfNeeded(
    "rental_deal_agents",
    "deal_id",
    "rental_deal_id"
  );
  await renameColumnIfNeeded("invoices", "deal_id", "rental_deal_id");

  await client.execute(`
    CREATE TABLE IF NOT EXISTS rental_deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      building_id INTEGER NOT NULL REFERENCES buildings(id),
      unit TEXT NOT NULL,
      tenant_name TEXT NOT NULL,
      tenant_email TEXT,
      tenant_phone TEXT,
      apartment_address TEXT,
      move_in_date TEXT,
      lease_start_date TEXT,
      lease_end_date TEXT,
      rent_amount REAL,
      lease_length_months INTEGER,
      total_commission REAL NOT NULL,
      licensed_company TEXT NOT NULL,
      referrer_name TEXT,
      referrer_type TEXT,
      referrer_amount REAL,
      referrer_payment_info TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      deal_date TEXT,
      source TEXT,
      notes TEXT,
      renewal_status TEXT,
      renewal_noted_at TEXT,
      renewed_to_rental_deal_id INTEGER REFERENCES rental_deals(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS rental_deal_agents (
      rental_deal_id INTEGER NOT NULL REFERENCES rental_deals(id) ON DELETE CASCADE,
      agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
      share_pct REAL NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (rental_deal_id, agent_id)
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_rental_deal_agents_agent
      ON rental_deal_agents(agent_id)
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS sale_deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      purchase_price REAL,
      gross_commission REAL NOT NULL DEFAULT 0,
      referral_amount REAL,
      brokerage_fee REAL,
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS sale_deal_agents (
      sale_deal_id INTEGER NOT NULL REFERENCES sale_deals(id) ON DELETE CASCADE,
      agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
      share_pct REAL NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (sale_deal_id, agent_id)
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_sale_deal_agents_agent
      ON sale_deal_agents(agent_id)
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      building_id INTEGER REFERENCES buildings(id),
      rental_deal_id INTEGER REFERENCES rental_deals(id) ON DELETE SET NULL,
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
      line_items TEXT,
      total_amount REAL NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      sent_at TEXT,
      paid_at TEXT,
      paid_amount REAL,
      pdf_data TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS invoice_send_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      sent_by_email TEXT,
      to_recipients TEXT NOT NULL,
      cc_recipients TEXT,
      reply_to TEXT,
      subject TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      sent_at TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_invoice_send_log_invoice
      ON invoice_send_log(invoice_id)
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS commerce_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_commerce_orders_checkout_session
      ON commerce_orders(stripe_checkout_session_id)
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_commerce_orders_subscription
      ON commerce_orders(stripe_subscription_id)
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_commerce_orders_customer_email
      ON commerce_orders(customer_email)
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS stripe_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      commerce_order_id INTEGER REFERENCES commerce_orders(id) ON DELETE SET NULL,
      received_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Training video catalog (gated /training). Defined in schema.ts (trainingVideos)
  // but was previously absent here — a fresh db:seed produced a DB where /training
  // and /api/training crashed. Keep columns in sync with schema.ts.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS training_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'General',
      cloudflare_uid TEXT NOT NULL,
      duration_label TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS training_video_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL REFERENCES training_videos(id) ON DELETE CASCADE,
      agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
      agent_email TEXT NOT NULL,
      first_viewed_at TEXT NOT NULL,
      last_viewed_at TEXT NOT NULL,
      open_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(video_id, agent_email)
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_training_video_views_video
      ON training_video_views(video_id, last_viewed_at)
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_training_video_views_agent
      ON training_video_views(agent_email)
  `);

  // Agent resource library (gated /resources). Same story as training_videos.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'General',
      url TEXT NOT NULL,
      sample_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Per-invoice charge ledger (subscription renewals + first payments).
  await client.execute(`
    CREATE TABLE IF NOT EXISTS commerce_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commerce_order_id INTEGER REFERENCES commerce_orders(id) ON DELETE SET NULL,
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_commerce_charges_paid_at
      ON commerce_charges(paid_at DESC)
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_commerce_charges_subscription
      ON commerce_charges(stripe_subscription_id)
  `);

  // agents.email must be UNIQUE: the sign-in upsert uses
  // onConflictDoNothing(target: email), which ERRORS on SQLite without a
  // matching constraint. Production got it from the original drizzle push;
  // this covers fresh databases built purely through ensure-schema.
  await client.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_email_unique ON agents(email)
  `);

  // Required-documents checklists (做单必交文件) shown on /resources; group
  // keys/labels are defined in src/lib/checklist-groups.ts.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS checklist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_key TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_checklist_items_group
      ON checklist_items(group_key, sort_order)
  `);

  // In-app notifications (bell + email). Keep columns in sync with schema.ts.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      href TEXT,
      dedupe_key TEXT UNIQUE,
      read_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient
      ON notifications(recipient_agent_id, read_at)
  `);

  // Append-only audit log of who changed what.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_email TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      summary TEXT NOT NULL,
      detail TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_audit_log_entity
      ON audit_log(entity_type, entity_id)
  `);

  // Deal document index (files live in a private Cloudflare R2 bucket).
  await client.execute(`
    CREATE TABLE IF NOT EXISTS deal_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_type TEXT NOT NULL,
      deal_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      storage_provider TEXT NOT NULL DEFAULT 'r2',
      object_key TEXT NOT NULL DEFAULT '',
      content_type TEXT,
      size INTEGER,
      uploaded_by_email TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_deal_documents_deal
      ON deal_documents(deal_type, deal_id)
  `);

  // Helper to add a column if it doesn't exist
  const addColumnIfMissing = async (sql: string) => {
    try {
      await client.execute(sql);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("duplicate column")) {
        throw error;
      }
      return false;
    }
  };

  if (await addColumnIfMissing(`
    ALTER TABLE deal_documents
    ADD COLUMN storage_provider TEXT NOT NULL DEFAULT 'r2'
  `)) {
    console.log("Added deal_documents.storage_provider column.");
  }
  if (await addColumnIfMissing(`
    ALTER TABLE deal_documents
    ADD COLUMN object_key TEXT NOT NULL DEFAULT ''
  `)) {
    console.log("Added deal_documents.object_key column.");
  }
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_deal_documents_object_key
      ON deal_documents(object_key)
  `);

  if (await addColumnIfMissing(`
    ALTER TABLE invoices
    ADD COLUMN rental_deal_id INTEGER REFERENCES rental_deals(id) ON DELETE SET NULL
  `)) {
    console.log("Added invoices.rental_deal_id column.");
  }
  if (await addColumnIfMissing(`ALTER TABLE rental_deals ADD COLUMN created_by_email TEXT`)) {
    console.log("Added rental_deals.created_by_email column.");
  }
  if (await addColumnIfMissing(`ALTER TABLE sale_deals ADD COLUMN created_by_email TEXT`)) {
    console.log("Added sale_deals.created_by_email column.");
  }
  // Backfill 登单人 for deals created before the column existed, from the
  // audit log's create events. Idempotent: only fills NULLs; deals older
  // than the audit feature simply stay unattributed.
  await client.execute(`
    UPDATE rental_deals SET created_by_email = (
      SELECT actor_email FROM audit_log
      WHERE entity_type = 'rental_deal' AND action = 'create'
        AND entity_id = CAST(rental_deals.id AS TEXT)
      ORDER BY id ASC LIMIT 1
    ) WHERE created_by_email IS NULL
  `);
  await client.execute(`
    UPDATE sale_deals SET created_by_email = (
      SELECT actor_email FROM audit_log
      WHERE entity_type = 'sale_deal' AND action = 'create'
        AND entity_id = CAST(sale_deals.id AS TEXT)
      ORDER BY id ASC LIMIT 1
    ) WHERE created_by_email IS NULL
  `);
  if (await addColumnIfMissing(`ALTER TABLE resources ADD COLUMN sample_url TEXT`)) {
    console.log("Added resources.sample_url column.");
  }
  if (await addColumnIfMissing(`ALTER TABLE invoices ADD COLUMN paid_at TEXT`)) {
    console.log("Added invoices.paid_at column.");
  }
  if (await addColumnIfMissing(`ALTER TABLE invoices ADD COLUMN paid_amount REAL`)) {
    console.log("Added invoices.paid_amount column.");
  }
  if (await addColumnIfMissing(`ALTER TABLE rental_deals ADD COLUMN renewal_status TEXT`)) {
    console.log("Added rental_deals.renewal_status column.");
  }
  if (await addColumnIfMissing(`ALTER TABLE rental_deals ADD COLUMN renewal_noted_at TEXT`)) {
    console.log("Added rental_deals.renewal_noted_at column.");
  }
  if (await addColumnIfMissing(`ALTER TABLE rental_deals ADD COLUMN renewed_to_rental_deal_id INTEGER REFERENCES rental_deals(id) ON DELETE SET NULL`)) {
    console.log("Added rental_deals.renewed_to_rental_deal_id column.");
  }
  if (await addColumnIfMissing(`ALTER TABLE rental_deals ADD COLUMN source TEXT`)) {
    console.log("Added rental_deals.source column.");
  }
  if (await addColumnIfMissing(`ALTER TABLE agents ADD COLUMN is_admin INTEGER DEFAULT 0`)) {
    console.log("Added agents.is_admin column.");
  }
  if (await addColumnIfMissing(`ALTER TABLE agents ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending'`)) {
    console.log("Added agents.approval_status column.");
  }
  await client.execute(`
    UPDATE agents
    SET approval_status = 'approved'
    WHERE is_active = 1 AND approval_status = 'pending'
  `);
  if (await addColumnIfMissing(`ALTER TABLE rental_deals ADD COLUMN referrer_name TEXT`)) {
    console.log("Added rental_deals.referrer_name column.");
  }
  if (await addColumnIfMissing(`ALTER TABLE rental_deals ADD COLUMN referrer_payment_info TEXT`)) {
    console.log("Added rental_deals.referrer_payment_info column.");
  }

}
