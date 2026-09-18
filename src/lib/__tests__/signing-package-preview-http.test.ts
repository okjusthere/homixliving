import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Exercise the real route's authorization and forwarding with no database or
// external provider. Other signing integration tests own those dependencies.
const state = {
  authStatus: 200,
  company: "homix_living",
  catalog: [] as unknown[],
  reads: [] as string[],
};
Object.assign(globalThis, { __signingPreviewTest: state });
const ready = import(
  pathToFileURL(path.join(__dirname, "fixtures/signing-preview-hook.mjs")).href
);
const id = "00000000-0000-4000-8000-000000000001";
const item = (company = "homix_living", scenario = "seller") => ({
  id,
  scenario,
  company_key: company,
  applicable_company_keys: [company],
  definition: [{ files: [{ title: "Approved PDF", hash: "qa" }] }],
});
const get = async (query = "partIndex=0&fileIndex=0") => {
  await ready;
  const { GET } = await import("../../app/api/signing/[...path]/route");
  const result = await GET(
    new Request(`http://localhost/api/signing/packages/${id}/files?${query}`),
    { params: Promise.resolve({ path: ["packages", id, "files"] }) },
  );
  assert(result);
  return result;
};

test("catalog preview enforces active membership and forwards only approved file coordinates", async () => {
  state.catalog = [item()];
  for (const status of [401, 403]) {
    state.authStatus = status;
    assert.equal((await get()).status, status);
  }
  assert.equal(state.reads.length, 0);
  state.authStatus = 200;
  // Preview does not need a legal name, recipient email, contract values or a draft.
  let response = await get();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "%PDF-1.7 SYNTHETIC");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(
    state.reads.at(-1),
    `/v1/packages/${id}/files?partIndex=0&fileIndex=0`,
  );
  // Even an admin in the agent workspace cannot bypass their actual company.
  for (const catalog of [
    [item("homix_realty")],
    [item("homix_living", "onboarding")],
    [],
  ]) {
    state.catalog = catalog;
    state.reads = [];
    response = await get();
    assert.equal(response.status, 404);
    assert.deepEqual(state.reads, ["/v1/packages"]);
  }
  state.catalog = [item()];
  state.reads = [];
  for (const q of [
    "partIndex=-1&fileIndex=0",
    "partIndex=0&fileIndex=1.5",
    "fileIndex=0",
    "partIndex=0&fileIndex=101",
  ])
    assert.equal((await get(q)).status, 400);
  assert.equal(state.reads.length, 0);
  assert.equal((await get("partIndex=1&fileIndex=0")).status, 404);
  assert.equal((await get("partIndex=0&fileIndex=1")).status, 404);
  assert.equal(
    state.reads.some((p) => p.includes("/files")),
    false,
  );
});
