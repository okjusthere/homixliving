import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !url.pathname.endsWith("_feature")
  )
    throw new Error("Use an isolated local *_feature database");
  Object.assign(process.env, {
    AZURE_IMAGE_ENDPOINT: "https://test.services.ai.azure.com/openai/v1",
    AZURE_IMAGE_API_KEY: "test-only",
    R2_ACCOUNT_ID: "test-only",
    R2_CONTENT_BUCKET_NAME: "test-only",
    R2_CONTENT_ACCESS_KEY_ID: "test-only",
    R2_CONTENT_SECRET_ACCESS_KEY: "test-only",
    AGENTS_REVALIDATE_SECRET: "test-only",
  });
  const { pgPool, closeDatabaseConnections } = await import("../src/db");
  const { submitGeneration } = await import("../src/lib/content/generations");
  const { claimGenerationDispatch } =
    await import("../src/lib/content/dispatch-claim");
  const { initialTemplates } = await import("../src/lib/content/catalog");
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/api\/agent-profile\?/);
    return Response.json({
      linked: true,
      profile: { name: "Test Agent", title: "Agent" },
    });
  };
  const owner = 1000000 + Math.floor(Math.random() * 1000000);
  try {
    await pgPool.query(
      "CREATE SCHEMA IF NOT EXISTS portal; CREATE TABLE IF NOT EXISTS portal.agents(id integer PRIMARY KEY)",
    );
    await pgPool.query(
      await readFile("db/migrations/20260910-content-center.sql", "utf8"),
    );
    const migration = await readFile(
      "db/migrations/20260911-content-language-pairs.sql",
      "utf8",
    );
    await pgPool.query(migration);
    await pgPool.query(migration);
    await pgPool.query(
      "ALTER TABLE portal.agents ADD COLUMN IF NOT EXISTS name text, ADD COLUMN IF NOT EXISTS email text, ADD COLUMN IF NOT EXISTS phone text, ADD COLUMN IF NOT EXISTS license_number text, ADD COLUMN IF NOT EXISTS licensed_company_id text, ADD COLUMN IF NOT EXISTS account_status text",
    );
    await pgPool.query(
      "CREATE TABLE IF NOT EXISTS portal.licensed_companies(id text PRIMARY KEY,legal_name text,is_active boolean); CREATE TABLE IF NOT EXISTS portal.settings(key text PRIMARY KEY,value text)",
    );
    await pgPool.query(
      "INSERT INTO portal.licensed_companies VALUES('test-company','Test Brokerage',true) ON CONFLICT DO NOTHING",
    );
    for (const id of [owner, owner + 1])
      await pgPool.query(
        "INSERT INTO portal.agents(id,name,email,licensed_company_id,account_status) VALUES($1,'Test Agent','test@example.com','test-company','active')",
        [id],
      );
    await pgPool.query(
      "INSERT INTO portal.settings VALUES('content_daily_limit','10') ON CONFLICT(key) DO UPDATE SET value='10'",
    );
    const templateId = randomUUID();
    const config = initialTemplates().find(
      (t) => t.key === "holiday-paper",
    )!.config;
    await pgPool.query(
      "INSERT INTO portal.content_templates(id,family_id,version,status,config) VALUES($1,$2,1,'published',$3)",
      [templateId, randomUUID(), JSON.stringify(config)],
    );
    await pgPool.query(
      'INSERT INTO portal.content_holidays(id,country,name,greeting) VALUES(\'pair-test\',\'US\',\'{"en":"Holiday","zh":"节日"}\',\'{"en":"Hello","zh":"你好"}\') ON CONFLICT DO NOTHING',
    );
    const body = {
      templateId,
      idempotencyKey: randomUUID(),
      languages: ["zh", "en"],
      input: {
        kind: "holiday",
        theme: "pair-test",
        language: "en",
        size: "1024x1280",
        includePortrait: false,
        headline: "",
        message: "Hello",
        additionalInstructions: "",
        // Hidden fields left over after switching from a listing to a holiday.
        listing: { source: "manual", address: "", imageAssetIds: [] },
        event: { date: "", start: "", end: "", timezone: "America/New_York" },
      },
    };
    const [first, retry] = await Promise.all([
      submitGeneration(owner, true, body),
      submitGeneration(owner, true, body),
    ]);
    assert.equal(first, retry);
    const pair = (
      await pgPool.query(
        "SELECT id,input,prompt,predecessor_id FROM portal.content_generations WHERE batch_id=$1 ORDER BY predecessor_id NULLS FIRST",
        [first],
      )
    ).rows;
    assert.equal(pair.length, 2);
    assert.equal(pair[0].input.listing, undefined);
    assert.equal(pair[0].input.event, undefined);
    assert.equal(pair[0].input.language, "zh");
    assert.equal(pair[1].input.language, "en");
    assert.equal(pair[1].predecessor_id, first);
    assert.match(pair[0].prompt, /Simplified Chinese ONLY/);
    assert.match(pair[1].prompt, /English ONLY/);
    assert.equal(await claimGenerationDispatch(pair[1].id), false);
    assert.equal(await claimGenerationDispatch(first), true);
    const queued = await submitGeneration(owner, true, {
      ...body,
      idempotencyKey: randomUUID(),
    });
    const next = (
      await pgPool.query(
        "SELECT predecessor_id FROM portal.content_generations WHERE id=$1",
        [queued],
      )
    ).rows[0];
    assert.equal(next.predecessor_id, pair[1].id);
    assert.equal(await claimGenerationDispatch(queued), false);
    await pgPool.query(
      "UPDATE portal.content_generations SET status='needs_review' WHERE id=$1",
      [first],
    );
    const claims = await Promise.all([
      claimGenerationDispatch(pair[1].id),
      claimGenerationDispatch(pair[1].id),
    ]);
    assert.equal(claims.filter(Boolean).length, 1);
    await pgPool.query(
      "UPDATE portal.content_generations SET status='succeeded' WHERE id=$1",
      [pair[1].id],
    );
    assert.equal(await claimGenerationDispatch(queued), true);
    await pgPool.query(
      "UPDATE portal.settings SET value='3' WHERE key='content_daily_limit'",
    );
    await assert.rejects(
      submitGeneration(owner, true, { ...body, idempotencyKey: randomUUID() }),
      /Not enough daily/,
    );
    assert.equal(
      Number(
        (
          await pgPool.query(
            "SELECT count(*) FROM portal.content_generations WHERE owner_agent_id=$1",
            [owner],
          )
        ).rows[0].count,
      ),
      4,
    );
    await pgPool.query(
      "UPDATE portal.settings SET value='10' WHERE key='content_daily_limit'",
    );
    const competing = await Promise.allSettled([
      submitGeneration(owner + 1, true, {
        ...body,
        idempotencyKey: randomUUID(),
      }),
      submitGeneration(owner + 1, true, {
        ...body,
        idempotencyKey: randomUUID(),
      }),
    ]);
    assert.equal(
      competing.filter((result) => result.status === "fulfilled").length,
      2,
    );
    assert.equal(
      Number(
        (
          await pgPool.query(
            "SELECT count(*) FROM portal.content_generations WHERE owner_agent_id=$1",
            [owner + 1],
          )
        ).rows[0].count,
      ),
      4,
    );
    const queue = (
      await pgPool.query(
        "SELECT id,predecessor_id FROM portal.content_generations WHERE owner_agent_id=$1",
        [owner + 1],
      )
    ).rows;
    assert.equal(queue.filter((r) => !r.predecessor_id).length, 1);
    assert.equal(
      new Set(
        queue.filter((r) => r.predecessor_id).map((r) => r.predecessor_id),
      ).size,
      3,
    );
    console.log(
      "Language pairs verified: two atomic outputs, exact idempotency, full-pair quota reservation, concurrent submissions queued in one chain, sequential provider dispatch, independent failure recovery.",
    );
  } finally {
    globalThis.fetch = oldFetch;
    await closeDatabaseConnections();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
