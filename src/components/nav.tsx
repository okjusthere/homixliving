"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  ClipboardCheck,
  GraduationCap,
  History,
  Library,
  LineChart,
  Settings2,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { HomixMark } from "@/components/homix/brand-mark";
import { tone } from "@/components/homix/tokens";
import { useLocale } from "@/lib/i18n-client";
import { NotificationBell } from "@/components/notification-bell";
import { SearchCommand } from "@/components/search-command";

const navItems = [
  { href: "/", key: "overview", adminOnly: false },
  { href: "/sales", key: "sales", adminOnly: false },
  { href: "/rental", key: "rental", adminOnly: false },
  { href: "/offer", key: "offer", adminOnly: false },
  { href: "/share", key: "share", adminOnly: false },
  { href: "/profile/public", key: "profile", adminOnly: false },
  { href: "/agents", key: "agents", adminOnly: true },
  { href: "/teams", key: "teams", adminOnly: true },
  { href: "/finance", key: "finance", adminOnly: true },
  { href: "/payouts", key: "payouts", adminOnly: true },
  { href: "/audit", key: "audit", adminOnly: true },
  { href: "/feedback/admin", key: "feedbackInbox", adminOnly: true },
  { href: "/settings", key: "settings", adminOnly: true },
] as const;

const workspaceGroups = [
  {
    key: "transactionSupport",
    items: [
      { href: "/market", key: "market", icon: LineChart, leaderOnly: false },
      { href: "/expired-listings", key: "expiredListings", icon: History, leaderOnly: false },
    ],
  },
  {
    key: "learningGrowth",
    items: [
      { href: "/onboarding", key: "onboarding", icon: ClipboardCheck, leaderOnly: false },
      { href: "/training", key: "training", icon: GraduationCap, leaderOnly: false },
      { href: "/buyercoach", key: "coach", icon: Bot, leaderOnly: false },
    ],
  },
  {
    key: "companyPerformance",
    items: [
      { href: "/resources", key: "resources", icon: Library, leaderOnly: false },
      { href: "/reports", key: "reports", icon: BarChart3, leaderOnly: false },
      { href: "/team-workspace", key: "teamWorkspace", icon: UsersRound, leaderOnly: true },
    ],
  },
] as const;

const adminGroups = [
  {
    key: "peopleManagement",
    icon: UsersRound,
    items: [
      { href: "/agents", key: "agents" },
      { href: "/teams", key: "teams" },
    ],
  },
  {
    key: "financeManagement",
    icon: WalletCards,
    items: [
      { href: "/finance", key: "finance" },
      { href: "/payouts", key: "payouts" },
    ],
  },
  {
    key: "systemManagement",
    icon: Settings2,
    items: [
      { href: "/audit", key: "audit" },
      { href: "/feedback/admin", key: "feedbackInbox" },
      { href: "/settings", key: "settings" },
    ],
  },
] as const;

const LABELS = {
  en: {
    overview: "Overview", sales: "Sales", rental: "Rental", training: "Training",
    resources: "Resource library", onboarding: "Onboarding guide", coach: "AI coach", offer: "Offers", share: "Share center",
    agents: "Agents", teams: "Teams", reports: "Performance report", finance: "Finance", payouts: "Payouts", audit: "Audit", feedbackInbox: "Feedback inbox", settings: "Settings",
    search: "Search", signedIn: "Signed in", signOut: "Sign out", admin: "Admin", profile: "Public profile", accountProfile: "My profile",
    menu: "Menu", switchLanguage: "Switch language", userMenu: "User menu", workspace: "Workspace", market: "Market overview", expiredListings: "Expired listings",
    transactionSupport: "Transaction support", learningGrowth: "Learning & growth", companyPerformance: "Company & performance",
    peopleManagement: "People", financeManagement: "Finance", systemManagement: "System", teamWorkspace: "Team workspace", anonymousFeedback: "Anonymous feedback",
  },
  zh: {
    overview: "概览", sales: "买卖", rental: "租赁", training: "培训",
    resources: "资料库", onboarding: "入职指南", coach: "AI 教练", offer: "报价", share: "分享中心",
    agents: "经纪人", teams: "团队", reports: "业绩报表", finance: "财务", payouts: "发放", audit: "审计", feedbackInbox: "建议收件箱", settings: "设置",
    search: "搜索", signedIn: "已登录", signOut: "退出登录", admin: "管理员", profile: "个人主页", accountProfile: "我的档案",
    menu: "菜单", switchLanguage: "切换语言", userMenu: "用户菜单", workspace: "工作台", market: "市场概览", expiredListings: "已过期房源",
    transactionSupport: "交易支持", learningGrowth: "学习成长", companyPerformance: "公司与业绩",
    peopleManagement: "人员管理", financeManagement: "财务管理", systemManagement: "系统管理", teamWorkspace: "团队工作台", anonymousFeedback: "匿名建议",
  },
} as const;

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name || email || "?").trim();
  if (!source) return "?";
  const parts = source.split(/\s+|@/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source[0]!.toUpperCase();
}

export function Nav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [mobileAdminOpen, setMobileAdminOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const adminMenuRef = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  const t = LABELS[locale];
  const toggleLocale = () => {
    const next = locale === "zh" ? "en" : "zh";
    document.cookie = `locale=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  useEffect(() => {
    if (!menuOpen && !toolsMenuOpen && !adminMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuOpen && !menuRef.current?.contains(target)) setMenuOpen(false);
      if (toolsMenuOpen && !toolsMenuRef.current?.contains(target)) {
        setToolsMenuOpen(false);
      }
      if (adminMenuOpen && !adminMenuRef.current?.contains(target)) {
        setAdminMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [adminMenuOpen, menuOpen, toolsMenuOpen]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/rental")
      return (
        pathname === "/rental" ||
        /^\/rental\/\d+/.test(pathname) ||
        pathname === "/rental/new" ||
        pathname === "/rental/renewals" ||
        pathname.startsWith("/invoices") ||
        pathname.startsWith("/buildings")
      );
    if (href === "/sales") return pathname === "/sales" || /^\/sales\/\d+/.test(pathname) || pathname === "/sales/new";
    if (href === "/agents")
      return pathname === "/agents" || /^\/agents\/\d+/.test(pathname) || pathname.startsWith("/roster/");
    if (href === "/onboarding") return pathname === "/onboarding" || pathname.startsWith("/onboarding/");
    return pathname === href;
  };

  const isAdmin = session?.user?.isAdmin || false;
  const mayUseTeamWorkspace = isAdmin || Boolean(session?.user?.isTeamLeader);
  const primaryItems = navItems.filter((item) => !item.adminOnly);
  const adminItems = navItems.filter((item) => item.adminOnly);
  const toolsSectionActive = workspaceGroups.some((group) =>
    group.items.some((item) => (!item.leaderOnly || mayUseTeamWorkspace) && isActive(item.href)),
  );
  const adminSectionActive = adminItems.some((item) => isActive(item.href));
  const initials = getInitials(session?.user?.name, session?.user?.email);

  return (
    <nav
      className="sticky top-0 z-30"
      style={{ background: tone.card, borderBottom: `1px solid ${tone.line}` }}
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
        <div className="h-16 flex items-center justify-between">
          <div className="flex items-center gap-4 xl:gap-10 min-w-0">
            {/* Hamburger for the nav items on small screens */}
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={t.menu}
              className="xl:hidden h-9 w-9 rounded-md flex items-center justify-center flex-none"
              style={{ border: `1px solid ${tone.line}`, color: tone.ink50 }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path
                  d="M2 4h12M2 8h12M2 12h12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <Link href="/" prefetch={false} className="flex-none">
              <HomixMark />
            </Link>
            <div className="hidden xl:flex items-center gap-0.5">
              {primaryItems.slice(0, 3).map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    className="px-2 h-9 shrink-0 rounded-md text-[13px] font-medium transition-colors flex items-center"
                    style={{
                      color: active ? tone.ink : tone.ink50,
                      background: active ? tone.paperDeep : "transparent",
                    }}
                  >
                    {t[item.key]}
                  </Link>
                );
              })}
              {primaryItems.slice(3).map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    className="px-2 h-9 shrink-0 rounded-md text-[13px] font-medium transition-colors flex items-center"
                    style={{
                      color: active ? tone.ink : tone.ink50,
                      background: active ? tone.paperDeep : "transparent",
                    }}
                  >
                    {t[item.key]}
                  </Link>
                );
              })}
              <div ref={toolsMenuRef} className="relative shrink-0">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={toolsMenuOpen}
                  onClick={() => {
                    setToolsMenuOpen((open) => !open);
                    setAdminMenuOpen(false);
                    setMenuOpen(false);
                  }}
                  className="flex h-9 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition-colors"
                  style={{
                    color: toolsSectionActive ? tone.ink : tone.ink50,
                    background: toolsSectionActive ? tone.paperDeep : "transparent",
                  }}
                >
                  <BriefcaseBusiness size={14} strokeWidth={1.8} aria-hidden />
                  {t.workspace}
                  <ChevronDown
                    size={14}
                    aria-hidden
                    className={`transition-transform ${toolsMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {toolsMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-11 z-50 grid w-[620px] grid-cols-3 rounded-lg p-3 shadow-lg"
                    style={{
                      background: tone.card,
                      border: `1px solid ${tone.line}`,
                      boxShadow: "0 14px 32px -12px rgba(0,0,0,0.2)",
                    }}
                  >
                    {workspaceGroups.map((group, groupIndex) => {
                      return (
                        <section
                          key={group.key}
                          className={`min-w-0 px-2 ${groupIndex > 0 ? "border-l" : ""}`}
                          style={{ borderColor: tone.lineSoft }}
                        >
                          <p
                            className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                            style={{ color: tone.ink50 }}
                          >
                            {t[group.key]}
                          </p>
                          <div className="space-y-1">
                            {group.items.filter((item) => !item.leaderOnly || mayUseTeamWorkspace).map((item) => {
                              const active = isActive(item.href);
                              const ItemIcon = item.icon;
                              return (
                                <Link
                                  key={item.href}
                                  href={item.href}
                                  prefetch={false}
                                  role="menuitem"
                                  onClick={() => setToolsMenuOpen(false)}
                                  className="flex h-11 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors hover:bg-[#F6F1E8]"
                                  style={{
                                    color: active ? tone.ink : tone.ink70,
                                    background: active ? tone.paperDeep : "transparent",
                                  }}
                                >
                                  <ItemIcon size={15} strokeWidth={1.7} aria-hidden />
                                  <span>{t[item.key]}</span>
                                </Link>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
              {isAdmin && (
                <div ref={adminMenuRef} className="relative shrink-0">
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={adminMenuOpen}
                    onClick={() => {
                      setAdminMenuOpen((open) => !open);
                      setToolsMenuOpen(false);
                      setMenuOpen(false);
                    }}
                    className="flex h-9 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition-colors"
                    style={{
                      color: adminSectionActive ? tone.ink : tone.ink50,
                      background: adminSectionActive
                        ? tone.paperDeep
                        : "transparent",
                    }}
                  >
                    <ShieldCheck size={14} strokeWidth={1.8} aria-hidden />
                    {t.admin}
                    <ChevronDown
                      size={14}
                      aria-hidden
                      className={`transition-transform ${adminMenuOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {adminMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-11 z-50 grid w-[500px] grid-cols-3 rounded-lg p-3 shadow-lg"
                      style={{
                        background: tone.card,
                        border: `1px solid ${tone.line}`,
                        boxShadow: "0 14px 32px -12px rgba(0,0,0,0.2)",
                      }}
                    >
                      {adminGroups.map((group, groupIndex) => {
                        const GroupIcon = group.icon;
                        return (
                          <section
                            key={group.key}
                            className={`min-w-0 px-2 ${groupIndex > 0 ? "border-l" : ""}`}
                            style={{ borderColor: tone.lineSoft }}
                          >
                            <p
                              className="flex items-center gap-1.5 px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
                              style={{ color: tone.ink50 }}
                            >
                              <GroupIcon size={13} strokeWidth={1.7} aria-hidden />
                              {t[group.key]}
                            </p>
                            <div className="space-y-1">
                              {group.items.map((item) => {
                                const active = isActive(item.href);
                                return (
                                  <Link
                                    key={item.href}
                                    href={item.href}
                                    prefetch={false}
                                    role="menuitem"
                                    onClick={() => setAdminMenuOpen(false)}
                                    className="flex h-11 items-center rounded-md px-2.5 text-[13px] font-medium transition-colors hover:bg-[#F6F1E8]"
                                    style={{
                                      color: active ? tone.ink : tone.ink70,
                                      background: active ? tone.paperDeep : "transparent",
                                    }}
                                  >
                                    {t[item.key]}
                                  </Link>
                                );
                              })}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3" ref={menuRef}>
            <button
              type="button"
              onClick={toggleLocale}
              className="h-9 px-3 rounded-md text-[13px] font-medium transition-colors hover:opacity-80"
              style={{ border: `1px solid ${tone.line}`, color: tone.ink50 }}
              aria-label={t.switchLanguage}
            >
              {locale === "zh" ? "EN" : "中文"}
            </button>
            {(session?.user?.accountStatus === "active" || session?.user?.isAdmin) && (
              <>
                <SearchCommand />
                <NotificationBell />
              </>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen((v) => !v);
                  setAdminMenuOpen(false);
                  setToolsMenuOpen(false);
                }}
                className="w-9 h-9 rounded-full flex items-center justify-center font-medium hover:opacity-90 transition-opacity"
                style={{ background: tone.accent, color: "#fff", fontSize: 13 }}
                aria-label={t.userMenu}
              >
                {initials}
              </button>

              {menuOpen && (
                <div
                  className="absolute right-0 top-11 w-64 rounded-xl overflow-hidden shadow-lg z-40"
                  style={{
                    background: tone.card,
                    border: `1px solid ${tone.line}`,
                    boxShadow: "0 12px 30px -10px rgba(0,0,0,0.18)",
                  }}
                >
                  <div className="px-4 py-3" style={{ borderBottom: `1px solid ${tone.lineSoft}` }}>
                    <div
                      className="font-serif"
                      style={{ fontSize: 16, color: tone.ink, letterSpacing: "-0.01em" }}
                    >
                      {session?.user?.name || t.signedIn}
                    </div>
                    <div className="text-[12px] mt-0.5 truncate" style={{ color: tone.ink50 }}>
                      {session?.user?.email}
                    </div>
                    {isAdmin && (
                      <div
                        className="mt-2 inline-block px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider"
                        style={{ background: tone.accentSoft, color: tone.accent }}
                      >
                        {t.admin}
                      </div>
                    )}
                  </div>
                  {(session?.user?.accountStatus === "active" || session?.user?.isAdmin) && (
                    <>
                      <Link
                        href="/profile"
                        prefetch={false}
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-3 text-[13px] hover:bg-[#FAF7F0] transition-colors"
                        style={{ color: tone.ink70, borderBottom: `1px solid ${tone.lineSoft}` }}
                      >
                        {t.accountProfile}
                      </Link>
                      {mayUseTeamWorkspace && (
                        <Link
                          href="/team-workspace"
                          prefetch={false}
                          onClick={() => setMenuOpen(false)}
                          className="block px-4 py-3 text-[13px] hover:bg-[#FAF7F0] transition-colors"
                          style={{ color: tone.ink70, borderBottom: `1px solid ${tone.lineSoft}` }}
                        >
                          {t.teamWorkspace}
                        </Link>
                      )}
                      <Link
                        href="/feedback"
                        prefetch={false}
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-3 text-[13px] hover:bg-[#FAF7F0] transition-colors"
                        style={{ color: tone.ink70, borderBottom: `1px solid ${tone.lineSoft}` }}
                      >
                        {t.anonymousFeedback}
                      </Link>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="w-full text-left px-4 py-3 text-[13px] hover:bg-[#FAF7F0] transition-colors"
                    style={{ color: tone.ink70 }}
                  >
                    {t.signOut}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {mobileOpen && (
          <div
            className="xl:hidden pb-3 grid grid-cols-2 gap-1"
            style={{ borderTop: `1px solid ${tone.lineSoft}` }}
          >
            {primaryItems.slice(0, 3).map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  onClick={() => {
                    setMobileOpen(false);
                    setMobileToolsOpen(false);
                    setMobileAdminOpen(false);
                  }}
                  className="px-3 h-10 rounded-md text-[13.5px] font-medium flex items-center"
                  style={{
                    color: active ? tone.ink : tone.ink50,
                    background: active ? tone.paperDeep : "transparent",
                  }}
                >
                  {t[item.key]}
                </Link>
              );
            })}
            {primaryItems.slice(3).map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  onClick={() => {
                    setMobileOpen(false);
                    setMobileToolsOpen(false);
                    setMobileAdminOpen(false);
                  }}
                  className="px-3 h-10 rounded-md text-[13.5px] font-medium flex items-center"
                  style={{
                    color: active ? tone.ink : tone.ink50,
                    background: active ? tone.paperDeep : "transparent",
                  }}
                >
                  {t[item.key]}
                </Link>
              );
            })}
            <div
              className="col-span-2 mt-1 pt-1"
              style={{ borderTop: `1px solid ${tone.lineSoft}` }}
            >
              <button
                type="button"
                aria-expanded={mobileToolsOpen}
                onClick={() => setMobileToolsOpen((open) => !open)}
                className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-[13.5px] font-medium"
                style={{
                  color: toolsSectionActive ? tone.ink : tone.ink50,
                  background: toolsSectionActive ? tone.paperDeep : "transparent",
                }}
              >
                <BriefcaseBusiness size={16} strokeWidth={1.8} aria-hidden />
                <span>{t.workspace}</span>
                <ChevronDown
                  size={15}
                  aria-hidden
                  className={`ml-auto transition-transform ${mobileToolsOpen ? "rotate-180" : ""}`}
                />
              </button>
              {mobileToolsOpen && (
                <div className="mt-1 space-y-3 px-3 pb-2">
                  {workspaceGroups.map((group) => {
                    return (
                      <section key={group.key}>
                        <p
                          className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.12em]"
                          style={{ color: tone.ink50 }}
                        >
                          {t[group.key]}
                        </p>
                        <div className="grid grid-cols-2 gap-1">
                          {group.items.filter((item) => !item.leaderOnly || mayUseTeamWorkspace).map((item) => {
                            const active = isActive(item.href);
                            const ItemIcon = item.icon;
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                prefetch={false}
                                onClick={() => {
                                  setMobileOpen(false);
                                  setMobileToolsOpen(false);
                                  setMobileAdminOpen(false);
                                }}
                                className="flex h-10 items-center gap-2 rounded-md px-2 text-[12.5px] font-medium"
                                style={{
                                  color: active ? tone.ink : tone.ink50,
                                  background: active ? tone.paperDeep : "transparent",
                                }}
                              >
                                <ItemIcon size={14} strokeWidth={1.7} aria-hidden />
                                <span className="truncate">{t[item.key]}</span>
                              </Link>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
            {isAdmin && (
              <div
                className="col-span-2 mt-1 pt-1"
                style={{ borderTop: `1px solid ${tone.lineSoft}` }}
              >
                <button
                  type="button"
                  aria-expanded={mobileAdminOpen}
                  onClick={() => setMobileAdminOpen((open) => !open)}
                  className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-[13.5px] font-medium"
                  style={{
                    color: adminSectionActive ? tone.ink : tone.ink50,
                    background: adminSectionActive
                      ? tone.paperDeep
                      : "transparent",
                  }}
                >
                  <ShieldCheck size={16} strokeWidth={1.8} aria-hidden />
                  <span>{t.admin}</span>
                  <ChevronDown
                    size={15}
                    aria-hidden
                    className={`ml-auto transition-transform ${mobileAdminOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {mobileAdminOpen && (
                  <div className="mt-1 space-y-3 px-3 pb-2">
                    {adminGroups.map((group) => {
                      const GroupIcon = group.icon;
                      return (
                        <section key={group.key}>
                          <p
                            className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.12em]"
                            style={{ color: tone.ink50 }}
                          >
                            <GroupIcon size={13} strokeWidth={1.7} aria-hidden />
                            {t[group.key]}
                          </p>
                          <div className="grid grid-cols-2 gap-1">
                            {group.items.map((item) => {
                              const active = isActive(item.href);
                              return (
                                <Link
                                  key={item.href}
                                  href={item.href}
                                  prefetch={false}
                                  onClick={() => {
                                    setMobileOpen(false);
                                    setMobileAdminOpen(false);
                                  }}
                                  className="flex h-10 items-center rounded-md px-2 text-[12.5px] font-medium"
                                  style={{
                                    color: active ? tone.ink : tone.ink50,
                                    background: active ? tone.paperDeep : "transparent",
                                  }}
                                >
                                  {t[item.key]}
                                </Link>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
