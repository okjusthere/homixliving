/** Run with an explicit environment file. Dry-run by default; --apply publishes.
 * Old versions remain available to historical generations and administrators.
 */
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Pool } from "pg";
import { initialTemplates } from "../src/lib/content/catalog";
import { templateConfigSchema } from "../src/lib/content/validation";
import type { TemplateConfig } from "../src/lib/content/types";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1,
    connectionTimeoutMillis: 10000, statement_timeout: 15000 });
  const c = await pool.connect();
  const apply = process.argv.includes("--apply");
  try {
    await c.query("BEGIN");
    // Serialize with template publishing, including concurrent admin changes.
    await c.query("LOCK TABLE portal.content_templates IN SHARE ROW EXCLUSIVE MODE");
    const { rows } = await c.query<{
      id: string; family_id: string; seed_key: string | null;
      version: number; status: string; config: TemplateConfig;
    }>("SELECT id,family_id,seed_key,version,status,config FROM portal.content_templates");
    const targets = initialTemplates().map(({ key, config }) => {
      templateConfigSchema.parse(config);
      const root = rows.find((r) => r.seed_key === key);
      const family = root ? rows.filter((r) => r.family_id === root.family_id) : [];
      const current = family.find((r) => r.status === "published" && isDeepStrictEqual(r.config, config));
      const id = current?.id || randomUUID();
      return { key, config, id, familyId: root?.family_id || id,
        version: current?.version || Math.max(0, ...family.map((r) => r.version)) + 1,
        seedKey: root ? null : key, unchanged: Boolean(current) };
    });
    const keep = new Set(targets.map((t) => t.id));
    const retire = rows.filter((r) => r.status === "published" &&
      ["listing", "holiday"].includes(r.config.kind) && !keep.has(r.id));
    console.log(JSON.stringify({ apply, publish: targets.filter((t) => !t.unchanged).map((t) => ({
      key: t.key, version: t.version, name: t.config.name.zh,
    })), retire: retire.map((r) => ({ id: r.id, name: r.config.name.zh })),
      unchanged: targets.filter((t) => t.unchanged).length }, null, 2));
    if (!apply) {
      await c.query("ROLLBACK");
      return;
    }
    await c.query("UPDATE portal.content_templates SET status='retired' WHERE id=ANY($1::uuid[])", [retire.map((r) => r.id)]);
    for (const t of targets.filter((t) => !t.unchanged)) {
      await c.query("INSERT INTO portal.content_templates(id,family_id,seed_key,version,status,config) VALUES($1,$2,$3,$4,'published',$5)",
        [t.id, t.familyId, t.seedKey, t.version, JSON.stringify(t.config)]);
    }
    const { rows: [count] } = await c.query<{ count: string }>("SELECT count(*) FROM portal.content_templates WHERE status='published' AND config->>'kind' IN ('listing','holiday')");
    if (Number(count.count) !== 14) throw new Error("Unexpected published template count");
    await c.query("COMMIT");
    console.log("Published 12 listing templates (2 per theme) and 2 holiday templates. Historical versions preserved.");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  } finally {
    c.release();
    await pool.end();
  }
}
main().catch(() => {
  console.error("Template refresh failed; no partial changes committed. Check database access and schema.");
  process.exitCode = 1;
});
