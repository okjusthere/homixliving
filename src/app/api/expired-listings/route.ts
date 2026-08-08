import { NextRequest, NextResponse } from "next/server";
import {
  BboBrokerError,
  getBrokerExpiredListings,
} from "@/lib/bbo-broker";
import { requireActiveAgentApi } from "@/lib/auth-guards";

const ALLOWED_PARAMS = [
  "dateFrom",
  "dateTo",
  "q",
  "city",
  "county",
  "postalCode",
  "propertyType",
  "propertySubType",
  "priceMin",
  "priceMax",
  "cursor",
  "limit",
] as const;

export async function GET(request: NextRequest) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const params = Object.fromEntries(
    ALLOWED_PARAMS.map((key) => [key, request.nextUrl.searchParams.get(key) || undefined]),
  );

  try {
    const payload = await getBrokerExpiredListings(params);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const badRequest = error instanceof BboBrokerError && error.status === 400;
    const status = badRequest ? 400 : 503;
    return NextResponse.json(
      { error: badRequest ? error.message : "Expired listings are temporarily unavailable" },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
