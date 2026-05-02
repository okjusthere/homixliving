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
    <div>
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
        <div className="mt-3 flex flex-wrap gap-3">
          {segments.map((segment) => (
            <div key={segment.label} className="flex items-center gap-2 text-[11.5px]" style={{ color: tone.ink50 }}>
              <span className="w-2 h-2 rounded-full" style={{ background: segment.color }} />
              <span>{segment.label}</span>
              <span className="font-mono">${fmtMoney(segment.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
