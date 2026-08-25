"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Team, TeamCompensationConfig } from "@/db/schema";
import { Btn, Card, EditorialInput } from "@/components/homix/primitives";
import { CardHeader } from "@/components/homix/page-kit";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import {
  TEAM_CAP_CENTS_PRESETS,
  TEAM_SOURCED_SPLIT_PRESETS,
  TEAM_SPLIT_PRESETS,
} from "@/lib/team-compensation-policy";

const M = {
  en: {
    empty: "You do not lead a team.", current: "Current published terms", standard: "Standard team split", sourced: "Team-sourced split",
    effective: "Effective date", cap: "Annual member team cap", noCap: "No cap", save: "Publish team terms", saving: "Saving…", success: "Team terms published",
    failed: "Unable to publish team terms", scheduled: "Scheduled terms", note: "New agents sign these terms. Existing members keep their current cycle and adopt later terms at their next anniversary. Sponsor Reward remains separate Homix policy.",
  },
  zh: {
    empty: "你目前不是任何团队的负责人。", current: "当前发布方案", standard: "一般团队分成", sourced: "TL 提供客源分成",
    effective: "生效日期", cap: "成员年度团队封顶", noCap: "不封顶", save: "发布团队方案", saving: "保存中…", success: "团队方案已发布",
    failed: "无法发布团队方案", scheduled: "已安排方案", note: "新成员签署本方案；现有成员当前周期不变，在下一周年采用届时方案。推荐奖励仍按 Homix 政策单独计算。",
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
    teamCapCents: config?.teamCapCents ?? null,
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
                {t.current}: {config?.defaultTeamSplitPct ?? 10}% / {t.sourced} {config?.teamLeadSplitPct ?? 10}% / {t.cap} {config?.teamCapCents == null ? t.noCap : `$${(config.teamCapCents / 100).toLocaleString()}`}
              </div>
              {scheduled && (
                <div className="rounded-lg p-3 text-[12.5px]" style={{ background: tone.greenSoft, color: tone.green }}>
                  {t.scheduled}: {scheduled.effectiveFrom} · {scheduled.defaultTeamSplitPct}% / {t.sourced} {scheduled.teamLeadSplitPct}% / {t.cap} {scheduled.teamCapCents == null ? t.noCap : `$${(scheduled.teamCapCents / 100).toLocaleString()}`}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-[12px]" style={{ color: tone.ink50 }}>
                  <span>{t.cap}</span>
                  <select
                    value={form.teamCapCents ?? ""}
                    onChange={(event) => setForms((old) => ({
                      ...old,
                      [team.id]: {
                        ...old[team.id],
                        teamCapCents: event.target.value ? Number(event.target.value) : null,
                      },
                    }))}
                    className="h-11 w-full rounded-lg px-3 text-[13.5px]"
                    style={{ border: `1px solid ${tone.line}`, background: tone.card, color: tone.ink }}
                  >
                    <option value="">{t.noCap}</option>
                    {TEAM_CAP_CENTS_PRESETS.map((value) => (
                      <option key={value} value={value}>${(value / 100).toLocaleString()}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-[12px]" style={{ color: tone.ink50 }}>
                  <span>{t.standard}</span>
                  <select
                    value={form.defaultTeamSplitPct}
                    onChange={(event) => setForms((old) => ({ ...old, [team.id]: { ...old[team.id], defaultTeamSplitPct: Number(event.target.value) } }))}
                    className="h-11 w-full rounded-lg px-3 text-[13.5px]"
                    style={{ border: `1px solid ${tone.line}`, background: tone.card, color: tone.ink }}
                  >
                    {TEAM_SPLIT_PRESETS.map((value) => <option key={value} value={value}>{value}%</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-[12px]" style={{ color: tone.ink50 }}>
                  <span>{t.sourced}</span>
                  <select
                    value={form.teamLeadSplitPct}
                    onChange={(event) => setForms((old) => ({ ...old, [team.id]: { ...old[team.id], teamLeadSplitPct: Number(event.target.value) } }))}
                    className="h-11 w-full rounded-lg px-3 text-[13.5px]"
                    style={{ border: `1px solid ${tone.line}`, background: tone.card, color: tone.ink }}
                  >
                    {TEAM_SOURCED_SPLIT_PRESETS.map((value) => <option key={value} value={value}>{value}%</option>)}
                  </select>
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
