export type BrokerMarketFilters = {
  city?: string;
  county?: string;
  postalCode?: string;
  zips?: string;
  propertyType?: string;
  propertySubType?: string;
};

export type BrokerMarketSummary = {
  asOf: string;
  periodDays: number;
  trendMonths: number;
  filters: BrokerMarketFilters;
  metrics: {
    currentInventory: number;
    newListings: number;
    closedListings: number;
    medianListPrice: number;
    medianClosePrice: number;
    medianCdom: number;
    saleToListRatio: number;
  };
  trend: Array<{
    month: string;
    newListings: number;
    closedListings: number;
    medianClosePrice: number | null;
  }>;
};

export type BrokerExpiredListing = {
  listingKey: string;
  listingId?: string;
  unparsedAddress?: string;
  city?: string;
  stateOrProvince?: string;
  postalCode?: string;
  countyOrParish?: string;
  listPrice?: number;
  originalListPrice?: number;
  propertyType?: string;
  propertySubType?: string;
  bedroomsTotal?: number;
  bathroomsTotalInteger?: number;
  livingArea?: number;
  daysOnMarket?: number;
  cumulativeDaysOnMarket?: number;
  onMarketDate?: string;
  expirationDate?: string;
  statusChangeTimestamp?: string;
  expiredAt: string;
  listAgentFullName?: string;
  listAgentMlsId?: string;
  listOfficeName?: string;
  listOfficeMlsId?: string;
  thumbnailUrl?: string;
  imageCount: number;
};

export type BrokerExpiredListingsResponse = {
  items: BrokerExpiredListing[];
  count: number;
  hasMore: boolean;
  nextCursor: string;
  limit: number;
  dateFrom: string;
  dateTo: string;
};
