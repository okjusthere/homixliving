import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { NextRequest } from "next/server";
import { curatedShareCatalogItem, fetchShareCatalog, type ShareCatalogResult } from "../homixweb";
import {
  hasShareListingFilters,
  parseShareListingFilters,
  serializeShareListingFilters,
} from "../share-listing-filters";

const chinese = curatedShareCatalogItem("/zh/open-houses?from=portal", "zh");
assert.ok(chinese);
assert.equal(chinese.kind, "listing");
assert.equal(chinese.key, "open-houses");
assert.equal(chinese.path, "/open-houses");
assert.equal(chinese.title, "Homix 本周开放日");
assert.match(chinese.image || "", /^https?:\/\//);

const english = curatedShareCatalogItem("/open-houses", "en");
assert.ok(english);
assert.equal(english.title, "Homix Open Houses This Week");

assert.equal(curatedShareCatalogItem("/listings/example", "zh"), null);

const parsed = parseShareListingFilters(new URLSearchParams({
  city: " Garden City ", propertyType: "Condo", minPrice: "500000.50",
  maxPrice: "1250000", beds: "3", sort: "price-asc",
}));
assert.deepEqual(parsed, { ok: true, filters: {
  city: "Garden City", propertyType: "Condo", minPrice: 500000.5,
  maxPrice: 1250000, beds: 3, sort: "price-asc",
} });
assert.ok(parsed.ok);
const filters = parsed.filters;
assert.deepEqual(parseShareListingFilters(serializeShareListingFilters(filters)), parsed);
assert.deepEqual(parseShareListingFilters(new URLSearchParams("city=+&minPrice=&beds=")), {
  ok: true, filters: { sort: "newest" },
});
assert.equal(hasShareListingFilters({ sort: "newest", minPrice: 0, beds: 0 }), false);
assert.equal(hasShareListingFilters({ maxPrice: 0 }), true);
assert.equal(hasShareListingFilters({ sort: "price-desc" }), true);

const invalidFilters: Array<Record<string, string>> = [
  { city: "a".repeat(101) }, { propertyType: "unknown" },
  { minPrice: "-1" }, { maxPrice: "Infinity" }, { minPrice: "NaN" },
  { minPrice: "0x100" }, { minPrice: "5e5" }, { minPrice: "1,000" },
  { minPrice: "999", maxPrice: "100" }, { beds: "2.5" },
  { beds: "-1" }, { beds: "21" }, { sort: "random" },
];
for (const invalid of invalidFilters) {
  assert.equal(parseShareListingFilters(new URLSearchParams(invalid)).ok, false);
}
assert.equal(parseShareListingFilters(new URLSearchParams("beds=20&minPrice=0&maxPrice=0")).ok, true);

async function main() {
  const originalFetch = globalThis.fetch;
  const priorSecret = process.env.AGENTS_REVALIDATE_SECRET;
  const priorUrl = process.env.HOMIXWEB_REVALIDATE_URL;
  process.env.AGENTS_REVALIDATE_SECRET = "synthetic-offline-test";
  process.env.HOMIXWEB_REVALIDATE_URL = "https://website.example.invalid/api/revalidate-agents";
  const outbound: Array<{ url: URL; init?: RequestInit }> = [];
  const catalog: ShareCatalogResult = {
    items: [{ kind: "listing", key: "1", path: "/listings/1", title: "Home",
      subtitle: "Garden City · Condo", image: null, price: 725000 }],
    total: 1, page: 1, pageSize: 12, hasMore: false,
    totalIsEstimate: false, overview: false, counts: { listing: 1 },
  };
  let upstreamResult = catalog;
  let upstreamStatus = 200;
  let upstreamThrows = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://website.example.invalid");
    outbound.push({ url, init });
    if (upstreamThrows) throw new Error("Simulated offline service");
    return Response.json(upstreamResult, { status: upstreamStatus });
  };

  // Replace only route dependencies that require a session/database. The real
  // route and real website fetch implementation execute against mocked HTTP.
  const requireForTest = createRequire(`${process.cwd()}/package.json`);
  const restoredModules = new Map<string, NodeModule | undefined>();
  function mockModule(relativePath: string, exports: unknown) {
    const filename = requireForTest.resolve(relativePath);
    restoredModules.set(filename, requireForTest.cache[filename]);
    const stub = new Module(filename);
    stub.filename = filename;
    stub.loaded = true;
    stub.exports = exports;
    requireForTest.cache[filename] = stub;
  }
  let authorized = true;
  mockModule("./src/lib/auth-guards.ts", {
    requireActiveAgentApi: async () => authorized
      ? { session: { user: { agentId: 101 } } }
      : { error: Response.json({ error: "Unauthorized" }, { status: 401 }) },
  });
  mockModule("./src/lib/share-center.ts", {
    isShareKind: (value: string) => ["listing", "neighborhood", "community", "development", "market", "guide", "news"].includes(value),
    isShareLocale: (value: string) => value === "en" || value === "zh",
  });

  try {
    const fetched = await fetchShareCatalog({
      kind: "listing", locale: "en", query: " 11530 ", listingScope: "all",
      page: 2, listingFilters: filters,
    });
    assert.equal(fetched?.items[0].price, 725000);
    assert.deepEqual(Object.fromEntries(outbound[0].url.searchParams), {
      kind: "listing", locale: "en", page: "2", pageSize: "12", listingScope: "all",
      q: "11530", city: "Garden City", propertyType: "Condo", minPrice: "500000.5",
      maxPrice: "1250000", beds: "3", sort: "price-asc",
    });
    assert.equal(outbound[0].init?.cache, "no-store");
    assert.equal(new Headers(outbound[0].init?.headers).get("authorization"), "Bearer synthetic-offline-test");

    await fetchShareCatalog({ kind: "guide", locale: "zh", listingFilters: filters });
    const guideParams = outbound.at(-1)!.url.searchParams;
    for (const key of ["city", "propertyType", "minPrice", "maxPrice", "beds", "sort"]) {
      assert.equal(guideParams.has(key), false, `${key} must not constrain other content`);
    }

    const { GET: actualGet } = requireForTest("./src/app/api/share/catalog/route.ts") as typeof import("../../app/api/share/catalog/route");
    async function GET(request: NextRequest) {
      const response = await actualGet(request);
      assert.ok(response);
      return response;
    }
    const request = (params: URLSearchParams | string) => new NextRequest(`http://localhost/api/share/catalog?${params}`);
    const routeParams = serializeShareListingFilters(filters);
    routeParams.set("kind", "listing");
    routeParams.set("locale", "en");
    const filtered = await GET(request(routeParams));
    assert.equal(filtered.status, 200);
    assert.equal(filtered.headers.get("cache-control"), "private, no-store");
    assert.deepEqual((await filtered.json()).items, catalog.items, "filtered results never contain an unrelated curated card");
    assert.equal(outbound.at(-1)!.url.searchParams.get("city"), "Garden City");
    assert.equal(outbound.at(-1)!.url.searchParams.get("minPrice"), "500000.5");
    assert.equal(outbound.at(-1)!.url.searchParams.get("beds"), "3");

    const unfiltered = await GET(request("kind=listing&sort=newest"));
    assert.equal((await unfiltered.json()).items[0].path, "/open-houses");
    for (const query of ["sort=price-asc", "city=Garden+City", "q=11530", "propertyType=Condo", "minPrice=500000", "maxPrice=800000", "beds=2", "page=2", "listingScope=all"]) {
      const response = await GET(request(`kind=listing&${query}`));
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).items, catalog.items, query);
    }

    for (const invalid of invalidFilters) {
      const params = new URLSearchParams(invalid);
      params.set("kind", "listing");
      const before = outbound.length;
      assert.equal((await GET(request(params))).status, 400);
      assert.equal(outbound.length, before, "invalid filters must not reach the upstream catalog");
    }
    assert.equal((await GET(request("kind=guide&minPrice=invalid"))).status, 200);
    assert.equal(outbound.at(-1)!.url.searchParams.has("minPrice"), false);

    upstreamResult = { ...catalog, unavailable: true, items: [] };
    assert.equal((await GET(request("kind=listing"))).status, 502, "unavailable upstream cannot be disguised by a curated card");
    upstreamStatus = 503;
    assert.equal((await GET(request("kind=listing"))).status, 502);
    upstreamThrows = true;
    assert.equal((await GET(request("kind=listing"))).status, 502);
    authorized = false;
    const before = outbound.length;
    assert.equal((await GET(request("kind=listing"))).status, 401);
    assert.equal(outbound.length, before);
  } finally {
    globalThis.fetch = originalFetch;
    if (priorSecret === undefined) delete process.env.AGENTS_REVALIDATE_SECRET;
    else process.env.AGENTS_REVALIDATE_SECRET = priorSecret;
    if (priorUrl === undefined) delete process.env.HOMIXWEB_REVALIDATE_URL;
    else process.env.HOMIXWEB_REVALIDATE_URL = priorUrl;
    for (const [filename, original] of restoredModules) {
      if (original) requireForTest.cache[filename] = original;
      else delete requireForTest.cache[filename];
    }
  }
  console.log("share catalog tests passed");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
