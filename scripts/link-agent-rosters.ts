/**
 * Roster reconciliation: link portal.agents ↔ public.agents (same database).
 *
 *   DATABASE_URL=… npx tsx scripts/link-agent-rosters.ts                # report only
 *   DATABASE_URL=… npx tsx scripts/link-agent-rosters.ts --apply       # write email links
 *   DATABASE_URL=… npx tsx scripts/link-agent-rosters.ts --apply --apply-license
 *   DATABASE_URL=… npx tsx scripts/link-agent-rosters.ts --link <slug>=<portalId>
 *
 * The rosters are NOT 1:1: public profiles exist for agents who never logged
 * into the portal, portal accounts exist without a public profile, and the
 * public contact email is often a personal address (or empty) that differs
 * from the portal's Google login. So links are written ONLY when a match is
 * unambiguous, in two confidence tiers:
 *
 *   1. email  — exact case-insensitive match, unique on both sides (--apply)
 *   2. license — digits-only license number match, unique on both sides,
 *      flagged separately because data entry varies (--apply-license)
 *
 * Everything else is listed for a human decision (--link for manual pairs).
 * Nothing is ever deleted or unlinked automatically; re-running is safe.
 */
import postgres from "postgres";

type PortalAgent = {
  id: number;
  name: string;
  email: string;
  license_number: string | null;
  is_active: boolean;
};
type PublicAgent = {
  id: string;
  slug: string;
  name: string | null;
  email: string | null;
  license_number: string | null;
  mls_id: string | null;
  visible: boolean | null;
  portal_agent_id: number | null;
};

const normEmail = (v: string | null | undefined) => (v || "").trim().toLowerCase();
const normLicense = (v: string | null | undefined) => {
  const digits = (v || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : ""; // too short to be a NY license — ignore
};

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("Set DATABASE_URL.");
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  const applyLicense = process.argv.includes("--apply-license");
  const manualArg = process.argv[process.argv.indexOf("--link") + 1];
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

  await sql.unsafe(
    `ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS portal_agent_id INTEGER`,
  );
  // One public profile per portal agent, enforced by the database.
  await sql.unsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_public_agents_portal_link
       ON public.agents(portal_agent_id) WHERE portal_agent_id IS NOT NULL`,
  );

  const portal = (await sql.unsafe(
    `SELECT id, name, email, license_number, is_active FROM portal.agents ORDER BY id`,
  )) as unknown as PortalAgent[];
  const pub = (await sql.unsafe(
    `SELECT id, slug, name, email, license_number, mls_id, visible, portal_agent_id
     FROM public.agents ORDER BY slug`,
  )) as unknown as PublicAgent[];

  // Manual link mode: --link slug=portalId
  if (process.argv.includes("--link") && manualArg?.includes("=")) {
    const [slug, portalIdRaw] = manualArg.split("=");
    const portalId = parseInt(portalIdRaw, 10);
    const target = pub.find((p) => p.slug === slug);
    const source = portal.find((a) => a.id === portalId);
    if (!target || !source) {
      console.error(`Unknown ${!target ? `slug "${slug}"` : `portal id ${portalId}`}.`);
      process.exit(1);
    }
    await sql`UPDATE public.agents SET portal_agent_id = ${portalId} WHERE slug = ${slug}`;
    console.log(`Linked slug "${slug}" → portal #${portalId} (${source.name}).`);
    await sql.end({ timeout: 2 });
    return;
  }

  const linked = pub.filter((p) => p.portal_agent_id != null);
  const linkedPortalIds = new Set(linked.map((p) => p.portal_agent_id));
  const unlinkedPub = pub.filter((p) => p.portal_agent_id == null);
  const unlinkedPortal = portal.filter((a) => !linkedPortalIds.has(a.id));

  // Tier 1: unique email matches.
  const portalByEmail = new Map<string, PortalAgent[]>();
  for (const a of unlinkedPortal) {
    const key = normEmail(a.email);
    if (!key) continue;
    portalByEmail.set(key, [...(portalByEmail.get(key) ?? []), a]);
  }
  const emailLinks: { pub: PublicAgent; portal: PortalAgent }[] = [];
  const afterEmail: PublicAgent[] = [];
  for (const p of unlinkedPub) {
    const candidates = portalByEmail.get(normEmail(p.email)) ?? [];
    if (candidates.length === 1) emailLinks.push({ pub: p, portal: candidates[0] });
    else afterEmail.push(p);
  }

  // Tier 2: unique license matches among what's left.
  const claimed = new Set(emailLinks.map((l) => l.portal.id));
  const remainingPortal = unlinkedPortal.filter((a) => !claimed.has(a.id));
  const portalByLicense = new Map<string, PortalAgent[]>();
  for (const a of remainingPortal) {
    const key = normLicense(a.license_number);
    if (!key) continue;
    portalByLicense.set(key, [...(portalByLicense.get(key) ?? []), a]);
  }
  const licenseLinks: { pub: PublicAgent; portal: PortalAgent }[] = [];
  const stillUnlinked: PublicAgent[] = [];
  for (const p of afterEmail) {
    const candidates = portalByLicense.get(normLicense(p.license_number)) ?? [];
    if (candidates.length === 1) licenseLinks.push({ pub: p, portal: candidates[0] });
    else stillUnlinked.push(p);
  }
  const licenseClaimed = new Set(licenseLinks.map((l) => l.portal.id));
  const portalOnly = remainingPortal.filter((a) => !licenseClaimed.has(a.id));

  // ---- report ----
  console.log(`\n=== roster reconciliation ===`);
  console.log(`portal agents: ${portal.length} · public profiles: ${pub.length}`);
  if (linked.length) {
    console.log(`\n— already linked (${linked.length}) —`);
    for (const p of linked) console.log(`  ${p.slug} → portal #${p.portal_agent_id}`);
  }
  console.log(`\n— email matches (${emailLinks.length}) ${apply ? "[APPLYING]" : "[dry run — use --apply]"} —`);
  for (const l of emailLinks) {
    console.log(`  ${l.pub.slug} (${l.pub.email}) → portal #${l.portal.id} ${l.portal.name}`);
  }
  console.log(`\n— license matches, emails differ (${licenseLinks.length}) ${applyLicense ? "[APPLYING]" : "[review, then --apply-license]"} —`);
  for (const l of licenseLinks) {
    console.log(
      `  ${l.pub.slug} (lic ${l.pub.license_number}, email ${l.pub.email || "—"}) → portal #${l.portal.id} ${l.portal.name} (${l.portal.email})`,
    );
  }
  console.log(`\n— website-only, needs manual --link or stays unsynced (${stillUnlinked.length}) —`);
  for (const p of stillUnlinked) {
    console.log(`  ${p.slug} · ${p.name} · email ${p.email || "—"} · lic ${p.license_number || "—"} · visible=${p.visible}`);
  }
  console.log(`\n— portal-only, no public profile (${portalOnly.length}) —`);
  for (const a of portalOnly) {
    console.log(`  #${a.id} ${a.name} (${a.email}) active=${a.is_active}`);
  }

  // ---- write ----
  let written = 0;
  if (apply) {
    for (const l of emailLinks) {
      await sql`UPDATE public.agents SET portal_agent_id = ${l.portal.id} WHERE id = ${l.pub.id}`;
      written += 1;
    }
  }
  if (applyLicense) {
    for (const l of licenseLinks) {
      await sql`UPDATE public.agents SET portal_agent_id = ${l.portal.id} WHERE id = ${l.pub.id}`;
      written += 1;
    }
  }
  console.log(`\n${written} link(s) written.`);
  await sql.end({ timeout: 2 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
