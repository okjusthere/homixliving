import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
loadEnvConfig(process.cwd());

async function main() {
  const { pgPool, closeDatabaseConnections } = await import("../src/db");
  const { initialTemplates, initialHolidays } =
    await import("../src/lib/content/catalog");
  try {
    await pgPool.query(
      await readFile("db/migrations/20260910-content-center.sql", "utf8"),
    );
    const c = await pgPool.connect();
    try {
      await c.query("BEGIN");
      for (const { key, config } of initialTemplates()) {
        const id = randomUUID();
        await c.query(
          "INSERT INTO portal.content_templates(id,family_id,seed_key,version,status,config) VALUES($1,$1,$2,1,'published',$3) ON CONFLICT(seed_key) DO NOTHING",
          [id, key, JSON.stringify(config)],
        );
      }
      for (const h of initialHolidays()) {
        await c.query(
          "INSERT INTO portal.content_holidays(id,country,name,greeting) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [h.id, h.country, JSON.stringify(h.name), JSON.stringify(h.greeting)],
        );
        for (const d of h.dates)
          await c.query(
            "INSERT INTO portal.content_holiday_dates(holiday_id,year,date) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [h.id, d.year, d.date],
          );
      }
      await c.query("COMMIT");
      console.log(
        `Content center ready: ${initialTemplates().length} initial styles, ${initialHolidays().length} holidays (existing edits preserved).`,
      );
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  } finally {
    await closeDatabaseConnections();
  }
}
main().catch(() => {
  console.error(
    "Content migration/seed failed. Check database access and migration state.",
  );
  process.exitCode = 1;
});
