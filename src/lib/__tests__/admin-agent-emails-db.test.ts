import assert from "node:assert/strict";

async function main() {
  // This suite injects a failing audit trigger. Only a dedicated disposable local
  // database is accepted; never run it against a developer's or live account data.
  const url = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/homix_admin_identity_test"
  ) {
    throw new Error(
      "Use a disposable local homix_admin_identity_test database with the Portal schema.",
    );
  }
  process.env.ADMIN_EMAILS = "reserved@example.test";
  const { pgPool, closeDatabaseConnections } = await import("@/db");
  const {
    AgentEmailError,
    listAgentEmails,
    previewAgentEmail,
    linkAgentEmail,
  } = await import("@/lib/admin-agent-emails");
  const { previewAgentMerge, mergeAgentAccount } = await import(
    "@/lib/admin-agent-merge"
  );
  const suffix = Date.now();
  const email = (name: string) => `${name}-${suffix}@example.test`;
  const ids: number[] = [];
  let checks = 0;
  const rejects = async (promise: Promise<unknown>, code: string) => {
    await assert.rejects(
      promise,
      (err) => err instanceof AgentEmailError && err.code === code,
    );
    checks++;
  };

  try {
    for (const name of [
      "admin",
      "target",
      "other",
      "inactive",
      "secondadmin",
    ]) {
      const {
        rows: [row],
      } = await pgPool.query(
        `INSERT INTO portal.agents(name,email,is_admin,account_status)
      VALUES($1,$2,$3,$4) RETURNING id`,
        [
          name,
          email(name),
          name.includes("admin"),
          name === "inactive" ? "inactive" : "active",
        ],
      );
      ids.push(row.id);
      await pgPool.query(
        `INSERT INTO portal.agent_email_addresses(agent_id,email,can_sign_in,is_primary,verified_at)
      VALUES($1,$2,TRUE,TRUE,NOW())`,
        [row.id, email(name)],
      );
    }
    const [admin, target, other, inactive, secondadmin] = ids;
    const add = (
      address: string,
      agentId = target,
      actorId = admin,
      expectedAdmin = false,
    ) => linkAgentEmail({ agentId, actorId, email: address, expectedAdmin });

    assert.equal(
      (await previewAgentEmail(target, ` ${email("alias").toUpperCase()} `))
        .email,
      email("alias"),
    );
    await rejects(previewAgentEmail(target, "bad email"), "INVALID_EMAIL");
    assert.equal(
      (await previewAgentEmail(target, email("target"))).state,
      "linked",
    );
    const occupied = await previewAgentEmail(target, email("other"));
    assert.equal(occupied.state, "conflict");
    assert.equal(occupied.owners[0].id, other);
    await rejects(add(email("other")), "EMAIL_IN_USE");
    await rejects(add("reserved@example.test"), "RESERVED_ADMIN_EMAIL");

    // Legacy primary email and even a disabled Google subject prevent reassignment.
    await pgPool.query(
      `DELETE FROM portal.agent_email_addresses WHERE agent_id=$1`,
      [other],
    );
    await rejects(add(email("other")), "EMAIL_IN_USE");
    await pgPool.query(
      `INSERT INTO portal.agent_login_identities(agent_id,provider,provider_subject,email_at_link,verified_at,disabled_at)
    VALUES($1,'google',$2,$3,NOW(),NOW())`,
      [other, `subject-${suffix}`, email("identity")],
    );
    await rejects(add(email("identity")), "EMAIL_IN_USE");

    await pgPool.query(
      `UPDATE portal.agents SET pending_email=$2,email_change_requested_at=NOW() WHERE id=$1`,
      [other, email("pending")],
    );
    await rejects(add(email("pending")), "EMAIL_PENDING");
    await pgPool.query(
      `UPDATE portal.agents SET email_change_requested_at=NOW()-INTERVAL '8 days' WHERE id=$1`,
      [other],
    );
    assert.equal(
      (await previewAgentEmail(target, email("pending"))).state,
      "available",
    );
    await rejects(add(email("denied"), target, other), "FORBIDDEN");
    await rejects(add(email("denied"), target, inactive), "FORBIDDEN");
    await rejects(add(email("admin-alias"), secondadmin), "ACCESS_CHANGED");

    await add(` ${email("alias").toUpperCase()} `);
    const addresses = await listAgentEmails(target);
    assert.equal(addresses.length, 2);
    assert.equal(addresses[0].email, email("target"));
    const alias = addresses.find((row) => row.email === email("alias"));
    assert.equal(alias?.source, "admin_assigned");
    assert.equal(alias?.isPrimary, false);
    assert.equal(alias?.canSignIn, true);
    assert.ok(alias?.verifiedAt);
    const {
      rows: [preserved],
    } = await pgPool.query(
      `SELECT email,is_admin,account_status FROM portal.agents WHERE id=$1`,
      [target],
    );
    assert.deepEqual(preserved, {
      email: email("target"),
      is_admin: false,
      account_status: "active",
    });
    const {
      rows: [audit],
    } = await pgPool.query(
      `SELECT detail FROM portal.audit_log WHERE action='admin_link_login_email' AND entity_id=$1 ORDER BY id DESC LIMIT 1`,
      [String(target)],
    );
    assert.equal(JSON.parse(audit.detail).linkedEmail, email("alias"));
    checks++;
    await rejects(add(email("alias")), "ALREADY_LINKED");

    await add(email("inactive-alias"), inactive);
    const {
      rows: [status],
    } = await pgPool.query(
      `SELECT account_status FROM portal.agents WHERE id=$1`,
      [inactive],
    );
    assert.equal(status.account_status, "inactive");
    checks++;
    await add(email("admin-alias"), secondadmin, admin, true);
    assert.equal(
      (await previewAgentEmail(secondadmin, email("admin-alias"))).target
        .isAdmin,
      true,
    );
    checks++;

    const race = await Promise.allSettled([
      add(email("race"), target),
      add(email("race"), other, secondadmin),
    ]);
    assert.equal(
      race.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      race.filter((result) => result.status === "rejected").length,
      1,
    );
    const { rows: raceRows } = await pgPool.query(
      `SELECT agent_id FROM portal.agent_email_addresses WHERE email=$1`,
      [email("race")],
    );
    assert.equal(raceRows.length, 1);
    checks++;

    // An unavailable audit table/trigger must roll the email assignment back.
    await pgPool.query(`CREATE FUNCTION portal.test_reject_email_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.action='admin_link_login_email' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_reject_email_audit BEFORE INSERT ON portal.audit_log FOR EACH ROW EXECUTE FUNCTION portal.test_reject_email_audit()`);
    try {
      await assert.rejects(add(email("audit-failure")), /test audit failure/);
      assert.equal(
        (await previewAgentEmail(target, email("audit-failure"))).state,
        "available",
      );
      checks++;
    } finally {
      await pgPool.query(
        `DROP TRIGGER test_reject_email_audit ON portal.audit_log; DROP FUNCTION portal.test_reject_email_audit()`,
      );
    }
    const createDuplicate = async (name: string) => {
      const {
        rows: [row],
      } = await pgPool.query(
        `INSERT INTO portal.agents(name,email,account_status) VALUES($1,$2,'pending') RETURNING id`,
        [name, email(name)],
      );
      ids.push(row.id);
      await pgPool.query(
        `INSERT INTO portal.agent_email_addresses(agent_id,email,can_sign_in,is_primary,verified_at) VALUES($1,$2,TRUE,TRUE,NOW())`,
        [row.id, email(name)],
      );
      return row.id as number;
    };
    const duplicate = await createDuplicate("duplicate"),
      raceDuplicate = await createDuplicate("race-duplicate");
    if (
      !(await pgPool.query(`SELECT to_regclass('public.agents') AS relation`))
        .rows[0].relation
    ) {
      assert.ok(
        (await previewAgentMerge(duplicate, target)).blockers.some(
          (blocker) => blocker.code === "website_unavailable",
        ),
      );
      checks++;
    }
    await pgPool.query(
      `CREATE TABLE IF NOT EXISTS public.agents(id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, slug TEXT NOT NULL UNIQUE, portal_agent_id INTEGER)`,
    );
    await pgPool.query(
      `INSERT INTO public.agents(slug,portal_agent_id) VALUES($1,$2)`,
      [`canonical-${suffix}`, target],
    );
    await pgPool.query(
      `INSERT INTO portal.agent_login_identities(agent_id,provider,provider_subject,email_at_link,is_primary,verified_at) VALUES($1,'google',$2,$3,TRUE,NOW())`,
      [duplicate, `duplicate-subject-${suffix}`, email("duplicate")],
    );
    await pgPool.query(
      `INSERT INTO portal.agent_login_identities(agent_id,provider,provider_subject,email_at_link,disabled_at,verified_at) VALUES($1,'google',$2,$3,NOW(),NOW())`,
      [duplicate, `disabled-subject-${suffix}`, email("duplicate")],
    );
    await pgPool.query(
      `INSERT INTO portal.onboarding_events(event_type,agent_id,actor_agent_id,actor_email) VALUES('application_account_created',$1,$1,$2)`,
      [duplicate, email("duplicate")],
    );
    await pgPool.query(
      `INSERT INTO portal.agent_email_addresses(agent_id,email,can_sign_in,is_primary) VALUES($1,$2,FALSE,FALSE)`,
      [duplicate, email("disabled-alias")],
    );

    const initial = await previewAgentMerge(duplicate, target);
    assert.deepEqual(initial.blockers, []);
    assert.deepEqual(initial.targetProfiles, [`canonical-${suffix}`]);
    assert.equal(initial.identityCount, 2);
    assert.equal(initial.emails.length, 2);
    checks++;
    const apply = async (revision: string, actorId = admin) =>
      mergeAgentAccount({
        actorId,
        sourceId: duplicate,
        targetId: target,
        revision,
      });
    await rejects(apply(initial.revision, other), "FORBIDDEN");
    await pgPool.query(
      `UPDATE portal.agents SET name='changed duplicate' WHERE id=$1`,
      [duplicate],
    );
    await rejects(apply(initial.revision), "MERGE_CHANGED");

    // Sensitive inline data and unexpected/future business foreign keys block.
    await pgPool.query(
      `UPDATE portal.agents SET agreement_status='sent' WHERE id=$1`,
      [duplicate],
    );
    assert.ok(
      (await previewAgentMerge(duplicate, target)).blockers.some(
        (blocker) => blocker.code === "agreement",
      ),
    );
    await rejects(apply(initial.revision), "MERGE_BLOCKED");
    await pgPool.query(
      `UPDATE portal.agents SET agreement_status='not_started',stripe_customer_id='cus_test_identity' WHERE id=$1`,
      [duplicate],
    );
    assert.ok(
      (await previewAgentMerge(duplicate, target)).blockers.some(
        (blocker) => blocker.code === "payment",
      ),
    );
    await pgPool.query(
      `UPDATE portal.agents SET stripe_customer_id=NULL WHERE id=$1`,
      [duplicate],
    );
    assert.ok(
      (await previewAgentMerge(duplicate, secondadmin)).blockers.some(
        (blocker) => blocker.code === "privileged",
      ),
    );
    assert.ok(
      (await previewAgentMerge(inactive, target)).blockers.some(
        (blocker) => blocker.code === "inactive",
      ),
    );
    await pgPool.query(
      `INSERT INTO public.agents(slug,portal_agent_id) VALUES($1,$2)`,
      [`duplicate-profile-${suffix}`, duplicate],
    );
    assert.ok(
      (await previewAgentMerge(duplicate, target)).blockers.some(
        (blocker) => blocker.code === "website",
      ),
    );
    await rejects(apply(initial.revision), "MERGE_BLOCKED");
    await pgPool.query(`DELETE FROM public.agents WHERE portal_agent_id=$1`, [
      duplicate,
    ]);
    await pgPool.query(
      `CREATE TABLE portal.test_future_identity_business(agent_id INTEGER REFERENCES portal.agents(id)); INSERT INTO portal.test_future_identity_business VALUES(${duplicate})`,
    );
    try {
      assert.ok(
        (await previewAgentMerge(duplicate, target)).blockers.some(
          (blocker) => blocker.code === "business_records",
        ),
      );
      await rejects(apply(initial.revision), "MERGE_BLOCKED");
    } finally {
      await pgPool.query(`DROP TABLE portal.test_future_identity_business`);
    }

    const ready = await previewAgentMerge(duplicate, target);
    await pgPool.query(`CREATE FUNCTION portal.test_reject_merge_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action='admin_merge_agent' THEN RAISE EXCEPTION 'test merge audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_reject_merge_audit BEFORE INSERT ON portal.audit_log FOR EACH ROW EXECUTE FUNCTION portal.test_reject_merge_audit()`);
    try {
      await assert.rejects(apply(ready.revision), /test merge audit failure/);
      assert.equal(
        (
          await pgPool.query(`SELECT id FROM portal.agents WHERE id=$1`, [
            duplicate,
          ])
        ).rows.length,
        1,
      );
      assert.equal(
        (
          await pgPool.query(
            `SELECT id FROM portal.agent_merge_history WHERE source_agent_id=$1`,
            [duplicate],
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await pgPool.query(
            `SELECT agent_id FROM portal.agent_login_identities WHERE provider_subject=$1`,
            [`duplicate-subject-${suffix}`],
          )
        ).rows[0].agent_id,
        duplicate,
      );
      checks++;
    } finally {
      await pgPool.query(
        `DROP TRIGGER test_reject_merge_audit ON portal.audit_log; DROP FUNCTION portal.test_reject_merge_audit()`,
      );
    }
    await apply(ready.revision);
    assert.equal(
      (
        await pgPool.query(`SELECT id FROM portal.agents WHERE id=$1`, [
          duplicate,
        ])
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await pgPool.query(
          `SELECT agent_id FROM portal.agent_login_identities WHERE provider_subject=$1`,
          [`duplicate-subject-${suffix}`],
        )
      ).rows[0].agent_id,
      target,
    );
    assert.ok(
      (
        await pgPool.query(
          `SELECT disabled_at FROM portal.agent_login_identities WHERE provider_subject=$1`,
          [`disabled-subject-${suffix}`],
        )
      ).rows[0].disabled_at,
    );
    const migrated = (await listAgentEmails(target)).find(
      (address) => address.email === email("duplicate"),
    );
    assert.ok(migrated?.canSignIn);
    assert.equal(migrated?.isPrimary, false);
    const disabled = (await listAgentEmails(target)).find(
      (address) => address.email === email("disabled-alias"),
    );
    assert.equal(disabled?.canSignIn, false);
    assert.equal(disabled?.verifiedAt, null);
    assert.equal(
      (
        await pgPool.query(
          `SELECT portal_agent_id FROM public.agents WHERE slug=$1`,
          [`canonical-${suffix}`],
        )
      ).rows[0].portal_agent_id,
      target,
    );
    const snapshot = (
      await pgPool.query(
        `SELECT source_snapshot FROM portal.agent_merge_history WHERE source_agent_id=$1`,
        [duplicate],
      )
    ).rows[0].source_snapshot;
    assert.equal(snapshot.email, email("duplicate"));
    checks++;
    await rejects(apply(ready.revision), "AGENT_NOT_FOUND");

    const racePreviewA = await previewAgentMerge(raceDuplicate, target),
      racePreviewB = await previewAgentMerge(raceDuplicate, other);
    const merges = await Promise.allSettled([
      mergeAgentAccount({
        actorId: admin,
        sourceId: raceDuplicate,
        targetId: target,
        revision: racePreviewA.revision,
      }),
      mergeAgentAccount({
        actorId: secondadmin,
        sourceId: raceDuplicate,
        targetId: other,
        revision: racePreviewB.revision,
      }),
    ]);
    assert.equal(
      merges.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      (
        await pgPool.query(
          `SELECT id FROM portal.agent_merge_history WHERE source_agent_id=$1`,
          [raceDuplicate],
        )
      ).rows.length,
      1,
    );
    checks++;

    console.log(
      `Admin email database integration passed (${checks} permission, conflict, preservation, concurrency and rollback checks).`,
    );
  } finally {
    await pgPool.query(
      `DELETE FROM portal.audit_log WHERE action IN ('admin_link_login_email','admin_merge_agent') AND entity_id=ANY($1::text[])`,
      [ids.map(String)],
    );
    await pgPool.query(
      `DELETE FROM portal.agent_merge_history WHERE source_agent_id=ANY($1::int[])`,
      [ids],
    );
    if (
      (await pgPool.query(`SELECT to_regclass('public.agents') AS relation`))
        .rows[0].relation
    )
      await pgPool.query(
        `DELETE FROM public.agents WHERE portal_agent_id=ANY($1::int[])`,
        [ids],
      );
    await pgPool.query(
      `DELETE FROM portal.onboarding_events WHERE agent_id=ANY($1::int[]) OR actor_agent_id=ANY($1::int[])`,
      [ids],
    );
    await pgPool.query(`DELETE FROM portal.agents WHERE id=ANY($1::int[])`, [
      ids,
    ]);
    await closeDatabaseConnections();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
