import "server-only";
import { createHash } from "node:crypto";
import { homixwebBase, homixwebSecret } from "@/lib/homixweb";
import { ContentError, query, templateColumns } from "./store";
import { companyOpenHouseCandidates, type OpenHouseAgent, type CompanyOpenHouse } from "./company-open-house";
import type { StudioListing, StudioListingPage } from "./listing-source";
import { listingEvents } from "./listing-source";
import { officeTemplate } from "./office-production";
import type { ContentTemplate } from "./types";

async function websiteListings(params: URLSearchParams) {
  if (!homixwebSecret()) throw new ContentError("房源服务尚未配置", 503);
  try {
    const response = await fetch(`${homixwebBase()}/api/portal/listings?${params}`, {
      headers: { authorization: `Bearer ${homixwebSecret()}` },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error();
    return await response.json();
  } catch { throw new ContentError("公展房源暂时读取失败，请点击刷新重试。", 503); }
}
export async function companyOpenHouseCatalog(): Promise<{ items: CompanyOpenHouse[]; template: ContentTemplate }> {
  const templates = await query<ContentTemplate>(`SELECT ${templateColumns} FROM portal.content_templates WHERE status='published' ORDER BY version DESC`);
  const template = officeTemplate(templates, "open_house", "editorial");
  const agents = await query<OpenHouseAgent>(`SELECT a.id,a.name,p.mls_id AS "mlsId",p.photo_url AS "photoUrl",COALESCE(c.is_active,false) AS "companyReady"
    FROM public.agents p JOIN portal.agents a ON a.id=p.portal_agent_id
    LEFT JOIN portal.licensed_companies c ON c.id=a.licensed_company_id
    WHERE a.account_status='active' AND NULLIF(trim(p.mls_id),'') IS NOT NULL`);
  const listings: StudioListing[] = [];
  // Read every page: an Open House may belong to an older listing, not page 1.
  for (let page = 1; page <= 100; page++) {
    const result = await websiteListings(new URLSearchParams({ scope: "homix", page: String(page) })) as StudioListingPage;
    if (!Array.isArray(result.listings)) throw new ContentError("房源数据格式不正确，请稍后刷新。", 503);
    listings.push(...result.listings);
    if (!result.hasMore) break;
    if (page === 100) throw new ContentError("公司房源尚未读取完整，请联系管理员检查房源接口分页。", 503);
  }
  // Hydrate the eligible summaries with full remarks, photos and all sessions.
  const candidates = listings.filter((l) => listingEvents(l).length > 0);
  const details: StudioListing[] = [];
  for (let i = 0; i < candidates.length; i += 4) {
    details.push(...await Promise.all(candidates.slice(i, i + 4).map(async (l) => {
      const data = await websiteListings(new URLSearchParams({ slug: l.slug, scope: "homix" }));
      if (!data.listing || data.listing.id !== l.id) throw new ContentError("房源资料已变化，请刷新后重试。", 409);
      return data.listing as StudioListing;
    })));
  }
  const items = companyOpenHouseCandidates(details, agents).map((item) => ({ ...item,
    key: createHash("sha256").update(JSON.stringify({
      version: 1, templateId: template.id, agentId: item.agent?.id,
      listingId: item.listing.id, events: item.events, description: item.listing.description,
      address: item.listing.address.full, price: item.listing.askingPrice,
      beds: item.listing.beds, baths: item.listing.baths, halfBaths: item.listing.halfBaths, sqft: item.listing.sqft,
      photo: item.listing.photos[0]?.url, portrait: item.agent?.photoUrl,
      annualPropertyTax: item.listing.annualPropertyTax, monthlyMaintenanceFee: item.listing.monthlyMaintenanceFee,
      associationFee: item.listing.associationFee, associationFeeFrequency: item.listing.associationFeeFrequency,
    })).digest("hex"),
  }));
  return { items, template };
}
