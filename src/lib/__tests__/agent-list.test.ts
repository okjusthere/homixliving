import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agentListReturnUrl,
  matchesAgentSearch,
  moveListItem,
  paginate,
  websiteLinkState,
} from "../agent-list";
import { legacyAdminUrl, adminPathMatches } from "../admin-navigation";

test("search combines identity and verified email terms without matching missing data", () => {
  assert.equal(
    matchesAgentSearch("  MAYA  example.test ", [
      "Maya Chen",
      null,
      "maya@example.test",
    ]),
    true,
  );
  assert.equal(matchesAgentSearch("missing", ["Maya Chen", null]), false);
  assert.equal(matchesAgentSearch("", []), true);
});
test("moving the 70th profile to second keeps every profile including hidden ones", () => {
  const source = Array.from({ length: 81 }, (_, i) => ({
    id: i + 1,
    hidden: i % 5 === 0,
  }));
  const moved = moveListItem(source, 69, 1);
  assert.equal(moved[1].id, 70);
  assert.equal(source[1].id, 2);
  assert.equal(new Set(moved.map((a) => a.id)).size, 81);
  assert.equal(
    moved.filter((a) => a.hidden).length,
    source.filter((a) => a.hidden).length,
  );
  assert.equal(moveListItem(source, -1, 0), source);
  assert.equal(moveListItem(source, 2, 999), source);
  assert.equal(moveListItem(source, 2, NaN), source);
});
test("filters and deletions clamp pagination; arbitrary sizes do not bypass supported options", () => {
  const items = Array.from({ length: 81 }, (_, i) => i);
  assert.deepEqual(paginate(items, "4", "25").items, [75, 76, 77, 78, 79, 80]);
  assert.equal(paginate(items.slice(0, 3), "4", "25").page, 1);
  assert.equal(paginate(items, "bad", "-1").size, 25);
  assert.equal(paginate(items, "8", "all").items.length, 81);
  assert.equal(paginate([], "0", "all").pages, 1);
});
test("broken links and inactive linked accounts are distinct", () => {
  assert.equal(websiteLinkState({ portal_agent_id: null }), "unlinked");
  assert.equal(
    websiteLinkState({ portal_agent_id: 3, linked_portal_agent: null }),
    "broken",
  );
  assert.equal(
    websiteLinkState({
      portal_agent_id: 3,
      linked_portal_agent: {
        id: 3,
        name: "Maya",
        email: "maya@example.test",
        account_status: "inactive",
      },
    }),
    "linked",
  );
});
test("return links preserve list context and cannot leave the allowed admin paths", () => {
  assert.equal(
    agentListReturnUrl("/admin/agents?view=public&q=Maya&page=2"),
    "/admin/agents?view=public&q=Maya&page=2",
  );
  for (const bad of [
    "//evil.test",
    "https://evil.test/admin/agents",
    "/admin/agents/../../settings",
    "/admin/agents\\evil",
    "javascript:alert(1)",
  ])
    assert.equal(agentListReturnUrl(bad), "/admin/agents");
});
test("legacy routes retain repeated query parameters and navigation avoids overlapping settings", () => {
  assert.equal(
    legacyAdminUrl("/admin/agents", {
      view: "public",
      q: "Maya Chen",
      tag: ["one", "two"],
    }),
    "/admin/agents?view=public&q=Maya+Chen&tag=one&tag=two",
  );
  assert.equal(
    adminPathMatches("/admin/settings/access", "/admin/settings"),
    false,
  );
  assert.equal(adminPathMatches("/admin/agents/23", "/admin/agents"), true);
  assert.equal(adminPathMatches("/admin/agents-other", "/admin/agents"), false);
});
