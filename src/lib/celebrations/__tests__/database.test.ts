import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

// This suite owns a disposable database. It must never run on a real roster.
async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.pathname.endsWith("/homix_celebration_test"),
    "Use the dedicated local homix_celebration_test database",
  );
  const setup = new Pool({ connectionString: url.toString() });
  await setup.query(`DROP SCHEMA IF EXISTS portal CASCADE; CREATE SCHEMA portal;
  CREATE TABLE portal.licensed_companies(id text PRIMARY KEY,legal_name text,is_active boolean);
  CREATE TABLE portal.agents(id integer PRIMARY KEY,name text,email text,phone text,license_number text,licensed_company_id text,account_status text);
  CREATE TABLE portal.settings(key text PRIMARY KEY,value text);
  CREATE TABLE portal.audit_log(id serial PRIMARY KEY,actor_email text,action text,entity_type text,entity_id text,summary text,created_at timestamptz);
  INSERT INTO portal.licensed_companies VALUES('test','Homix Test',true);
  INSERT INTO portal.agents SELECT id,'Test Agent '||id,'agent'||id||'@example.test',null,null,'test','active' FROM generate_series(1,8) AS id;`);
  for (const name of [
    "20260910-content-center.sql",
    "20260911-content-language-pairs.sql",
    "20260912043944_agent_birthdays.sql",
  ])
    await setup.query(
      await readFile(
        new URL(`../../../../db/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  await setup.end();
  Object.assign(process.env, {
    AGENTS_REVALIDATE_SECRET: "local-test",
    HOMIXWEB_REVALIDATE_URL:
      "https://fixture.example.test/api/revalidate-agents",
    AZURE_IMAGE_ENDPOINT: "https://unit-test.openai.azure.com/openai/v1",
    AZURE_IMAGE_API_KEY: "never-sent",
    R2_ACCOUNT_ID: "test",
    R2_CONTENT_BUCKET_NAME: "test",
    R2_CONTENT_ACCESS_KEY_ID: "never-sent",
    R2_CONTENT_SECRET_ACCESS_KEY: "never-sent",
  });
  globalThis.fetch = async (input) => {
    const address = new URL(String(input));
    assert.equal(
      address.hostname,
      "fixture.example.test",
      "No external provider calls permitted",
    );
    const id = Number(address.searchParams.get("portalAgentId"));
    return Response.json({
      linked: true,
      profile: {
        name: `Test Agent ${id}`,
        photo_url: id === 4 ? null : "https://example.test/portrait.png",
      },
    });
  };
  const {
    birthdayList,
    birthdayProfiles,
    saveBirthdays,
    saveBirthdaySettings,
  } = await import("../data");
  const { prepareBirthday, prepareUpcomingBirthdays, markCelebrated } =
    await import("../generation");
  const { getAsset } = await import("@/lib/content/storage");
  const { getGeneration, query } = await import("@/lib/content/store");
  const { nyDate } = await import("../calendar");
  const { closeDatabaseConnections } = await import("@/db");
  const actor = { agentId: 1, email: "admin@example.test" };
  const today = nyDate(),
    month = Number(today.slice(5, 7)),
    day = Number(today.slice(8, 10));
  const changes = [1, 2, 3, 4, 5].map((agentId) => ({
    agentId,
    kind: "birthday",
    joinedOn: null,
    month,
    day,
    enabled: true,
    revision: 0,
  }));
  await saveBirthdays(changes, actor);
  await assert.rejects(
    () => saveBirthdays([{ ...changes[0], day: day === 1 ? 2 : 1 }], actor),
    /changed|变化/,
  );
  assert.equal((await birthdayList("today")).total, 5);
  await saveBirthdays(
    [
      {
        agentId: 1,
        kind: "anniversary",
        joinedOn: `2020-${today.slice(5)}`,
        month,
        day,
        enabled: true,
        revision: 0,
      },
    ],
    actor,
  );
  assert.equal(
    (await birthdayList("today", "", 1, today, "anniversary")).rows[0].years,
    Number(today.slice(0, 4)) - 2020,
  );
  assert.equal(
    (await birthdayProfiles())[0].revision,
    1,
    "Anniversary edit must not invalidate birthday",
  );
  await saveBirthdays(
    [
      {
        agentId: 6,
        kind: "anniversary",
        joinedOn: today,
        month,
        day,
        enabled: true,
        revision: 0,
      },
    ],
    actor,
  );
  const anniversaryToday = await birthdayList(
    "today",
    "",
    1,
    today,
    "anniversary",
  );
  const anniversaryMonth = await birthdayList(
    "month",
    "",
    1,
    today,
    "anniversary",
  );
  assert.equal(
    anniversaryToday.counts.month,
    anniversaryMonth.counts.month,
    "Monthly count is independent of selected filter",
  );
  assert.equal(
    anniversaryMonth.rows.some((r) => r.agentId === 6),
    false,
    "Joining this month is not a work anniversary",
  );
  let profile = (await birthdayProfiles())[0];
  const ids = await Promise.all(
    Array.from({ length: 8 }, () => prepareBirthday(profile, { today })),
  );
  assert.equal(new Set(ids).size, 1, "Concurrent checks create one generation");
  const id = ids[0]!;
  assert.ok(id);
  assert.equal(
    (await query("SELECT * FROM portal.content_generations")).length,
    1,
  );
  await assert.rejects(() => getGeneration(id, 1, false), /not found/);
  assert.equal((await getGeneration(id, 8, true)).id, id);
  assert.equal(
    (
      await query(
        "SELECT * FROM portal.content_projects WHERE owner_agent_id=1 AND NOT admin_only",
      )
    ).length,
    0,
  );
  assert.equal(
    (
      await query(
        "SELECT * FROM portal.content_generations WHERE owner_agent_id=1 AND NOT admin_only",
      )
    ).length,
    0,
    "Company work does not use personal quota",
  );
  const asset = randomUUID();
  await query(
    "INSERT INTO portal.content_assets(id,owner_agent_id,object_key,content_type,bytes,purpose,admin_only) VALUES($1,1,($1::uuid)::text,'image/png',100,'output',true)",
    [asset],
  );
  await assert.rejects(() => getAsset(asset, 1, false), /not found/);
  assert.equal((await getAsset(asset, 8, true)).id, asset);
  await query(
    "UPDATE portal.content_generations SET status='needs_review' WHERE id=$1",
    [id],
  );
  await assert.rejects(
    () => prepareBirthday(profile, { retryGenerationId: id }),
    /核查/,
  );
  assert.equal(
    await prepareBirthday(profile),
    id,
    "Cron must never retry uncertain provider spend",
  );
  await query(
    "UPDATE portal.content_generations SET status='succeeded',output_asset_id=$2 WHERE id=$1",
    [id, asset],
  );
  const event = (
    await query(
      "SELECT id FROM portal.agent_celebration_events WHERE generation_id=$1",
      [id],
    )
  )[0];
  await markCelebrated(event.id, true, actor);
  assert.equal(
    (await birthdayList("today")).rows.find((r) => r.agentId === 1)?.status,
    "celebrated",
  );
  await markCelebrated(event.id, false, actor);
  const retries = await Promise.allSettled([
    prepareBirthday(profile, { retryGenerationId: id }),
    prepareBirthday(profile, { retryGenerationId: id }),
  ]);
  assert.equal(
    retries.filter((r) => r.status === "fulfilled").length,
    1,
    "Concurrent explicit regenerate only spends once",
  );
  const currentId = (
    await query(
      "SELECT generation_id FROM portal.agent_celebration_events WHERE id=$1",
      [event.id],
    )
  )[0].generation_id;
  await saveBirthdays([{ ...changes[0], revision: 1, enabled: false }], actor);
  assert.equal(
    (
      await query("SELECT status FROM portal.content_generations WHERE id=$1", [
        currentId,
      ])
    )[0].status,
    "failed",
    "Changed eligibility cancels queued work",
  );
  await assert.rejects(() => prepareBirthday(profile), /变化/);
  assert.equal(
    (await birthdayList("all")).rows.find((r) => r.agentId === 1)?.assetId,
    null,
  );
  const p4 = (await birthdayProfiles()).find((p) => p.agentId === 4)!;
  assert.equal(await prepareBirthday(p4), null);
  assert.match(
    (await birthdayList("today")).rows.find((r) => r.agentId === 4)?.error ||
      "",
    /头像/,
  );
  await query("UPDATE portal.agents SET account_status='inactive' WHERE id=3");
  assert.equal(
    (await birthdayList("all")).rows.some((r) => r.agentId === 3),
    false,
  );
  await saveBirthdaySettings(
    { enabled: true, leadDays: 7, dailyLimit: 3, language: "zh" },
    actor,
  );
  const remaining = (await birthdayProfiles()).filter((p) =>
    [2, 5].includes(p.agentId),
  );
  const budgetResults = await Promise.all(
    remaining.map((p) => prepareBirthday(p)),
  );
  assert.equal(
    budgetResults.filter(Boolean).length,
    1,
    "Company limit is serialized across agents",
  );
  assert.equal(
    (await query("SELECT count(*) AS count FROM portal.content_generations"))[0]
      .count,
    "3",
  );
  const uncertainId = budgetResults.find(Boolean)!;
  const uncertainOwner = (
    await query(
      "SELECT owner_agent_id FROM portal.content_generations WHERE id=$1",
      [uncertainId],
    )
  )[0].owner_agent_id;
  await query(
    "UPDATE portal.content_generations SET status='needs_review' WHERE id=$1",
    [uncertainId],
  );
  const uncertainProfile = (await birthdayProfiles()).find(
    (p) => p.agentId === uncertainOwner,
  )!;
  await saveBirthdays([{ ...uncertainProfile, enabled: false }], actor);
  await saveBirthdays(
    [
      {
        ...uncertainProfile,
        enabled: true,
        revision: uncertainProfile.revision + 1,
      },
    ],
    actor,
  );
  assert.equal(
    (await birthdayList("all")).rows.find((r) => r.agentId === uncertainOwner)
      ?.status,
    "needs_review",
    "Profile changes must not hide uncertain outcomes",
  );
  await assert.rejects(
    () =>
      prepareBirthday({
        ...uncertainProfile,
        revision: uncertainProfile.revision + 2,
      }),
    /核查/,
  );
  await saveBirthdaySettings(
    { enabled: false, leadDays: 7, dailyLimit: 3, language: "zh" },
    actor,
  );
  assert.equal((await prepareUpcomingBirthdays()).checked, 0);
  profile = (await birthdayProfiles())[0];
  assert.equal(profile.enabled, false);
  assert.ok(
    (
      await query(
        "SELECT * FROM portal.audit_log WHERE action='birthday.prepare'",
      )
    ).every((r) => r.actor_email === null),
    "Automatic work must not impersonate recipient",
  );
  await closeDatabaseConnections();
  console.log(
    "Celebration database integration passed: import CAS, annual idempotency, concurrency, budget, isolation, uncertain results, eligibility and anniversary separation.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
