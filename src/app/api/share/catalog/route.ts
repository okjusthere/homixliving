import { NextRequest, NextResponse } from "next/server";
import { requireActiveAgentApi } from "@/lib/auth-guards";
import { curatedShareCatalogItem, fetchShareCatalog } from "@/lib/homixweb";
import { isShareKind, isShareLocale } from "@/lib/share-center";
import { hasShareListingFilters, parseShareListingFilters } from "@/lib/share-listing-filters";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireActiveAgentApi();
  if ("error" in auth) return auth.error;

  const kindParam = request.nextUrl.searchParams.get("kind") || "all";
  const kind =
    kindParam === "all" || isShareKind(kindParam) ? kindParam : null;
  const localeParam = request.nextUrl.searchParams.get("locale") || "zh";
  const locale = isShareLocale(localeParam) ? localeParam : null;
  if (!kind || !locale) {
    return NextResponse.json({ error: "Invalid filters" }, { status: 400 });
  }
  const parsedFilters = kind === "listing"
    ? parseShareListingFilters(request.nextUrl.searchParams)
    : null;
  if (parsedFilters && !parsedFilters.ok) {
    return NextResponse.json({ error: parsedFilters.error }, { status: 400 });
  }
  const listingFilters = parsedFilters?.ok ? parsedFilters.filters : undefined;
  const listingScope =
    request.nextUrl.searchParams.get("listingScope") === "all"
      ? "all"
      : "homix";
  const query = request.nextUrl.searchParams.get("q") || "";
  const page = Math.max(
    1,
    Number.parseInt(request.nextUrl.searchParams.get("page") || "1", 10) || 1,
  );

  const result = await fetchShareCatalog({
    kind,
    locale,
    listingScope,
    query,
    page,
    pageSize: 12,
    listingFilters,
  });
  if (!result || result.unavailable) {
    return NextResponse.json(
      { error: "Homix Web content is temporarily unavailable." },
      { status: 502 },
    );
  }
  const openHouseItem = curatedShareCatalogItem("/open-houses", locale);
  const response =
    kind === "listing" &&
    listingScope === "homix" &&
    page === 1 &&
    !query.trim() &&
    !hasShareListingFilters(listingFilters) &&
    openHouseItem
      ? {
          ...result,
          items: [
            openHouseItem,
            ...result.items.filter((item) => item.path !== openHouseItem.path),
          ],
        }
      : result;
  return NextResponse.json(response, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
