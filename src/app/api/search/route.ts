import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents, buildings, deals, invoices, saleDeals } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { dealsVisibleToSql, saleDealsVisibleToSql } from "@/lib/visibility";

export type SearchResult = {
  group: "rental" | "sale" | "invoice" | "building" | "agent";
  title: string;
  subtitle?: string;
  href: string;
};

const LIMIT = 6;

// Global ⌘K search. Every group respects the same visibility rules as its
// list page: deals via the visibility SQL, invoices via deal-visibility or
// own-email; the agent group is admin-only (the /agents page itself redirects
// non-admins away).
export async function GET(req: NextRequest) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;
  const session = authResult.session;

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 1) return NextResponse.json({ results: [] });
  // Escape LIKE wildcards in user input so "50%" doesn't match everything.
  // ILIKE: Postgres LIKE is case-sensitive (SQLite's wasn't) — keep the old
  // case-insensitive search behavior.
  const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`);
  const pattern = `%${escaped}%`;
  const matches = (col: unknown) => sql`${col} ILIKE ${pattern} ESCAPE '\\'`;

  const rentalVisibility = dealsVisibleToSql(session);
  const saleVisibility = saleDealsVisibleToSql(session);

  const [rentalRows, saleRows, buildingRows, agentRows] = await Promise.all([
    db
      .select({
        id: deals.id,
        unit: deals.unit,
        tenantName: deals.tenantName,
        dealDate: deals.dealDate,
        buildingName: buildings.name,
      })
      .from(deals)
      .leftJoin(buildings, eq(deals.buildingId, buildings.id))
      .where(
        and(
          or(
            matches(deals.tenantName),
            matches(deals.unit),
            matches(deals.apartmentAddress),
            matches(buildings.name)
          ),
          rentalVisibility
        )
      )
      .orderBy(desc(deals.id))
      .limit(LIMIT),
    db
      .select({
        id: saleDeals.id,
        propertyAddress: saleDeals.propertyAddress,
        buyerNames: saleDeals.buyerNames,
        sellerNames: saleDeals.sellerNames,
        contractDate: saleDeals.contractDate,
      })
      .from(saleDeals)
      .where(
        and(
          or(
            matches(saleDeals.propertyAddress),
            matches(saleDeals.buyerNames),
            matches(saleDeals.sellerNames),
            matches(saleDeals.mlsNumber)
          ),
          saleVisibility
        )
      )
      .orderBy(desc(saleDeals.id))
      .limit(LIMIT),
    db
      .select({
        id: buildings.id,
        name: buildings.name,
        region: buildings.region,
        managementCompany: buildings.managementCompany,
      })
      .from(buildings)
      .where(or(matches(buildings.name), matches(buildings.managementCompany)))
      .limit(LIMIT),
    session.user.isAdmin
      ? db
          .select({ id: agents.id, name: agents.name, email: agents.email })
          .from(agents)
          .where(or(matches(agents.name), matches(agents.email)))
          .limit(LIMIT)
      : Promise.resolve([] as Array<{ id: number; name: string; email: string }>),
  ]);

  // Invoices: admins see all; agents see invoices on visible deals or
  // attributed to their own email (same rule as the invoice list page).
  const rawInvoices = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      tenantName: invoices.tenantName,
      status: invoices.status,
      dealId: invoices.dealId,
      agentEmail: invoices.agentEmail,
    })
    .from(invoices)
    .where(or(matches(invoices.invoiceNumber), matches(invoices.tenantName)))
    .orderBy(desc(invoices.id))
    .limit(LIMIT * 4);

  let invoiceRows = rawInvoices;
  if (!session.user.isAdmin) {
    const visibleDeals = rentalVisibility
      ? await db.select({ id: deals.id }).from(deals).where(rentalVisibility)
      : await db.select({ id: deals.id }).from(deals);
    const visibleDealIds = new Set(visibleDeals.map((d) => d.id));
    const myEmail = session.user.email?.toLowerCase();
    invoiceRows = rawInvoices.filter((inv) =>
      inv.dealId
        ? visibleDealIds.has(inv.dealId)
        : inv.agentEmail?.toLowerCase() === myEmail
    );
  }
  invoiceRows = invoiceRows.slice(0, LIMIT);

  const results: SearchResult[] = [
    ...rentalRows.map((r) => ({
      group: "rental" as const,
      title: `${r.buildingName || ""} ${r.unit || ""}`.trim() || `Rental #${r.id}`,
      subtitle: [r.tenantName, r.dealDate].filter(Boolean).join(" · "),
      href: `/rental/${r.id}`,
    })),
    ...saleRows.map((r) => ({
      group: "sale" as const,
      title: r.propertyAddress || `Sale #${r.id}`,
      subtitle: [r.buyerNames || r.sellerNames, r.contractDate]
        .filter(Boolean)
        .join(" · "),
      href: `/sales/${r.id}`,
    })),
    ...invoiceRows.map((r) => ({
      group: "invoice" as const,
      title: r.invoiceNumber,
      subtitle: [r.tenantName, r.status].filter(Boolean).join(" · "),
      href: `/invoices/${r.id}`,
    })),
    ...buildingRows.map((r) => ({
      group: "building" as const,
      title: r.name,
      subtitle: [r.region, r.managementCompany].filter(Boolean).join(" · "),
      href: `/buildings`,
    })),
    ...agentRows.map((r) => ({
      group: "agent" as const,
      title: r.name,
      subtitle: r.email,
      href: `/agents/${r.id}`,
    })),
  ];

  return NextResponse.json({ results });
}
