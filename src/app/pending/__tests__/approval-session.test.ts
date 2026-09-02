import assert from "node:assert/strict";
import test from "node:test";
import { refreshApprovalSession } from "../approval-session";

test("approval refresh sends data so Auth.js performs a session update", async () => {
  let request: unknown;
  const refreshedSession = { user: { accountStatus: "active" } };

  const result = await refreshApprovalSession(async (data) => {
    request = data;
    return refreshedSession;
  });

  assert.deepEqual(request, { approvalCheck: true });
  assert.equal(result, refreshedSession);
});
