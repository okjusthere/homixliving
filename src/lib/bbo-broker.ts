import "server-only";

import type {
  BrokerExpiredListingsResponse,
  BrokerMarketSummary,
} from "@/lib/bbo-broker-types";

const DEFAULT_BBO_API_URL = "https://onekey.kevv.ai";

export class BboBrokerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BboBrokerError";
  }
}

type QueryValue = string | number | undefined;

async function brokerFetch<T>(
  path: string,
  params: Record<string, QueryValue>,
  revalidate: number,
): Promise<T> {
  const apiKey = process.env.BBO_BROKER_API_KEY?.trim();
  if (!apiKey) {
    throw new BboBrokerError("BBO broker API is not configured", 503);
  }

  const baseUrl = (process.env.BBO_API_URL?.trim() || DEFAULT_BBO_API_URL).replace(/\/$/, "");
  const url = new URL(path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && String(value).trim() !== "") {
      url.searchParams.set(key, String(value).trim());
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "force-cache",
      next: { revalidate },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    console.error("BBO broker request failed", error);
    throw new BboBrokerError("BBO broker service is unavailable", 503);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null) as
      | { message?: string; error?: string }
      | null;
    const message = body?.message || body?.error || `BBO request failed (${response.status})`;
    console.error("BBO broker response failed", {
      path,
      status: response.status,
      message,
    });
    throw new BboBrokerError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export function getBrokerMarketSummary(params: Record<string, QueryValue>) {
  return brokerFetch<BrokerMarketSummary>(
    "/api/v1/broker/market-summary",
    params,
    15 * 60,
  );
}

export function getBrokerExpiredListings(params: Record<string, QueryValue>) {
  return brokerFetch<BrokerExpiredListingsResponse>(
    "/api/v1/broker/expired-listings",
    params,
    5 * 60,
  );
}
