import type { OpenHouseEvent } from "./types";
/** Website listing contract. Content Studio and Share Center share the BBO provider. */
export type StudioListing = {
  id: string;
  slug: string;
  mlsNumber: string;
  status: string;
  address: { full: string };
  listPrice: number;
  askingPrice?: number;
  closePrice?: number;
  beds: number;
  baths: number;
  halfBaths?: number;
  sqft: number;
  description: string;
  photos: { url: string; alt?: string }[];
  annualPropertyTax?: string;
  monthlyMaintenanceFee?: string;
  associationFee?: string;
  associationFeeFrequency?: string;
  attribution?: string;
  openHouses?: { id: string; startsAt: string; endsAt: string }[];
};
export type StudioListingPage = {
  listings: StudioListing[];
  page: number;
  hasMore: boolean;
};
export function listingEvents(
  listing: StudioListing,
  now = Date.now(),
): OpenHouseEvent[] {
  const source = (listing.openHouses || [])
    .filter(
      (e) =>
        Number.isFinite(Date.parse(e.startsAt)) &&
        Date.parse(e.endsAt) > now &&
        Date.parse(e.endsAt) > Date.parse(e.startsAt),
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const parts = (date: string) =>
    Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(date))
        .map((p) => [p.type, p.value]),
    );
  const seen = new Set<string>();
  return source.flatMap((event) => {
    const start = parts(event.startsAt),
      end = parts(event.endsAt);
    if (
      start.year !== end.year ||
      start.month !== end.month ||
      start.day !== end.day
    )
      return [];
    const session = {
      date: `${start.year}-${start.month}-${start.day}`,
      start: `${start.hour}:${start.minute}`,
      end: `${end.hour}:${end.minute}`,
      timezone: "America/New_York",
    };
    const key = JSON.stringify(session);
    if (seen.has(key)) return [];
    seen.add(key);
    return [session];
  });
}

/** Backwards-compatible helper for older integrations. */
export function listingEvent(listing: StudioListing, now = Date.now()) {
  return listingEvents(listing, now)[0];
}
