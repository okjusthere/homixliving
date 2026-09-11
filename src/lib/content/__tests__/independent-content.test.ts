import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractPosterHighlights,
  validatePosterHighlights,
} from "../poster-highlights";
import { listingEvent, type StudioListing } from "../listing-source";
const facts = {
  description:
    "Renovated home with private deck. Tax as low as 8K per year; management fee 375 per month.",
};
const result = {
  highlights: [
    { en: "Private deck", zh: "私人露台", evidence: "private deck" },
  ],
  financialFacts: [
    {
      kind: "property_tax",
      en: "Tax from $8,000/year",
      zh: "地税低至 $8,000/年",
      evidence: "Tax as low as 8K per year",
    },
  ],
};
test("extracts supported selling points and rejects invented evidence or changed amounts", () => {
  assert.deepEqual(validatePosterHighlights(result, facts), result);
  assert.throws(
    () =>
      validatePosterHighlights(
        {
          ...result,
          highlights: [{ ...result.highlights[0], evidence: "ocean view" }],
        },
        facts,
      ),
    /source excerpt/,
  );
  assert.throws(
    () =>
      validatePosterHighlights(
        {
          ...result,
          financialFacts: [
            { ...result.financialFacts[0], en: "Tax $6,000/year" },
          ],
        },
        facts,
      ),
    /numeric value/,
  );
});
test("Azure extraction works with Email Service absent and never exposes provider failures", async (t) => {
  const saved = { ...process.env };
  t.after(() => {
    process.env = saved;
  });
  delete process.env.EMAIL_SERVICE_URL;
  delete process.env.EMAIL_SERVICE_HOMIX_SECRET;
  process.env.AZURE_TEXT_ENDPOINT = "https://test.openai.azure.com/openai/v1";
  process.env.AZURE_TEXT_API_KEY = "test-secret";
  process.env.AZURE_TEXT_DEPLOYMENT = "test-text";
  const fetchMock = t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(url, "https://test.openai.azure.com/openai/v1/responses");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "test-text");
    assert.equal(body.store, false);
    assert.match(body.instructions, /not paragraph compression/);
    assert.equal(body.text.format.strict, true);
    return Response.json({
      output: [
        { content: [{ type: "output_text", text: JSON.stringify(result) }] },
      ],
    });
  });
  assert.deepEqual(await extractPosterHighlights(facts), {
    ...result,
    model: "test-text",
  });
  fetchMock.mock.mockImplementation(
    async () => new Response("secret-provider-diagnostics", { status: 500 }),
  );
  await assert.rejects(
    extractPosterHighlights(facts),
    (e) => e instanceof Error && !e.message.includes("secret-provider"),
  );
  process.env.AZURE_TEXT_ENDPOINT = "https://untrusted.example/openai/v1";
  await assert.rejects(
    extractPosterHighlights(facts),
    /Invalid AI configuration/,
  );
});
test("open-house import uses New York local time including DST and rejects overnight events", () => {
  const listing = {
    openHouses: [
      {
        id: "1",
        startsAt: "2026-09-12T17:00:00Z",
        endsAt: "2026-09-12T19:00:00Z",
      },
    ],
  } as StudioListing;
  assert.deepEqual(listingEvent(listing, 0), {
    date: "2026-09-12",
    start: "13:00",
    end: "15:00",
    timezone: "America/New_York",
  });
  listing.openHouses![0] = {
    id: "2",
    startsAt: "2026-12-12T17:00:00Z",
    endsAt: "2026-12-12T19:00:00Z",
  };
  assert.equal(listingEvent(listing, 0)?.start, "12:00");
  assert.equal(listingEvent(listing, Date.parse("2027-01-01")), undefined);
  listing.openHouses![0].endsAt = "2026-12-13T19:00:00Z";
  assert.equal(listingEvent(listing, 0), undefined);
});
