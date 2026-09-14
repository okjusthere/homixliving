import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { initialHolidays, initialTemplates } from "../catalog";
import {
  inputSchema,
  holidaySchema,
  templateConfigSchema,
} from "../validation";
import { buildPosterPrompt, withoutPosterLicense } from "../prompts";
import { generateAzureImage, AzureImageError } from "../azure";
import { requestBytes, RequestBodyTooLarge } from "../request-body";
import type { BrandContext, ContentInput } from "../types";
import { posterLanguages, posterListingFacts } from "../output-plan";

const brand: BrandContext = {
  agentId: 42,
  name: "Test Agent",
  email: "agent@example.com",
  phone: "212-555-0100",
  title: "Agent",
  licenseNumber: "TEST",
  companyId: "homix_realty",
  companyName: "Homix Realty",
  photoUrl: "https://www.homixny.com/portrait.png",
};
const input: ContentInput = {
  kind: "listing",
  theme: "open_house",
  language: "en",
  size: "1024x1280",
  includePortrait: true,
  headline: "Open House / 开放看房",
  message: "",
  additionalInstructions: "",
  listing: {
    source: "manual",
    address: "123 Example Street",
    price: "$500,000",
    imageAssetIds: ["c207609c-3566-49e1-bcfe-4577fe34d945"],
  },
  event: {
    date: "2026-10-10",
    start: "13:00",
    end: "15:00",
    timezone: "America/New_York",
  },
};

test("initial catalog validates and preserves both years' exact lunar dates", () => {
  const templates = initialTemplates(),
    holidays = initialHolidays();
  templates.forEach((t) => templateConfigSchema.parse(t.config));
  holidays.forEach((h) => holidaySchema.parse(h));
  assert.equal(templates.length, 14);
  assert.equal(holidays.length, 31);
  const expected: Record<string, [string, string]> = {
    laba: ["01-26", "01-15"],
    "lunar-new-years-eve": ["02-16", "02-05"],
    "spring-festival": ["02-17", "02-06"],
    "lantern-festival": ["03-03", "02-20"],
    "dragon-boat": ["06-19", "06-09"],
    qixi: ["08-19", "08-08"],
    "mid-autumn": ["09-25", "09-15"],
    "double-ninth": ["10-18", "10-08"],
  };
  for (const [id, dates] of Object.entries(expected))
    for (const [i, year] of [2026, 2027].entries())
      assert.equal(
        holidays.find((h) => h.id === id)?.dates.find((d) => d.year === year)
          ?.date,
        `${year}-${dates[i]}`,
      );
});
test("Open House requires a real date, timezone and increasing time range", () => {
  assert.equal(inputSchema.safeParse(input).success, true);
  for (const event of [
    undefined,
    { ...input.event!, date: "2026-02-30" },
    { ...input.event!, end: "12:59" },
    { ...input.event!, timezone: "Not/A_Zone" },
  ])
    assert.equal(inputSchema.safeParse({ ...input, event }).success, false);
});
test("portrait ordering, single-language output and supplied facts stay explicit", () => {
  const config = initialTemplates().find(
    (t) => t.key === "open_house-editorial",
  )!.config;
  const prompt = buildPosterPrompt(
    { ...config, referenceAssetIds: ["logo-reference"] },
    input,
    brand,
  );
  assert.match(prompt, /English ONLY/);
  assert.match(
    buildPosterPrompt(config, { ...input, language: "zh" }, brand),
    /Simplified Chinese ONLY/,
  );
  assert.match(prompt, /Reference image 1 supplies the portrait only/);
  assert.match(prompt, /never reuse its text, contact details, addresses/);
  assert.match(prompt, /Reference images 2 through 2/);
  assert.match(prompt, /style references only/);
  assert.match(prompt, /123 Example Street/);
  const noFace = buildPosterPrompt(
    config,
    { ...input, includePortrait: false },
    brand,
  );
  assert.match(noFace, /PORTRAIT OVERRIDE/);
  assert.match(noFace, /Reference images 1 through 1/);
  assert.throws(
    () =>
      buildPosterPrompt(
        { ...config, prompt: "{{secret.invalid}}" },
        input,
        brand,
      ),
    /Unsupported template variable/,
  );
});
test("language pairs reserve separate single-language images and topics control factual density", () => {
  assert.deepEqual(posterLanguages(input, ["en", "zh"]), ["zh", "en"]);
  assert.deepEqual(posterLanguages(input), ["en"]);
  assert.throws(() => posterLanguages(input, ["zh", "zh"]));
  assert.equal(
    inputSchema.safeParse({ ...input, language: "bilingual" }).success,
    false,
  );
  const listing = {
    ...input.listing!,
    annualPropertyTax: "$8,000",
    monthlyMaintenanceFee: "$375",
    description: "Private deck",
    beds: "4",
  };
  const detailed = posterListingFacts({
    ...input,
    theme: "just_listed",
    listing,
  });
  assert.ok(detailed && "selectedHighlights" in detailed);
  assert.ok(detailed.selectedHighlights?.includes("Property tax: $8,000 / year"));
  assert.ok(!("annualPropertyTax" in detailed));
  const brief = posterListingFacts({
    ...input,
    theme: "under_contract",
    listing,
  });
  assert.deepEqual(brief, { address: listing.address });
  assert.deepEqual(
    posterListingFacts({ ...input, theme: "just_sold", listing }),
    { address: listing.address, price: listing.price },
  );
  assert.equal(
    inputSchema.safeParse({
      ...input,
      listing: { ...listing, associationFee: "$100" },
    }).success,
    false,
  );
});
test("image prompts receive reviewed localized selling points instead of raw MLS remarks", () => {
  const facts = posterListingFacts({
    ...input,
    language: "zh",
    listing: {
      ...input.listing!,
      description: "Long source text that should never go to the image model",
      highlightsReviewed: true,
      highlights: [
        {
          en: "Private deck",
          zh: "私人露台",
          evidence: "private deck",
          selected: true,
        },
        {
          en: "Unselected",
          zh: "未选卖点",
          evidence: "unselected",
          selected: false,
        },
      ],
      financialFacts: [
        {
          kind: "property_tax",
          en: "Tax from $8,000/year",
          zh: "地税低至 $8,000/年",
          evidence: "tax as low as 8K per year",
          selected: true,
        },
      ],
    },
  });
  assert.ok(facts && "selectedHighlights" in facts);
  assert.deepEqual(facts.selectedHighlights, ["私人露台", "地税低至 $8,000/年"]);
  assert.match(JSON.stringify(facts), /地税低至/);
  assert.doesNotMatch(
    JSON.stringify(facts),
    /Long source text|Private deck|未选卖点/,
  );
});
test("bounded request reader rejects chunked oversized input", async () => {
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(5));
      c.enqueue(new Uint8Array(5));
      c.close();
    },
  });
  const req = new Request("http://localhost", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(requestBytes(req, 8), RequestBodyTooLarge);
  assert.equal(
    new TextDecoder().decode(
      await requestBytes(
        new Request("http://localhost", { method: "POST", body: "abc" }),
        3,
      ),
    ),
    "abc",
  );
});
test("Azure adapter sends references to edits and never retries uncertain calls", async () => {
  const oldFetch = globalThis.fetch,
    old = {
      endpoint: process.env.AZURE_IMAGE_ENDPOINT,
      key: process.env.AZURE_IMAGE_API_KEY,
      deployment: process.env.AZURE_IMAGE_DEPLOYMENT,
    };
  process.env.AZURE_IMAGE_ENDPOINT =
    "https://test.services.ai.azure.com/openai/v1/images/generations";
  process.env.AZURE_IMAGE_API_KEY = "unit-test-key";
  process.env.AZURE_IMAGE_DEPLOYMENT = "gpt-image-2";
  try {
    const png = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.match(String(url), /\/images\/edits/);
      const form = init?.body as FormData;
      assert.equal(form.get("model"), "gpt-image-2");
      assert.equal(form.getAll("image[]").length, 3);
      const logo = form.getAll("image[]").at(-1) as File;
      assert.equal((await sharp(Buffer.from(await logo.arrayBuffer())).metadata()).format, "png");
      assert.match(String(form.get("prompt")), /LAST reference image is the official company logo/);
      assert.equal(form.get("input_fidelity"), null);
      return Response.json(
        {
          data: [{ b64_json: png.toString("base64") }],
          usage: { total_tokens: 1 },
        },
        { headers: { "apim-request-id": "provider-test" } },
      );
    };
    const result = await generateAzureImage("A poster", "1024x1024", [
      png,
      png,
    ]);
    assert.equal(result.requestId, "provider-test");
    assert.equal(calls, 1);
    globalThis.fetch = async () => {
      calls++;
      throw new TypeError("network interrupted");
    };
    await assert.rejects(
      generateAzureImage("A poster", "1024x1024", []),
      (e: unknown) =>
        e instanceof AzureImageError &&
        e.uncertain &&
        e.code === "AZURE_OUTCOME_UNKNOWN",
    );
    assert.equal(calls, 2);
    const oldWarn = console.warn;
    const diagnostics: unknown[][] = [];
    console.warn = (...args: unknown[]) => {
      diagnostics.push(args);
    };
    try {
      globalThis.fetch = async () =>
        Response.json(
          {
            error: {
              code: "invalid_image",
              param: "image[]",
              message: "private prompt must not be logged",
            },
          },
          { status: 400, headers: { "apim-request-id": "rejection-test" } },
        );
      await assert.rejects(
        generateAzureImage("A poster", "1024x1024", []),
        (e: unknown) =>
          e instanceof AzureImageError &&
          !e.uncertain &&
          e.requestId === "rejection-test",
      );
      assert.equal(diagnostics.length, 1);
      assert.match(JSON.stringify(diagnostics), /invalid_image/);
      assert.doesNotMatch(JSON.stringify(diagnostics), /private prompt/);
    } finally {
      console.warn = oldWarn;
    }
    globalThis.fetch = async () =>
      new Response("rate limited", {
        status: 429,
        headers: { "retry-after": "60" },
      });
    await assert.rejects(
      generateAzureImage("A poster", "1024x1024", []),
      (e: unknown) =>
        e instanceof AzureImageError && !e.uncertain && e.retryAfter === 60,
    );
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries({
      AZURE_IMAGE_ENDPOINT: old.endpoint,
      AZURE_IMAGE_API_KEY: old.key,
      AZURE_IMAGE_DEPLOYMENT: old.deployment,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});


test("all selected highlights survive validation and prompts, with costs in the same list", () => {
  const highlights = Array.from({ length: 12 }, (_, i) => ({ en: `Feature ${i + 1}`, zh: `亮点${i + 1}`, evidence: `Feature ${i + 1}`, selected: true }));
  for (const theme of ["just_listed", "open_house", "coming_soon"]) {
    const parsed = inputSchema.parse({ ...input, theme, listing: { ...input.listing, highlights, highlightsReviewed: true } });
    assert.equal(parsed.listing?.highlights?.length, 12);
    assert.equal(posterListingFacts(parsed)?.selectedHighlights?.length, 12);
  }
  const facts = posterListingFacts({ ...input, listing: { ...input.listing!, highlights, annualPropertyTax: "$8,000", monthlyMaintenanceFee: "$375", associationFee: "$100", associationFeeFrequency: "Monthly", financialFacts: [
    { kind: "property_tax", en: "Old tax $7,000/year", zh: "旧地税", evidence: "Old tax $7,000/year", selected: true },
    { kind: "other", en: "Utilities included", zh: "包含水电", evidence: "Utilities included", selected: true },
    { kind: "other", en: "Deselected cost", zh: "未选费用", evidence: "Deselected cost", selected: false },
  ] } });
  assert.equal(facts?.selectedHighlights?.length, 16);
  assert.match(JSON.stringify(facts), /Property tax: \$8,000 \/ year/);
  assert.match(JSON.stringify(facts), /Maintenance: \$375 \/ month/);
  assert.match(JSON.stringify(facts), /HOA fee: \$100 \/ month/);
  assert.doesNotMatch(JSON.stringify(facts), /selectedFinancialFacts|annualPropertyTax|Old tax|Deselected cost/);
});

test("every theme and language gets the exact integrated company footer without a license number", () => {
  const license = "10401387364";
  for (const { config } of initialTemplates()) {
    for (const language of ["zh", "en"] as const) {
      const prompt = buildPosterPrompt(config, { ...input, kind: config.kind, theme: config.themes[0], language }, { ...brand, licenseNumber: license });
      assert.match(prompt, /Homix Realty \| 3720 Prince St, STE3H, Flushing \| www\.homixny\.com/);
      assert.match(prompt, /very bottom INSIDE the poster/);
      assert.doesNotMatch(prompt, /licenseNumber|10401387364/);
    }
  }
  assert.doesNotMatch(withoutPosterLicense(`Saved {"licenseNumber":"${license}","name":"Agent"} Also ${license}`, license), /licenseNumber|10401387364/);
});
