import { fmtMoney, tone } from "@/components/homix/tokens";
import type { CommissionBreakdown } from "@/lib/commission";

type Segment = {
  label: string;
  value: number;
  color: string;
};

export function DealBreakdownBar({
  breakdown,
  showLegend = true,
}: {
  breakdown: CommissionBreakdown;
  showLegend?: boolean;
}) {
  const segments: Segment[] = [
    { label: "Referrer", value: breakdown.referrerCut, color: tone.amber },
    ...breakdown.agents.map((agent, index) => ({
      label: agent.name || `Agent ${index + 1}`,
      value: agent.agentTake,
      color: agent.isPrimary ? tone.green : tone.accent,
    })),
    { label: "Company", value: breakdown.companyPoolTotal, color: tone.ink50 },
  ].filter((segment) => segment.value > 0);

  const total = Math.max(1, breakdown.totalCommission);

  return (
    <div className="min-w-0">
      <div className="h-4 rounded-full overflow-hidden flex" style={{ background: tone.paperDeep }}>
        {segments.length === 0 ? (
          <div style={{ width: "100%", background: tone.paperDeep }} />
        ) : (
          segments.map((segment) => (
            <div
              key={segment.label}
              title={`${segment.label}: $${fmtMoney(segment.value)}`}
              style={{
                width: `${Math.max(2, (segment.value / total) * 100)}%`,
                background: segment.color,
              }}
            />
          ))
        )}
      </div>
      {showLegend && (
        <div className="mt-3 flex min-w-0 flex-wrap gap-x-3 gap-y-2">
          {segments.map((segment) => (
            <div key={segment.label} className="flex min-w-0 items-center gap-2 text-[11.5px]" style={{ color: tone.ink50 }}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: segment.color }} />
              <span className="min-w-0 break-words">{segment.label}</span>
              <span className="shrink-0 font-mono">${fmtMoney(segment.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
