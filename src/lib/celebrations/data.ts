import { z } from "zod";
import type { PoolClient } from "pg";
import { ContentError, query, transaction } from "@/lib/content/store";
import {
  birthdayDate,
  daysBetween,
  nextBirthday,
  nextAnniversary,
  nyDate,
  validBirthday,
  validJoinDate,
} from "./calendar";
import type {
  CelebrationKind,
  BirthdayChange,
  BirthdayFilter,
  BirthdayList,
  BirthdayRow,
  BirthdaySettings,
} from "./types";

export const settingsSchema = z.object({
  enabled: z.boolean(),
  leadDays: z.number().int().min(1).max(30),
  dailyLimit: z.number().int().min(1).max(50),
  language: z.enum(["zh", "en"]),
});
export const changeSchema = z
  .object({
    agentId: z.number().int().positive(),
    kind: z.enum(["birthday", "anniversary"]),
    joinedOn: z.string().nullable(),
    month: z.number().int().nullable(),
    day: z.number().int().nullable(),
    enabled: z.boolean(),
    revision: z.number().int().min(0),
  })
  .refine(
    (v) =>
      (v.month === null && v.day === null) ||
      (v.month !== null && v.day !== null && validBirthday(v.month, v.day)),
    "请输入有效的月、日 / Enter a valid month and day",
  )
  .refine(
    (v) =>
      v.kind === "birthday"
        ? v.joinedOn === null
        : v.joinedOn === null
          ? v.month === null && v.day === null
          : validJoinDate(v.joinedOn) &&
            v.month === Number(v.joinedOn.slice(5, 7)) &&
            v.day === Number(v.joinedOn.slice(8, 10)),
    "请输入真实有效的入职日期 / Enter a valid joining date",
  );
export const defaultSettings: BirthdaySettings = {
  enabled: true,
  leadDays: 7,
  dailyLimit: 10,
  language: "zh",
};
export async function birthdaySettings(
  client?: PoolClient,
): Promise<BirthdaySettings> {
  const [row] = await query<{ value: string }>(
    "SELECT value FROM portal.settings WHERE key='birthday_automation'",
    [],
    client,
  );
  return row ? settingsSchema.parse(JSON.parse(row.value)) : defaultSettings;
}
export async function birthdayAudit(
  email: string | null,
  action: string,
  entityId: string,
  summary: string,
  client: PoolClient,
) {
  await client.query(
    "INSERT INTO portal.audit_log(actor_email,action,entity_type,entity_id,summary,created_at) VALUES($1,$2,'birthday',$3,$4,now())",
    [email, action, entityId, summary],
  );
}
export async function saveBirthdaySettings(
  value: unknown,
  actor: { email: string },
) {
  const settings = settingsSchema.parse(value);
  await transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(702611,0)");
    await c.query(
      "INSERT INTO portal.settings(key,value) VALUES('birthday_automation',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
      [JSON.stringify(settings)],
    );
    await birthdayAudit(
      actor.email,
      "birthday.settings",
      "automation",
      "Updated birthday preparation settings",
      c,
    );
  });
}
export type BirthdayProfile = {
  kind: CelebrationKind;
  joinedOn: string | null;
  agentId: number;
  name: string;
  email: string;
  month: number | null;
  day: number | null;
  enabled: boolean;
  revision: number;
};
export async function birthdayProfiles(
  kind: CelebrationKind = "birthday",
  client?: PoolClient,
): Promise<BirthdayProfile[]> {
  return query<BirthdayProfile>(
    `SELECT $1::text AS kind,b.joined_on::text AS "joinedOn",a.id AS "agentId",a.name,a.email,b.month,b.day,COALESCE(b.enabled,true) AS enabled,COALESCE(b.revision,0) AS revision FROM portal.agents a LEFT JOIN portal.agent_celebration_profiles b ON b.agent_id=a.id AND b.kind=$1 WHERE a.account_status='active' ORDER BY a.name,a.id`,
    [kind],
    client,
  );
}
export async function saveBirthdays(
  raw: unknown,
  actor: { agentId: number; email: string },
) {
  const changes = z.array(changeSchema).min(1).max(1000).parse(raw);
  if (
    new Set(changes.map((v) => `${v.kind}:${v.agentId}`)).size !==
    changes.length
  )
    throw new ContentError("同一账号出现多次 / Duplicate account");
  await transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(702611,0)");
    const profiles = new Map(
      (
        await Promise.all([
          birthdayProfiles("birthday", c),
          birthdayProfiles("anniversary", c),
        ])
      )
        .flat()
        .map((v) => [`${v.kind}:${v.agentId}`, v]),
    );
    for (const v of changes) {
      const old = profiles.get(`${v.kind}:${v.agentId}`);
      if (!old || old.revision !== v.revision)
        throw new ContentError(
          "名册已变化，请重新载入或重新预览导入 / Roster changed; reload or preview again",
          409,
          "STALE_PREVIEW",
        );
      if (
        old.month === v.month &&
        old.day === v.day &&
        old.enabled === v.enabled &&
        old.joinedOn === v.joinedOn
      )
        continue;
      await c.query(
        `INSERT INTO portal.agent_celebration_profiles(agent_id,month,day,enabled,updated_by,kind,joined_on) VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(agent_id,kind) DO UPDATE SET joined_on=EXCLUDED.joined_on,month=EXCLUDED.month,day=EXCLUDED.day,enabled=EXCLUDED.enabled,revision=portal.agent_celebration_profiles.revision+1,updated_by=EXCLUDED.updated_by,updated_at=now()`,
        [
          v.agentId,
          v.month,
          v.day,
          v.enabled,
          actor.agentId,
          v.kind,
          v.joinedOn,
        ],
      );
      await c.query(
        `UPDATE portal.content_generations g SET status='failed',error='BIRTHDAY_CHANGED',updated_at=now() FROM portal.agent_celebration_events e WHERE e.agent_id=$1 AND e.kind=$2 AND e.generation_id=g.id AND g.status IN ('queued','preparing')`,
        [v.agentId, v.kind],
      );
      await birthdayAudit(
        actor.email,
        "birthday.profile",
        String(v.agentId),
        "Updated birthday month/day or participation",
        c,
      );
    }
  });
  return { updated: changes.length };
}
export async function birthdayList(
  filter: BirthdayFilter = "today",
  search = "",
  page = 1,
  today = nyDate(),
  kind: CelebrationKind = "birthday",
): Promise<BirthdayList> {
  const [profiles, events, settings] = await Promise.all([
    birthdayProfiles(kind),
    query<{
      id: string;
      agent_id: number;
      year: number;
      profile_revision: number;
      generation_id: string | null;
      status: string | null;
      error: string | null;
      output_asset_id: string | null;
      blocked_reason: string | null;
      celebrated_at: string | null;
    }>(
      `SELECT e.*,g.status,g.error,g.output_asset_id FROM portal.agent_celebration_events e LEFT JOIN portal.content_generations g ON g.id=e.generation_id WHERE e.year BETWEEN $1 AND $1+1 AND e.kind=$2`,
      [Number(today.slice(0, 4)), kind],
    ),
    birthdaySettings(),
  ]);
  const eventMap = new Map(events.map((e) => [`${e.agent_id}:${e.year}`, e]));
  const todayMonth = Number(today.slice(5, 7));
  const rows = profiles.map((p): BirthdayRow => {
    const next =
      p.month && p.day
        ? kind === "anniversary" && p.joinedOn
          ? nextAnniversary(p.joinedOn, today)
          : nextBirthday(p.month, p.day, today)
        : null;
    const date =
      filter === "month" && p.month === todayMonth && p.day
        ? birthdayDate(p.month, p.day, Number(today.slice(0, 4)))
        : next;
    const event = date
      ? eventMap.get(`${p.agentId}:${date.slice(0, 4)}`)
      : undefined;
    const current = event?.profile_revision === p.revision;
    return {
      ...p,
      years:
        kind === "anniversary" && date && p.joinedOn
          ? Number(date.slice(0, 4)) - Number(p.joinedOn.slice(0, 4))
          : null,
      date,
      days: date ? daysBetween(today, date) : null,
      eventId: event?.id || null,
      status: !p.enabled
        ? "excluded"
        : !date
          ? "missing"
          : event?.status === "needs_review"
            ? "needs_review"
            : event?.celebrated_at
              ? "celebrated"
              : !current
                ? "planned"
                : event.status ||
                  (event.blocked_reason ? "blocked" : "planned"),
      error:
        current || event?.status === "needs_review"
          ? event.error || event.blocked_reason
          : null,
      assetId: current && p.enabled ? event.output_asset_id : null,
      generationId:
        current || event?.status === "needs_review"
          ? event.generation_id
          : null,
    };
  });
  const matches = (v: BirthdayRow, f: BirthdayFilter) =>
    f === "all" ||
    (f === "missing"
      ? v.enabled && !v.month
      : f === "month"
        ? v.enabled &&
          v.month === todayMonth &&
          (v.kind !== "anniversary" ||
            (v.joinedOn !== null &&
              Number(v.joinedOn.slice(0, 4)) < Number(today.slice(0, 4))))
        : v.enabled &&
          v.days !== null &&
          (f === "today" ? v.days === 0 : v.days >= 0 && v.days <= 7));
  const counts = Object.fromEntries(
    (["today", "upcoming", "month", "missing", "all"] as BirthdayFilter[]).map(
      (f) => [f, rows.filter((v) => matches(v, f)).length],
    ),
  ) as BirthdayList["counts"];
  const q = search.trim().toLowerCase();
  const selected = rows
    .filter(
      (v) =>
        matches(v, filter) &&
        (!q || `${v.name} ${v.email} ${v.agentId}`.toLowerCase().includes(q)),
    )
    .sort(
      (a, b) =>
        (a.days ?? 999) - (b.days ?? 999) || a.name.localeCompare(b.name),
    );
  const safePage = Math.max(
    1,
    Math.min(Math.ceil(selected.length / 25) || 1, Math.floor(page) || 1),
  );
  return {
    today,
    settings,
    counts,
    total: selected.length,
    page: safePage,
    rows: selected.slice((safePage - 1) * 25, safePage * 25),
  };
}

// Exported for import preview to carry a revision rather than a blind overwrite.
export function birthdayChange(
  p: BirthdayProfile,
  month: number,
  day: number,
): BirthdayChange {
  return {
    agentId: p.agentId,
    kind: p.kind,
    joinedOn: p.joinedOn,
    month,
    day,
    enabled: p.enabled,
    revision: p.revision,
  };
}
