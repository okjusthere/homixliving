import { randomUUID } from "node:crypto";
import {
  azureImageSnapshot,
  type AzureImageSnapshot,
} from "@/lib/content/azure";
import { loadBrand } from "@/lib/content/brand";
import { buildPosterPrompt } from "@/lib/content/prompts";
import {
  assertContentStorageConfigured,
  getAsset,
} from "@/lib/content/storage";
import {
  ContentError,
  query,
  transaction,
  templateColumns,
} from "@/lib/content/store";
import type {
  BrandContext,
  ContentInput,
  ContentTemplate,
} from "@/lib/content/types";
import {
  birthdayAudit,
  birthdayProfiles,
  birthdaySettings,
  type BirthdayProfile,
} from "./data";
import { daysBetween, nextBirthday, nextAnniversary, nyDate } from "./calendar";

type Event = {
  id: string;
  generation_id: string | null;
  profile_revision: number;
  celebrated_at: string | null;
  status: string | null;
};
export async function prepareBirthday(
  profile: BirthdayProfile,
  options: {
    today?: string;
    actorEmail?: string;
    retryGenerationId?: string;
    automatic?: boolean;
  } = {},
) {
  const today = options.today || nyDate();
  if (!profile.enabled || !profile.month || !profile.day)
    throw new ContentError(
      "请先补全生日并开启庆祝 / Complete birthday details first",
      409,
    );
  const date =
    profile.kind === "anniversary" && profile.joinedOn
      ? nextAnniversary(profile.joinedOn, today)
      : nextBirthday(profile.month, profile.day, today);
  const year = Number(date.slice(0, 4));
  const [eligible] = await query(
    `SELECT b.agent_id FROM portal.agent_celebration_profiles b JOIN portal.agents a ON a.id=b.agent_id WHERE b.agent_id=$1 AND b.kind=$2 AND b.revision=$3 AND b.enabled AND a.account_status='active'`,
    [profile.agentId, profile.kind, profile.revision],
  );
  if (!eligible)
    throw new ContentError("资料已变化，请刷新 / Details changed; reload", 409);
  // Network/profile lookups happen outside the DB transaction; everything is
  // rechecked under the company budget lock immediately before queue insertion.
  const [old] = await query<Event>(
    `SELECT e.*,g.status FROM portal.agent_celebration_events e LEFT JOIN portal.content_generations g ON g.id=e.generation_id WHERE e.agent_id=$1 AND e.year=$2 AND e.kind=$3`,
    [profile.agentId, year, profile.kind],
  );
  if (
    old?.generation_id &&
    old.profile_revision === profile.revision &&
    !options.retryGenerationId
  )
    return old.generation_id;
  let brand: BrandContext | undefined, provider: AzureImageSnapshot | undefined;
  let template: ContentTemplate | undefined;
  let blocked: string | null = null;
  try {
    brand = await loadBrand(profile.agentId);
    if (!brand.photoUrl)
      throw new ContentError(
        "缺少真实头像，请在官网资料中补充 / Add a real portrait to the website profile",
        409,
      );
    provider = azureImageSnapshot();
    assertContentStorageConfigured();
    [template] = await query<ContentTemplate>(
      `SELECT ${templateColumns} FROM portal.content_templates WHERE config->>'kind'=$1 AND status='published' AND config->'sizes' ? '1024x1280' ORDER BY created_at DESC LIMIT 1`,
      [profile.kind],
    );
    if (!template)
      throw new ContentError(
        "请先发布支持 4:5 尺寸的生日模板 / Publish a 4:5 birthday template first",
        409,
      );
    for (const id of template.config.referenceAssetIds) {
      if ((await getAsset(id, profile.agentId, true)).purpose !== "template")
        throw new ContentError("模板参考图无效 / Invalid template reference");
    }
  } catch (error) {
    blocked =
      error instanceof ContentError
        ? error.message
        : "海报服务暂不可用，下一次检查会重试 / Poster service unavailable; the next scan will retry";
  }
  return transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(702611,0)");
    const [fresh] = await query<{
      revision: number;
      enabled: boolean;
      account_status: string;
    }>(
      `SELECT b.revision,b.enabled,a.account_status FROM portal.agent_celebration_profiles b JOIN portal.agents a ON a.id=b.agent_id WHERE b.agent_id=$1 AND b.kind=$2`,
      [profile.agentId, profile.kind],
      c,
    );
    if (
      !fresh?.enabled ||
      fresh.account_status !== "active" ||
      fresh.revision !== profile.revision
    )
      throw new ContentError(
        "生日资料已变化，请刷新 / Birthday details changed; reload",
        409,
      );
    const currentSettings = await birthdaySettings(c);
    if (
      options.automatic &&
      (!currentSettings.enabled ||
        daysBetween(today, date) > currentSettings.leadDays)
    )
      return null;
    await c.query(
      `INSERT INTO portal.agent_celebration_events(id,agent_id,year,celebration_date,profile_revision,kind) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(agent_id,kind,year) DO NOTHING`,
      [
        randomUUID(),
        profile.agentId,
        year,
        date,
        profile.revision,
        profile.kind,
      ],
    );
    const [event] = await query<Event>(
      `SELECT e.*,g.status FROM portal.agent_celebration_events e LEFT JOIN portal.content_generations g ON g.id=e.generation_id WHERE e.agent_id=$1 AND e.year=$2 AND e.kind=$3 FOR UPDATE OF e`,
      [profile.agentId, year, profile.kind],
      c,
    );
    if (event.celebrated_at)
      throw new ContentError(
        "已标记庆祝；如需重做，请先撤销标记 / Undo celebrated before regenerating",
        409,
      );
    if (event.status === "needs_review")
      throw new ContentError(
        "上次生成结果待核查，请先在海报管理中处理 / Review the previous uncertain generation first",
        409,
      );
    if (event.profile_revision === profile.revision && event.generation_id) {
      if (!options.retryGenerationId) return event.generation_id;
      if (options.retryGenerationId !== event.generation_id)
        throw new ContentError(
          "海报已更新，请刷新 / Poster changed; reload",
          409,
        );
      if (!["succeeded", "failed"].includes(event.status || ""))
        throw new ContentError(
          "制作中或结果待核查，暂不能重复生成 / Running or uncertain result; cannot regenerate yet",
          409,
        );
    } else if (
      options.retryGenerationId &&
      options.retryGenerationId !== event.generation_id
    )
      throw new ContentError(
        "海报已更新，请刷新 / Poster changed; reload",
        409,
      );
    if (blocked || !brand || !provider || !template) {
      await c.query(
        "UPDATE portal.agent_celebration_events SET generation_id=CASE WHEN profile_revision=$3 THEN generation_id ELSE NULL END,celebration_date=$2,profile_revision=$3,blocked_reason=$4,updated_at=now() WHERE id=$1",
        [event.id, date, profile.revision, blocked],
      );
      return null;
    }
    const [{ count }] = await query<{ count: string }>(
      `SELECT count(*) FROM portal.content_generations WHERE admin_only AND input->>'kind' IN ('birthday','anniversary') AND created_at >= (($1::date)::timestamp AT TIME ZONE 'America/New_York') AND created_at < (($1::date+1)::timestamp AT TIME ZONE 'America/New_York')`,
      [today],
      c,
    );
    if (Number(count) >= currentSettings.dailyLimit) {
      await c.query(
        "UPDATE portal.agent_celebration_events SET generation_id=CASE WHEN profile_revision=$3 THEN generation_id ELSE NULL END,celebration_date=$2,profile_revision=$3,blocked_reason='今日公司生成额度已用完，明天继续 / Company daily limit reached; continues tomorrow',updated_at=now() WHERE id=$1",
        [event.id, date, profile.revision],
      );
      return null;
    }
    await c.query("SELECT pg_advisory_xact_lock(702610,$1)", [profile.agentId]);
    const [tail] = await query<{ id: string }>(
      `SELECT job.id FROM portal.content_generations job WHERE job.owner_agent_id=$1 AND job.status IN ('queued','preparing','generating','saving') AND NOT EXISTS (SELECT 1 FROM portal.content_generations child WHERE child.predecessor_id=job.id AND child.status IN ('queued','preparing','generating','saving')) ORDER BY job.created_at DESC,job.id DESC LIMIT 1`,
      [profile.agentId],
      c,
    );
    const id = randomUUID(),
      project = randomUUID();
    const years =
      profile.kind === "anniversary" && profile.joinedOn
        ? year - Number(profile.joinedOn.slice(0, 4))
        : undefined;
    const input: ContentInput = {
      kind: profile.kind,
      birthday: { eventId: event.id, profileRevision: profile.revision, years },
      theme: profile.kind,
      language: currentSettings.language,
      size: "1024x1280",
      includePortrait: true,
      headline:
        profile.kind === "anniversary"
          ? currentSettings.language === "zh"
            ? `同行 ${years} 周年`
            : `Celebrating ${years} ${years === 1 ? "Year" : "Years"} Together`
          : currentSettings.language === "zh"
            ? "生日快乐"
            : "Happy Birthday",
      message:
        profile.kind === "anniversary"
          ? currentSettings.language === "zh"
            ? "感谢一路同行，期待一起书写更多精彩。"
            : "Thank you for being part of our journey. Here’s to everything ahead."
          : currentSettings.language === "zh"
            ? "愿新的一岁，满怀热爱，收获美好。"
            : "Wishing you a wonderful year filled with joy and possibility.",
      additionalInstructions: "",
    };
    await c.query(
      "INSERT INTO portal.content_projects(id,owner_agent_id,title,input,admin_only) VALUES($1,$2,$3,$4,true)",
      [
        project,
        profile.agentId,
        `${year} ${profile.kind} · ${brand.name}`,
        JSON.stringify(input),
      ],
    );
    await c.query(
      `INSERT INTO portal.content_generations(id,project_id,owner_agent_id,template_id,idempotency_key,request_hash,status,input,brand,prompt,provider_config,batch_id,predecessor_id,admin_only) VALUES($1,$2,$3,$4,$1,($1::uuid)::text,'queued',$5,$6,$7,$8,$1,$9,true)`,
      [
        id,
        project,
        profile.agentId,
        template.id,
        JSON.stringify(input),
        JSON.stringify(brand),
        buildPosterPrompt(template.config, input, brand),
        JSON.stringify(provider),
        tail?.id || null,
      ],
    );
    await c.query(
      "UPDATE portal.agent_celebration_events SET celebration_date=$2,profile_revision=$3,generation_id=$4,attempt=attempt+1,blocked_reason=null,updated_at=now() WHERE id=$1",
      [event.id, date, profile.revision, id],
    );
    await birthdayAudit(
      options.actorEmail || null,
      "birthday.prepare",
      event.id,
      options.automatic
        ? "System queued a birthday poster"
        : "Administrator queued a birthday poster",
      c,
    );
    return id;
  });
}

export async function prepareUpcomingBirthdays(today = nyDate()) {
  const settings = await birthdaySettings();
  if (!settings.enabled)
    return { checked: 0, queued: [] as string[], errors: 0 };
  const events = await query<{
    agent_id: number;
    kind: string;
    year: number;
    profile_revision: number;
    generation_id: string | null;
    celebrated_at: string | null;
    updated_at: Date;
  }>(
    "SELECT * FROM portal.agent_celebration_events WHERE year BETWEEN $1 AND $1+1",
    [Number(today.slice(0, 4))],
  );
  const eventMap = new Map(
    events.map((e) => [`${e.agent_id}:${e.kind}:${e.year}`, e]),
  );
  const dateFor = (p: BirthdayProfile) =>
    p.kind === "anniversary" && p.joinedOn
      ? nextAnniversary(p.joinedOn, today)
      : nextBirthday(p.month!, p.day!, today);
  const eventFor = (p: BirthdayProfile) =>
    eventMap.get(`${p.agentId}:${p.kind}:${dateFor(p).slice(0, 4)}`);
  const profiles = (
    await Promise.all([
      birthdayProfiles("birthday"),
      birthdayProfiles("anniversary"),
    ])
  )
    .flat()
    .filter((p) => {
      if (
        !p.enabled ||
        !p.month ||
        !p.day ||
        daysBetween(today, dateFor(p)) > settings.leadDays
      )
        return false;
      const event = eventFor(p);
      return (
        !event?.celebrated_at &&
        !(event?.generation_id && event.profile_revision === p.revision)
      );
    });
  // Rotate previously blocked rows behind unchecked rows at the same date, so
  // a large roster cannot starve later agents on every hourly invocation.
  profiles.sort(
    (a, b) =>
      dateFor(a).localeCompare(dateFor(b)) ||
      new Date(eventFor(a)?.updated_at || 0).getTime() -
        new Date(eventFor(b)?.updated_at || 0).getTime(),
  );
  const queued: string[] = [];
  let errors = 0;
  // Bounded scans; completed rows are cheap idempotent lookups. No blind retry
  // after an image provider's uncertain outcome.
  for (const p of profiles.slice(0, 25)) {
    try {
      const id = await prepareBirthday(p, { today, automatic: true });
      if (id) queued.push(id);
    } catch {
      errors++;
    }
  }
  return { checked: Math.min(profiles.length, 25), queued, errors };
}

export async function markCelebrated(
  eventId: string,
  celebrated: boolean,
  actor: { agentId: number; email: string },
) {
  await transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(702611,0)");
    const rows = await query(
      `UPDATE portal.agent_celebration_events e SET celebrated_at=CASE WHEN $2::boolean THEN now() ELSE NULL END,celebrated_by=CASE WHEN $2::boolean THEN $3::integer ELSE NULL END,updated_at=now()
      FROM portal.agent_celebration_profiles b,portal.content_generations g WHERE e.id=$1 AND b.agent_id=e.agent_id AND b.kind=e.kind AND g.id=e.generation_id AND (NOT $2 OR (b.enabled AND e.profile_revision=b.revision AND g.status='succeeded')) RETURNING e.id`,
      [eventId, celebrated, actor.agentId],
      c,
    );
    if (!rows.length)
      throw new ContentError("请先完成海报制作 / Finish the poster first", 409);
    await birthdayAudit(
      actor.email,
      celebrated ? "birthday.celebrated" : "birthday.undo_celebrated",
      eventId,
      celebrated
        ? "Marked birthday celebrated"
        : "Undid birthday celebration mark",
      c,
    );
  });
}
