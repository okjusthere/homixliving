export type TrainingVideoViewRecord = {
  videoId: number;
  agentId: number | null;
  agentEmail: string;
  agentName: string | null;
  firstViewedAt: string;
  lastViewedAt: string;
  openCount: number;
};

export type TrainingVideoViewSummary = {
  videoId: number;
  viewerCount: number;
  totalOpens: number;
  lastViewedAt: string | null;
  lastViewerName: string | null;
  lastViewerEmail: string | null;
  viewers: TrainingVideoViewRecord[];
};

function time(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function summarizeTrainingVideoViews(
  rows: TrainingVideoViewRecord[]
): TrainingVideoViewSummary[] {
  const grouped = new Map<number, TrainingVideoViewRecord[]>();

  for (const row of rows) {
    const group = grouped.get(row.videoId) || [];
    group.push(row);
    grouped.set(row.videoId, group);
  }

  return Array.from(grouped.entries()).map(([videoId, viewers]) => {
    const sorted = [...viewers].sort(
      (a, b) => time(b.lastViewedAt) - time(a.lastViewedAt)
    );
    const last = sorted[0] || null;

    return {
      videoId,
      viewerCount: sorted.length,
      totalOpens: sorted.reduce((sum, viewer) => sum + Number(viewer.openCount || 0), 0),
      lastViewedAt: last?.lastViewedAt || null,
      lastViewerName: last?.agentName || null,
      lastViewerEmail: last?.agentEmail || null,
      viewers: sorted,
    };
  });
}
