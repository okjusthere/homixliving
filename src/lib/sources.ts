// Lead/deal source taxonomy.
//
// Tracks the *origin* of a lead — where the tenant first encountered Homix.
// Conversation always closes 1-on-1 in WeChat, so WeChat itself is not a
// source (every deal would match it; no signal). The set below targets the
// NYC Manhattan Chinese-tenant rental market specifically.

export type DealSource =
  | "xiaohongshu"
  | "tiktok"
  | "wechat_group"
  | "wechat_content"
  | "school_alumni"
  | "existing_client"
  | "cobroker"
  | "website"
  | "other";

export const SOURCE_OPTIONS: Array<{ value: DealSource; label: string; emoji: string }> = [
  { value: "xiaohongshu", label: "小红书", emoji: "📕" },
  { value: "tiktok", label: "抖音 / TikTok", emoji: "🎬" },
  { value: "wechat_group", label: "微信群", emoji: "👥" },
  { value: "wechat_content", label: "公众号 / 视频号", emoji: "📰" },
  { value: "school_alumni", label: "学生 / 校友圈", emoji: "🎓" },
  { value: "existing_client", label: "老客户介绍", emoji: "🤝" },
  { value: "cobroker", label: "同行介绍", emoji: "💼" },
  { value: "website", label: "网站表单", emoji: "🌐" },
  { value: "other", label: "其他", emoji: "✨" },
];

export function sourceLabel(value: string | null | undefined): string {
  const opt = SOURCE_OPTIONS.find((o) => o.value === value);
  return opt ? opt.label : "—";
}

export function sourceEmoji(value: string | null | undefined): string {
  const opt = SOURCE_OPTIONS.find((o) => o.value === value);
  return opt ? opt.emoji : "—";
}
