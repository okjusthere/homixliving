import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { checklistItems, dealDocuments, saleDeals } from "@/db/schema";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { canViewDealOfType, parseDealType } from "@/lib/deal-access";
import { CHECKLIST_GROUPS, checklistGroupsForDeal } from "@/lib/checklist-groups";

// The deal's required-documents checklist, with which items are already
// satisfied by an upload. Group set depends on deal type and (for sales)
// which side we represented.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;

  const { type, id } = await params;
  const dealType = parseDealType(type);
  const dealId = parseInt(id, 10);
  if (!dealType || !Number.isInteger(dealId) || dealId <= 0) {
    return NextResponse.json({ error: "Invalid deal" }, { status: 400 });
  }
  if (!(await canViewDealOfType(auth.session, dealType, dealId))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let representationType: string | null = null;
  if (dealType === "sale") {
    const [sale] = await db
      .select({ representationType: saleDeals.representationType })
      .from(saleDeals)
      .where(eq(saleDeals.id, dealId))
      .limit(1);
    if (!sale) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    representationType = sale.representationType;
  }

  const groupKeys = checklistGroupsForDeal(dealType, representationType);
  const [items, linkedDocs] = await Promise.all([
    db
      .select()
      .from(checklistItems)
      .where(inArray(checklistItems.groupKey, groupKeys))
      .orderBy(asc(checklistItems.sortOrder), asc(checklistItems.id)),
    db
      .select({
        id: dealDocuments.id,
        fileName: dealDocuments.fileName,
        checklistItemId: dealDocuments.checklistItemId,
      })
      .from(dealDocuments)
      .where(
        and(
          eq(dealDocuments.dealType, dealType),
          eq(dealDocuments.dealId, dealId),
          isNotNull(dealDocuments.checklistItemId),
        ),
      ),
  ]);

  const docsByItem = new Map<number, { id: number; fileName: string }[]>();
  for (const doc of linkedDocs) {
    if (doc.checklistItemId == null) continue;
    const list = docsByItem.get(doc.checklistItemId) ?? [];
    list.push({ id: doc.id, fileName: doc.fileName });
    docsByItem.set(doc.checklistItemId, list);
  }

  const groups = groupKeys
    .map((key) => {
      const meta = CHECKLIST_GROUPS.find((g) => g.key === key);
      return {
        key,
        labelEn: meta?.en ?? key,
        labelZh: meta?.zh ?? key,
        items: items
          .filter((item) => item.groupKey === key)
          .map((item) => ({
            id: item.id,
            label: item.label,
            documents: docsByItem.get(item.id) ?? [],
          })),
      };
    })
    .filter((group) => group.items.length > 0);

  return NextResponse.json({ groups, representationType });
}
