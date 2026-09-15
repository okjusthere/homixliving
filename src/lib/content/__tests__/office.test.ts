import assert from "node:assert/strict";
import { test } from "node:test";
import { inputSchema } from "../validation";
import { buildPosterPrompt } from "../prompts";
import { initialTemplates } from "../catalog";
import { crc32, posterFilename, zipImages } from "../zip";
import type { ContentInput, BrandContext } from "../types";

const brand: BrandContext = { agentId: 3, name: "Grace Xia", email: "grace@example.test", phone: "212-555-0100", title: "Agent", licenseNumber: "123456789", companyId: "homix", companyName: "Homix Realty Inc.", photoUrl: "https://www.homixny.com/portrait.png" };
const input: ContentInput = { kind: "custom", theme: "custom", language: "zh", size: "1024x1280", includePortrait: true, headline: "春日问候", message: "", additionalInstructions: "", stylePrompt: "蓝色水彩背景，手绘花卉，姓名位于右下角。", referenceAssetIds: [] };
test("Other accepts a creative brief without listing/holiday fields; empty prompt identifies the remedy", () => {
  assert.equal(inputSchema.parse({ ...input, listing: { address: "" }, events: [{ date: "" }] }).kind, "custom");
  const result = inputSchema.safeParse({ ...input, stylePrompt: " " });
  assert.equal(result.success, false);
  if (!result.success) assert.match(result.error.issues[0].message, /请填写这张海报的提示词/);
});
test("freeform has no classic palette but keeps exact name, real portrait, official logo and single language", () => {
  const p = buildPosterPrompt(initialTemplates()[0].config, input, brand);
  assert.match(p, /蓝色水彩背景/);
  assert.doesNotMatch(p, /#F7F3EB|matte champagne|123456789/);
  assert.match(p, /NO imposed house style/);
  assert.match(p, /Grace Xia/);
  assert.match(p, /Never append a Chinese name/);
  assert.match(p, /LAST image is the official company logo/);
  assert.match(p, /not a bilingual image/);
});
test("one-off prompt replaces style direction but preserves approved listing identity rules", () => {
  const template = initialTemplates().find((v) => v.config.themes.includes("just_listed"))!;
  const listing: ContentInput = { ...input, kind: "listing", theme: "just_listed", stylePrompt: "A cobalt blue editorial composition", listing: { source: "manual", address: "123 Test Street", price: "$500,000", imageAssetIds: [] }, representationRole: "buyer" };
  const p = buildPosterPrompt(template.config, listing, brand);
  assert.match(p, /ART DIRECTION:\nA cobalt blue editorial composition/);
  assert.match(p, /REPRESENTATION: buyer/);
  assert.match(p, /Grace Xia/);
  assert.match(p, /never claim the Agent listed this property/);
});
test("ZIP stores UTF-8 filenames and valid CRC/offsets without unsafe path names", async () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  const name = posterFilename("Grace Xia", "测试 / 地址", "just_listed", "zh", "abcdef12-1234");
  assert.doesNotMatch(name, /[/\\]/);
  const chunks: Buffer[] = [];
  for await (const chunk of zipImages([{ name, bytes: async () => Buffer.from("123456789") }])) chunks.push(chunk);
  const zip = Buffer.concat(chunks);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt32LE(14), 0xcbf43926);
  assert.equal(zip.subarray(30, 30 + zip.readUInt16LE(26)).toString(), name);
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  assert.equal(zip.readUInt16LE(end + 10), 1);
  assert.equal(zip.readUInt32LE(zip.readUInt32LE(end + 16)), 0x02014b50);
});
