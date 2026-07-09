import assert from "node:assert/strict";
import { summarizeTrainingVideoViews } from "../training-views";

async function main() {
  const summaries = summarizeTrainingVideoViews([
    {
      videoId: 1,
      agentId: 10,
      agentEmail: "sunny@homixny.com",
      agentName: "Sunny Zhang",
      firstViewedAt: "2026-07-08T10:00:00.000Z",
      lastViewedAt: "2026-07-09T15:42:00.000Z",
      openCount: 4,
    },
    {
      videoId: 1,
      agentId: 11,
      agentEmail: "grace@homixny.com",
      agentName: "Grace Li",
      firstViewedAt: "2026-07-08T11:00:00.000Z",
      lastViewedAt: "2026-07-08T11:00:00.000Z",
      openCount: 1,
    },
    {
      videoId: 2,
      agentId: null,
      agentEmail: "external@homixny.com",
      agentName: null,
      firstViewedAt: "2026-07-09T09:00:00.000Z",
      lastViewedAt: "2026-07-09T09:00:00.000Z",
      openCount: 1,
    },
  ]);

  const first = summaries.find((summary) => summary.videoId === 1);
  assert.equal(first?.viewerCount, 2);
  assert.equal(first?.totalOpens, 5);
  assert.equal(first?.lastViewerName, "Sunny Zhang");
  assert.equal(first?.viewers[0].agentEmail, "sunny@homixny.com");

  const second = summaries.find((summary) => summary.videoId === 2);
  assert.equal(second?.viewerCount, 1);
  assert.equal(second?.lastViewerName, null);
  assert.equal(second?.lastViewerEmail, "external@homixny.com");

  console.log("training views tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
