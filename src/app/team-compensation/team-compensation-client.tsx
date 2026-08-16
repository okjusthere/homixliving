"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Team, TeamCompensationConfig } from "@/db/schema";
import { Btn, Card, EditorialInput } from "@/components/homix/primitives";
import { CardHeader } from "@/components/homix/page-kit";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";

const M = {
  en: {
    empty: "You do not lead a team.", current: "Current terms", standard: "Standard team split", sourced: "Team-sourced split",
    effective: "Effective date", save: "Schedule change", saving: "Saving…", success: "Team terms scheduled",
    failed: "Unable to schedule team terms", scheduled: "Scheduled change", note: "Whole percentages only. Team Leader changes begin no earlier than tomorrow. Sponsor Reward remains a separate Homix policy item.",
  },
  zh: {
    empty: "你目前不是任何团队的负责人。", current: "当前条款", standard: "一般团队分成", sourced: "TL 提供客源分成",
    effective: "生效日期", save: "安排变更", saving: "保存中…", success: "团队条款已安排",
    failed: "无法保存团队条款", scheduled: "已安排变更", note: "仅支持整数百分比。TL 的变更最早从明天生效；推荐奖励仍按 Homix 政策单独计算。",
  },
} as const;

function tomorrow() {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

export function TeamCompensationClient({
  teams,
  isAdmin,
}: {
  teams: Array<{
    team: Team;
    config: TeamCompensationConfig | null;
    scheduled: TeamCompensationConfig | null;
  }>;
  isAdmin: boolean;
}) {
  const locale = useLocale();
  const t = M[locale];
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [forms, setForms] = useState(() => Object.fromEntries(teams.map(({ team, config }) => [team.id, {
    defaultTeamSplitPct: config?.defaultTeamSplitPct ?? 10,
    teamLeadSplitPct: config?.teamLeadSplitPct ?? 10,
    effectiveFrom: isAdmin ? new Date().toISOString().slice(0, 10) : tomorrow(),
  }])));

  if (!teams.length) {
    return <Card className="p-6 text-[13px]" style={{ color: tone.ink50 }}>{t.empty}</Card>;
  }

  async function save(teamId: number) {
    setBusyId(teamId);
    try {
      const response = await fetch(`/api/teams/${teamId}/compensation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(forms[teamId]),
      });
      if (!response.ok) throw new Error();
      toast.success(t.success);
      router.refresh();
    } catch {
      toast.error(t.failed);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {teams.map(({ team, config, scheduled }) => {
        const form = forms[team.id];
        return (
          <Card key={team.id}>
            <CardHeader title={team.name} />
            <div className="space-y-4 p-5">
              <div className="rounded-lg p-3 text-[12.5px]" style={{ background: tone.paperDeep, color: tone.ink70 }}>
                {t.current}: {config?.defaultTeamSplitPct ?? 10}% / {t.sourced} {config?.teamLeadSplitPct ?? 10}%
              </div>
              {scheduled && (
                <div className="rounded-lg p-3 text-[12.5px]" style={{ background: tone.greenSoft, color: tone.green }}>
                  {t.scheduled}: {scheduled.effectiveFrom} · {scheduled.defaultTeamSplitPct}% / {t.sourced} {scheduled.teamLeadSplitPct}%
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-[12px]" style={{ color: tone.ink50 }}>
                  <span>{t.standard}</span>
                  <EditorialInput value={form.defaultTeamSplitPct} onChange={(value) => setForms((old) => ({ ...old, [team.id]: { ...old[team.id], defaultTeamSplitPct: Number(value) } }))} type="number" mono />
                </label>
                <label className="space-y-1 text-[12px]" style={{ color: tone.ink50 }}>
                  <span>{t.sourced}</span>
                  <EditorialInput value={form.teamLeadSplitPct} onChange={(value) => setForms((old) => ({ ...old, [team.id]: { ...old[team.id], teamLeadSplitPct: Number(value) } }))} type="number" mono />
                </label>
                <label className="space-y-1 text-[12px]" style={{ color: tone.ink50 }}>
                  <span>{t.effective}</span>
                  <EditorialInput value={form.effectiveFrom} onChange={(value) => setForms((old) => ({ ...old, [team.id]: { ...old[team.id], effectiveFrom: String(value) } }))} type="date" mono />
                </label>
              </div>
              <p className="text-[11.5px]" style={{ color: tone.ink50 }}>{t.note}</p>
              <Btn variant="primary" onClick={() => void save(team.id)} disabled={busyId === team.id}>
                {busyId === team.id ? t.saving : t.save}
              </Btn>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
