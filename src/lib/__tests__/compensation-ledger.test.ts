import assert from "node:assert/strict";
import { obligationsForAllocation } from "../compensation-ledger";

const rows = obligationsForAllocation({
  id: 7,
  snapshotId: 3,
  agentId: 11,
  teamLeaderAgentId: 22,
  sponsorAgentId: 22,
  agentNet: 8_100,
  teamLeaderAllocation: 900,
  sponsorAmount: 100,
});

assert.deepEqual(rows.map((row) => [row.kind, row.recipientAgentId, row.amountCents]), [
  ["agent_net", 11, 810_000],
  ["team_split", 22, 90_000],
  ["sponsor_reward", 22, 10_000],
]);
assert.equal(rows.filter((row) => row.recipientAgentId === 22).length, 2);

console.log("compensation ledger tests passed");
