import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  birthdayDate,
  daysBetween,
  nextBirthday,
  nextAnniversary,
  nyDate,
  validBirthday,
  validJoinDate,
} from "../calendar";
import { parseCsv, previewBirthdays, readBirthdayFile } from "../import";
import { inputSchema } from "@/lib/content/validation";
import { buildPosterPrompt } from "@/lib/content/prompts";
import type { BirthdayProfile } from "../data";
import type {
  BrandContext,
  ContentInput,
  TemplateConfig,
} from "@/lib/content/types";
const profiles: BirthdayProfile[] = [1, 2].map((id) => ({
  agentId: id,
  kind: "birthday",
  joinedOn: null,
  name: `Test Agent ${id}`,
  email: `agent${id}@example.test`,
  month: null,
  day: null,
  revision: 0,
  enabled: true,
}));
test("New York calendar date at midnight and DST boundaries", () => {
  assert.equal(nyDate(new Date("2026-09-12T03:59:59Z")), "2026-09-11");
  assert.equal(nyDate(new Date("2026-09-12T04:00:00Z")), "2026-09-12");
  assert.equal(daysBetween("2026-03-07", "2026-03-09"), 2);
  assert.equal(daysBetween("2026-10-31", "2026-11-02"), 2);
});
test("birthday leap day and year rollover", () => {
  assert.equal(birthdayDate(2, 29, 2026), "2026-02-28");
  assert.equal(birthdayDate(2, 29, 2028), "2028-02-29");
  assert.equal(birthdayDate(2, 29, 2100), "2100-02-28");
  assert.equal(nextBirthday(1, 2, "2026-12-28"), "2027-01-02");
  assert.equal(nextBirthday(9, 12, "2026-09-12"), "2026-09-12");
  assert.equal(validBirthday(4, 31), false);
  assert.equal(validBirthday(2, 29), true);
});
test("work anniversaries start at one complete year, including leap day", () => {
  assert.equal(nextAnniversary("2026-09-12", "2026-09-12"), "2027-09-12");
  assert.equal(nextAnniversary("2020-02-29", "2026-02-28"), "2026-02-28");
  assert.equal(validJoinDate("2026-02-30", "2026-09-12"), false);
  assert.equal(validJoinDate("2027-01-01", "2026-09-12"), false);
});
test("CSV quoted cells, BOM, birth year discard, revision snapshot", async () => {
  const sheet = await readBirthdayFile(
    Buffer.from(
      '\uFEFFemail,birthday,note\r\nagent1@example.test,1992-02-29,"hello, colleague"\r\n',
    ),
    "roster.csv",
  );
  const result = previewBirthdays(sheet, profiles);
  assert.deepEqual(result[0].change, {
    agentId: 1,
    kind: "birthday",
    joinedOn: null,
    month: 2,
    day: 29,
    enabled: true,
    revision: 0,
  });
  assert.equal(JSON.stringify(result).includes("1992"), false);
  assert.deepEqual(parseCsv('email,note\na,"one\ntwo"'), [
    ["email", "note"],
    ["a", "one\ntwo"],
  ]);
});
test("ambiguous names, unknown accounts, invalid dates and duplicate identities cannot import", () => {
  assert.throws(() =>
    previewBirthdays(
      [
        ["name", "birthday"],
        ["Test Agent 1", "9/12"],
      ],
      profiles,
    ),
  );
  const result = previewBirthdays(
    [
      ["email", "birthday"],
      ["agent1@example.test", "9/12"],
      ["AGENT1@example.test", "9/13"],
      ["unknown@example.test", "9/12"],
      ["agent2@example.test", "4/31"],
    ],
    profiles,
  );
  assert.equal(result.filter((v) => v.change).length, 0);
  assert.equal(result.filter((v) => v.error).length, 4);
  assert.ok(
    previewBirthdays(
      [
        ["agent_id", "email", "birthday"],
        [1, "agent2@example.test", "9/12"],
      ],
      profiles,
    )[0].error,
  );
});
test("anniversary import requires a real full joining date", () => {
  const p = profiles.map((v) => ({ ...v, kind: "anniversary" as const }));
  const result = previewBirthdays(
    [
      ["email", "joined_on"],
      ["agent1@example.test", "2020-09-12"],
      ["agent2@example.test", "9/12"],
    ],
    p,
    "anniversary",
  );
  assert.equal(result[0].change?.joinedOn, "2020-09-12");
  assert.ok(result[1].error);
});
test("native XLSX parses only first worksheet and real Excel date cells", async () => {
  const bytes = await readFile(
    new URL("./fixtures/roster.xlsx", import.meta.url),
  );
  const rows = previewBirthdays(
    await readBirthdayFile(bytes, "roster.xlsx"),
    profiles,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].change?.month, 2);
  assert.equal(rows[0].change?.day, 29);
  await assert.rejects(() =>
    readBirthdayFile(Buffer.from("invalid"), "bad.xlsx"),
  );
  await assert.rejects(() =>
    readBirthdayFile(Buffer.alloc(2 * 1024 * 1024 + 1), "large.csv"),
  );
});
test("personal generation API cannot request company celebration kinds", () => {
  for (const kind of ["birthday", "anniversary"])
    assert.equal(
      inputSchema.safeParse({
        kind,
        theme: kind,
        language: "zh",
        size: "1024x1280",
        includePortrait: true,
        headline: "Hello",
        message: "",
        additionalInstructions: "",
      }).success,
      false,
    );
});
test("celebration copy distinguishes recipient from company and excludes private contact data", () => {
  const config: TemplateConfig = {
    kind: "birthday",
    name: { en: "Test", zh: "测试" },
    description: { en: "", zh: "" },
    themes: ["birthday"],
    style: "editorial",
    prompt: "Warm paper with {{agent.name}}",
    colors: ["#ffffff", "#000000", "#888888"],
    referenceAssetIds: [],
    sizes: ["1024x1280"],
  };
  const input: ContentInput = {
    kind: "anniversary",
    theme: "anniversary",
    language: "zh",
    size: "1024x1280",
    includePortrait: true,
    headline: "同行 3 周年",
    message: "感谢一路同行",
    additionalInstructions: "",
  };
  const brand: BrandContext = {
    agentId: 1,
    name: "Maya Chen",
    email: "private@example.test",
    phone: "9175550188",
    title: "Agent",
    licenseNumber: "PRIVATE-LICENSE",
    companyId: "homix",
    companyName: "Homix",
    photoUrl: "https://example.test/portrait.png",
  };
  const prompt = buildPosterPrompt(config, input, brand);
  assert.match(prompt, /work anniversary/);
  assert.match(prompt, /FROM the Homix team TO/);
  assert.match(prompt, /同行 3 周年/);
  for (const privateValue of [brand.email, brand.phone, brand.licenseNumber])
    assert.equal(prompt.includes(privateValue), false);
});
