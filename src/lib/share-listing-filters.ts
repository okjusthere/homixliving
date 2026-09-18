export const SHARE_LISTING_PROPERTY_TYPES = [
  "Single Family",
  "Condo",
  "Co-op",
  "Townhouse",
  "Multi-Family",
  "Land",
  "Residential",
] as const;

export const SHARE_LISTING_SORTS = [
  "newest",
  "price-asc",
  "price-desc",
  "beds-desc",
] as const;

export type ShareListingFilters = {
  city?: string;
  propertyType?: (typeof SHARE_LISTING_PROPERTY_TYPES)[number];
  minPrice?: number;
  maxPrice?: number;
  beds?: number;
  sort?: (typeof SHARE_LISTING_SORTS)[number];
};

type FilterParseResult =
  | { ok: true; filters: ShareListingFilters }
  | { ok: false; error: string };

/** Shared by the portal form and API so invalid ranges never reach the catalog. */
export function parseShareListingFilters(params: URLSearchParams): FilterParseResult {
  const filters: ShareListingFilters = { sort: "newest" };
  const city = params.get("city")?.trim();
  if (city && city.length > 100) return { ok: false, error: "Invalid city" };
  if (city) filters.city = city;

  const propertyType = params.get("propertyType")?.trim();
  if (propertyType) {
    if (!(SHARE_LISTING_PROPERTY_TYPES as readonly string[]).includes(propertyType)) {
      return { ok: false, error: "Invalid property type" };
    }
    filters.propertyType = propertyType as ShareListingFilters["propertyType"];
  }

  for (const key of ["minPrice", "maxPrice"] as const) {
    const raw = params.get(key)?.trim();
    if (!raw) continue;
    const value = Number(raw);
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) || !Number.isFinite(value) || value < 0) {
      return { ok: false, error: "Invalid price" };
    }
    filters[key] = value;
  }
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) {
    return { ok: false, error: "Minimum price cannot exceed maximum price" };
  }

  const beds = params.get("beds")?.trim();
  if (beds) {
    const value = Number(beds);
    if (!/^\d+$/.test(beds) || !Number.isInteger(value) || value < 0 || value > 20) {
      return { ok: false, error: "Invalid bedroom count" };
    }
    filters.beds = value;
  }

  const sort = params.get("sort")?.trim();
  if (sort) {
    if (!(SHARE_LISTING_SORTS as readonly string[]).includes(sort)) {
      return { ok: false, error: "Invalid sort order" };
    }
    filters.sort = sort as ShareListingFilters["sort"];
  }
  return { ok: true, filters };
}

export function serializeShareListingFilters(filters: ShareListingFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.city?.trim()) params.set("city", filters.city.trim());
  if (filters.propertyType) params.set("propertyType", filters.propertyType);
  for (const key of ["minPrice", "maxPrice", "beds"] as const) {
    if (filters[key] !== undefined) params.set(key, String(filters[key]));
  }
  if (filters.sort && filters.sort !== "newest") params.set("sort", filters.sort);
  return params;
}

/** The curated open-house schedule does not belong in filtered or sorted results. */
export function hasShareListingFilters(filters?: ShareListingFilters): boolean {
  return Boolean(
    filters && (
      filters.city?.trim() || filters.propertyType ||
      (filters.minPrice !== undefined && filters.minPrice > 0) ||
      filters.maxPrice !== undefined ||
      (filters.beds !== undefined && filters.beds > 0) ||
      (filters.sort && filters.sort !== "newest")
    ),
  );
}
