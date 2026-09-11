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
  Image,
  Mail,
  LineChart,
  ShieldCheck,
  UsersRound,
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
] as const;

const workspaceGroups = [
  {
    key: "personalMarketing",
    items: [
      { href: "/content", key: "content", icon: Image, leaderOnly: false },
      { href: "/marketing/email", key: "emailMarketing", icon: Mail, leaderOnly: false },
    ],
  },
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

const LABELS = {
  en: {
    personalMarketing: "Personal marketing",
    overview: "Overview", sales: "Sales", rental: "Rental", training: "Training",
    resources: "Resource library", onboarding: "Onboarding guide", coach: "AI coach", offer: "Offers", share: "Share center", content: "Content studio", emailMarketing: "Email marketing",
    agents: "Agents", teams: "Teams", reports: "Performance report", finance: "Finance", payouts: "Payouts", audit: "Audit", feedbackInbox: "Feedback inbox", settings: "Settings",
    search: "Search", signedIn: "Signed in", signOut: "Sign out", admin: "Admin center", profile: "Public profile", accountProfile: "My profile", inviteJoin: "Invite to join",
    menu: "Menu", switchLanguage: "Switch language", userMenu: "User menu", workspace: "Workspace", market: "Market overview", expiredListings: "Expired listings",
    transactionSupport: "Transaction support", learningGrowth: "Learning & growth", companyPerformance: "Company & performance",
    peopleManagement: "People", financeManagement: "Finance", systemManagement: "System", teamWorkspace: "Team workspace", anonymousFeedback: "Anonymous feedback",
    personalWorkspace: "Personal", workspaceMode: "Workspace mode",
  },
  zh: {
    personalMarketing: "个人营销",
    overview: "概览", sales: "买卖", rental: "租赁", training: "培训",
    resources: "资料库", onboarding: "入职指南", coach: "AI 教练", offer: "报价", share: "分享中心", content: "内容中心", emailMarketing: "邮件营销",
    agents: "经纪人", teams: "团队", reports: "业绩报表", finance: "财务", payouts: "发放", audit: "审计", feedbackInbox: "建议收件箱", settings: "设置",
    search: "搜索", signedIn: "已登录", signOut: "退出登录", admin: "管理中心", profile: "个人主页", accountProfile: "我的档案", inviteJoin: "邀请加入",
    menu: "菜单", switchLanguage: "切换语言", userMenu: "用户菜单", workspace: "工作台", market: "市场概览", expiredListings: "已过期房源",
    transactionSupport: "交易支持", learningGrowth: "学习成长", companyPerformance: "公司与业绩",
    peopleManagement: "人员管理", financeManagement: "财务管理", systemManagement: "系统管理", teamWorkspace: "团队工作台", anonymousFeedback: "匿名建议",
    personalWorkspace: "个人", workspaceMode: "工作台切换",
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
  const menuRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const locale = useLocale();
  const t = LABELS[locale];
  const toggleLocale = () => {
    const next = locale === "zh" ? "en" : "zh";
    document.cookie = `locale=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  useEffect(() => {
    if (!menuOpen && !toolsMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuOpen && !menuRef.current?.contains(target)) setMenuOpen(false);
      if (toolsMenuOpen && !toolsMenuRef.current?.contains(target)) {
        setToolsMenuOpen(false);
      }

    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen, toolsMenuOpen]);

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
    if (href === "/content" || href === "/marketing/email") return pathname === href || pathname.startsWith(`${href}/`);
    return pathname === href;
  };

  const isAdmin = session?.user?.isAdmin || false;
  const mayUseTeamWorkspace = isAdmin || Boolean(session?.user?.isTeamLeader);
  const primaryItems = navItems.filter((item) => !item.adminOnly);
  const toolsSectionActive = workspaceGroups.some((group) =>
    group.items.some((item) => (!item.leaderOnly || mayUseTeamWorkspace) && isActive(item.href)),
  );
  const initials = getInitials(session?.user?.name, session?.user?.email);

  return (
    <nav
      className="sticky top-0 z-30"
      style={{ background: tone.card, borderBottom: `1px solid ${tone.line}` }}
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
        <div className="h-16 flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
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
            {mayUseTeamWorkspace && (
              <div
                className="hidden shrink-0 items-center rounded-lg p-1 sm:flex xl:hidden"
                style={{ background: tone.paperDeep, border: `1px solid ${tone.lineSoft}` }}
                aria-label={t.workspaceMode}
              >
                <Link
                  href="/"
                  prefetch={false}
                  aria-current={pathname === "/" ? "page" : undefined}
                  className="flex h-7 items-center rounded-md px-2.5 text-[11.5px] font-medium transition-colors"
                  style={{
                    background: pathname === "/" ? tone.card : "transparent",
                    color: pathname === "/" ? tone.ink : tone.ink50,
                    boxShadow: pathname === "/" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  {t.personalWorkspace}
                </Link>
                <Link
                  href="/team-workspace"
                  prefetch={false}
                  aria-current={pathname.startsWith("/team-workspace") ? "page" : undefined}
                  className="flex h-7 items-center rounded-md px-2.5 text-[11.5px] font-medium transition-colors"
                  style={{
                    background: pathname.startsWith("/team-workspace") ? tone.card : "transparent",
                    color: pathname.startsWith("/team-workspace") ? tone.ink : tone.ink50,
                    boxShadow: pathname.startsWith("/team-workspace") ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  {t.teamWorkspace}
                </Link>
              </div>
            )}
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
                    className="absolute left-1/2 top-11 z-50 grid -translate-x-1/2 w-[680px] max-w-[calc(100vw-3rem)] grid-cols-4 gap-1 rounded-xl p-4 shadow-lg"
                    style={{
                      background: tone.card,
                      border: `1px solid ${tone.line}`,
                      boxShadow: "0 16px 40px -16px rgba(41,37,30,0.22)",
                    }}
                  >
                    {workspaceGroups.map((group, groupIndex) => {
                      return (
                        <section
                          key={group.key}
                          className={`min-w-0 px-1 ${groupIndex > 0 ? "border-l pl-3" : ""}`}
                          style={{ borderColor: tone.lineSoft }}
                        >
                          <p
                            className="px-2 pb-3 pt-1 text-[11px] font-medium tracking-[0.08em]"
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
                <Link href="/admin" prefetch={false} className="flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium hover:bg-[#F6F1E8]" style={{ color: tone.ink70 }}>
                  <ShieldCheck size={14} strokeWidth={1.8} aria-hidden />{t.admin}
                </Link>
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
                      <Link
                        href="/invite"
                        prefetch={false}
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-3 text-[13px] hover:bg-[#FAF7F0] transition-colors"
                        style={{ color: tone.ink70, borderBottom: `1px solid ${tone.lineSoft}` }}
                      >
                        {t.inviteJoin}
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
            {mayUseTeamWorkspace && (
              <div
                className="col-span-2 mb-1 mt-3 grid grid-cols-2 rounded-lg p-1"
                style={{ background: tone.paperDeep, border: `1px solid ${tone.lineSoft}` }}
                aria-label={t.workspaceMode}
              >
                <Link
                  href="/"
                  prefetch={false}
                  onClick={() => setMobileOpen(false)}
                  className="flex h-10 items-center justify-center rounded-md text-[13px] font-medium"
                  style={{
                    background: pathname === "/" ? tone.card : "transparent",
                    color: pathname === "/" ? tone.ink : tone.ink50,
                  }}
                >
                  {t.personalWorkspace}
                </Link>
                <Link
                  href="/team-workspace"
                  prefetch={false}
                  onClick={() => setMobileOpen(false)}
                  className="flex h-10 items-center justify-center rounded-md text-[13px] font-medium"
                  style={{
                    background: pathname.startsWith("/team-workspace") ? tone.card : "transparent",
                    color: pathname.startsWith("/team-workspace") ? tone.ink : tone.ink50,
                  }}
                >
                  {t.teamWorkspace}
                </Link>
              </div>
            )}
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
              <Link href="/admin" prefetch={false} onClick={() => setMobileOpen(false)} className="col-span-2 flex min-h-11 items-center gap-2 rounded-md border-t border-line px-3 text-sm font-medium">
                <ShieldCheck size={16} aria-hidden />{t.admin}
              </Link>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
