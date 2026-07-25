/**
 * One-shot importer: pulls EVERY video from your Cloudflare Stream account and
 * inserts any that aren't already in the training_videos table. Safe to re-run
 * (skips UIDs already imported). Videos are imported HIDDEN (is_published = 0) so
 * nothing shows on /training until you review + publish them.
 *
 * Run once:
 *   npx tsx scripts/import-cloudflare-videos.ts
 *
 * Needs (this script auto-loads them from .env.local):
 *   DATABASE_URL                                — Supabase Postgres pooler URL
 *   CLOUDFLARE_ACCOUNT_ID                       — Cloudflare dashboard → account id
 *   CLOUDFLARE_API_TOKEN                         — a token with "Stream:Read"
 *
 * The category is guessed from the video's Cloudflare name and defaults to
 * 地产实务与工具 — you can fix each one with the dropdown on /training.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import type { TrainingCategory } from "../src/lib/training-categories";

function loadDotEnvLocal(): void {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // no .env.local — rely on the ambient environment
  }
}

interface CfVideo {
  uid: string;
  meta?: { name?: string };
  duration?: number;
  created?: string;
}
interface CfResponse {
  success: boolean;
  errors: unknown[];
  result: CfVideo[];
}

function categoryFor(name: string): TrainingCategory {
  const n = name.toLowerCase();
  if (n.includes("inman") || n.includes("conference") || n.includes("峰会"))
    return "行业趋势与活动";
  if (n.includes("租赁") || n.includes("出租") || n.includes("rental"))
    return "租赁实务";
  if (n.includes("买家") || n.includes("buyer")) return "买家课程";
  if (n.includes("卖家") || n.includes("seller")) return "卖家课程";
  if (
    n.includes("自媒体") ||
    n.includes("内容") ||
    n.includes("media") ||
    n.includes("brand") ||
    n.includes("品牌") ||
    n.includes("ip")
  ) {
    return "内容营销与个人品牌";
  }
  return "地产实务与工具";
}

async function fetchAllVideos(accountId: string, token: string): Promise<CfVideo[]> {
  const all: CfVideo[] = [];
  let before: string | undefined;
  for (let page = 0; page < 200; page++) {
    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`);
    url.searchParams.set("limit", "1000");
    if (before) url.searchParams.set("before", before);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as CfResponse;
    if (!json.success) throw new Error("Cloudflare API error: " + JSON.stringify(json.errors));
    all.push(...json.result);
    if (json.result.length < 1000) break;
    before = json.result[json.result.length - 1]?.created;
    if (!before) break;
  }
  return all;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const dbUrl = process.env.DATABASE_URL;
  if (!accountId || !token) {
    console.error("Missing CLOUDFLARE_ACCOUNT_ID and/or CLOUDFLARE_API_TOKEN (add them to .env.local).");
    process.exit(1);
  }
  if (!dbUrl) {
    console.error("Missing DATABASE_URL.");
    process.exit(1);
  }

  const videos = await fetchAllVideos(accountId, token);
  console.log(`Cloudflare account has ${videos.length} videos.`);

  const sql = postgres(dbUrl, { prepare: false, max: 1, onnotice: () => {} });

  const existing = await sql<{ cloudflare_uid: string }[]>`
    SELECT cloudflare_uid FROM portal.training_videos
  `;
  const have = new Set(existing.map((r) => String(r.cloudflare_uid)));
  const fresh = videos.filter((v) => v.uid && !have.has(v.uid));

  if (!fresh.length) {
    console.log("Nothing new to import — every Cloudflare video is already in the table.");
    await sql.end({ timeout: 2 });
    return;
  }

  const now = new Date().toISOString();
  let sort = 100;
  for (const v of fresh) {
    const title = v.meta?.name?.trim() || v.uid;
    const category = categoryFor(v.meta?.name || "");
    const duration = v.duration ? `${Math.max(1, Math.round(v.duration / 60))} min` : null;
    await sql`
      INSERT INTO portal.training_videos
        (title, description, category, cloudflare_uid, duration_label, sort_order, is_published, created_at, updated_at)
      VALUES
        (${title}, ${null}, ${category}, ${v.uid}, ${duration}, ${sort}, FALSE, ${now}, ${now})
    `;
    sort += 1;
    console.log(`+ [${category}] ${title}`);
  }
  console.log(
    `\nImported ${fresh.length} videos as HIDDEN. Open /training as an admin to set categories + publish.`,
  );
  await sql.end({ timeout: 2 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
