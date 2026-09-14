import assert from "node:assert/strict";
import { test } from "node:test";
import { initialTemplates } from "../catalog";
import { LISTING_THEMES, type ContentTemplate } from "../types";
import { chooseStudioTemplate, orderStudioTemplates } from "../template-choice";

const templates: ContentTemplate[] = initialTemplates().map(({ key, config }) => ({
  id: key, familyId: key, version: 2, status: "published", config, createdAt: "2026-09-14",
}));

test("every listing theme offers exactly two styles with Classic first regardless of API order", () => {
  for (const theme of LISTING_THEMES) {
    const applicable = orderStudioTemplates(templates.filter((t) => t.config.themes.includes(theme.id)).reverse());
    assert.deepEqual(applicable.map((t) => t.config.name.zh.split(" · ").at(-1)), ["Homix 经典", "Homix 极简"]);
    assert.equal(chooseStudioTemplate(applicable, templates, "retired-id")?.config.style, "editorial");
  }
  assert.deepEqual(orderStudioTemplates(templates.filter((t) => t.config.kind === "holiday").reverse()).map((t) => t.config.style), ["minimal", "festive"]);
});

test("switching themes keeps a chosen style; an unavailable old version safely falls back", () => {
  const applicable = orderStudioTemplates(templates.filter((t) => t.config.themes.includes("open_house")));
  assert.equal(chooseStudioTemplate(applicable, templates, "just_listed-modern")?.id, "open_house-modern");
  assert.equal(chooseStudioTemplate(applicable, templates, "retired-luxury")?.id, "open_house-editorial");
  assert.equal(chooseStudioTemplate([], templates, "just_listed-modern"), undefined);
});
