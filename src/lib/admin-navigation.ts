export const adminGroups = [
  {
    en: "People",
    zh: "人员",
    items: [
      { href: "/admin/agents", en: "Agents", zh: "经纪人" },
      { href: "/admin/teams", en: "Teams", zh: "团队" },
    ],
  },
  {
    en: "Content & learning",
    zh: "内容与培训",
    items: [
      {
        href: "/admin/marketing/posters",
        en: "Poster management",
        zh: "海报管理",
      },
      { href: "/admin/training", en: "Training", zh: "培训管理" },
      { href: "/admin/resources", en: "Resources", zh: "资料与公司文件" },
      { href: "/admin/buildings", en: "Buildings", zh: "楼宇资料" },
    ],
  },
  {
    en: "Finance",
    zh: "财务",
    items: [
      { href: "/admin/finance", en: "Agent fee ledger", zh: "经纪人缴费" },
      { href: "/admin/payouts", en: "Commission payouts", zh: "佣金发放" },
    ],
  },
  {
    en: "System",
    zh: "系统",
    items: [
      {
        href: "/admin/settings/access",
        en: "Administrator access",
        zh: "管理员权限",
      },
      { href: "/admin/settings", en: "Company settings", zh: "公司与发票设置" },
      { href: "/admin/feedback", en: "Feedback inbox", zh: "建议收件箱" },
      { href: "/admin/audit", en: "Audit log", zh: "操作审计" },
    ],
  },
] as const;

export function adminPathMatches(pathname: string, href: string) {
  if (
    href === "/admin/settings" &&
    pathname.startsWith("/admin/settings/access")
  )
    return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function legacyAdminUrl(
  path: string,
  query: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      params.append(key, item);
  }
  return path + (params.size ? `?${params}` : "");
}
