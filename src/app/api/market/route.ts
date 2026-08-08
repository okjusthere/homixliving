import { NextRequest, NextResponse } from "next/server";
import {
  BboBrokerError,
  getBrokerMarketSummary,
} from "@/lib/bbo-broker";
import { requireActiveAgentApi } from "@/lib/auth-guards";

const ALLOWED_PARAMS = [
  "periodDays",
  "trendMonths",
  "city",
  "county",
  "postalCode",
  "zips",
  "propertyType",
  "propertySubType",
] as const;

export async function GET(request: NextRequest) {
  const authResult = await requireActiveAgentApi();
  if ("error" in authResult) return authResult.error;

  const params = Object.fromEntries(
    ALLOWED_PARAMS.map((key) => [key, request.nextUrl.searchParams.get(key) || undefined]),
  );

  try {
    const payload = await getBrokerMarketSummary(params);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const badRequest = error instanceof BboBrokerError && error.status === 400;
    const status = badRequest ? 400 : 503;
    return NextResponse.json(
      { error: badRequest ? error.message : "Market data is temporarily unavailable" },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
