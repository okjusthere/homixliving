import assert from "node:assert/strict";
import { test } from "node:test";
import { contentStorageConfig } from "../storage-config";

test("dedicated content credentials are selected as a pair", () => {
  const legacy = {
    R2_ACCOUNT_ID: "account",
    R2_CONTENT_BUCKET_NAME: "content-only",
    R2_ACCESS_KEY_ID: "legacy-access",
    R2_SECRET_ACCESS_KEY: "legacy-secret",
  };
  assert.deepEqual(contentStorageConfig(legacy)?.credentials, {
    accessKeyId: "legacy-access",
    secretAccessKey: "legacy-secret",
  });
  for (const partial of [
    { R2_CONTENT_ACCESS_KEY_ID: "content-access" },
    { R2_CONTENT_SECRET_ACCESS_KEY: "content-secret" },
  ]) {
    assert.equal(contentStorageConfig({ ...legacy, ...partial }), null);
  }
  assert.deepEqual(
    contentStorageConfig({
      ...legacy,
      R2_CONTENT_ACCESS_KEY_ID: "content-access",
      R2_CONTENT_SECRET_ACCESS_KEY: "content-secret",
    }),
    {
      account: "account",
      bucket: "content-only",
      credentials: {
        accessKeyId: "content-access",
        secretAccessKey: "content-secret",
      },
    },
  );
  assert.equal(contentStorageConfig({ ...legacy, R2_CONTENT_BUCKET_NAME: "" }), null);
});
