// Lead/deal source taxonomy.

export type DealSource =
  | "xiaohongshu"
  | "wechat"
  | "school_listserv"
  | "existing_client"
  | "website"
  | "other";

export const SOURCE_OPTIONS: Array<{ value: DealSource; label: string; emoji: string }> = [
  { value: "xiaohongshu", label: "小红书", emoji: "📕" },
  { value: "wechat", label: "WeChat", emoji: "💬" },
  { value: "school_listserv", label: "学校 listserv", emoji: "🎓" },
  { value: "existing_client", label: "老客户介绍", emoji: "🤝" },
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
