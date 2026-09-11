"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, ShieldCheck } from "lucide-react";
import { adminGroups, adminPathMatches } from "@/lib/admin-navigation";
import { useLocale } from "@/lib/i18n-client";

export function AdminShell({
  children,
  email,
}: {
  children: React.ReactNode;
  email: string;
}) {
  const pathname = usePathname();
  const locale = useLocale();
  const router = useRouter();
  const active = adminGroups
    .flatMap((g) => [...g.items])
    .find((item) => adminPathMatches(pathname, item.href));
  const navigation = (
    <nav aria-label={locale === "zh" ? "管理员导航" : "Administration"}>
      <Link
        href="/admin"
        className="admin-nav-item"
        aria-current={pathname === "/admin" ? "page" : undefined}
      >
        {locale === "zh" ? "管理概览" : "Overview"}
      </Link>
      {adminGroups.map((group) => (
        <section key={group.en} className="admin-nav-group">
          <p>{group[locale]}</p>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className="admin-nav-item"
              aria-current={
                adminPathMatches(pathname, item.href) ? "page" : undefined
              }
            >
              {item[locale]}
            </Link>
          ))}
        </section>
      ))}
      <a
        href="https://marketing.homixny.com"
        target="_blank"
        rel="noopener noreferrer"
        className="admin-nav-item mt-5"
      >
        {locale === "zh"
          ? "Email Service · 独立系统"
          : "Email Service · separate"}{" "}
        <ArrowUpRight size={14} aria-hidden />
      </a>
    </nav>
  );
  return (
    <div className="admin-shell">
      <a className="sr-only focus:not-sr-only" href="#admin-main">
        {locale === "zh" ? "跳到主要内容" : "Skip to content"}
      </a>
      <header className="admin-topbar">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <ShieldCheck size={19} aria-hidden /> HOMIX{" "}
          <span className="font-normal opacity-60">
            / {locale === "zh" ? "管理中心" : "Admin"}
          </span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden text-xs text-ink-50 lg:inline">{email}</span>
          <button
            type="button"
            onClick={() => {
              document.cookie = `locale=${locale === "zh" ? "en" : "zh"}; path=/; max-age=31536000; samesite=lax`;
              router.refresh();
            }}
            className="rounded border border-line px-2 py-1.5"
          >
            {locale === "zh" ? "EN" : "中文"}
          </button>
          <Link href="/" className="flex items-center gap-1.5">
            <ArrowLeft size={15} aria-hidden />
            <span>{locale === "zh" ? "工作台" : "Workspace"}</span>
          </Link>
        </div>
      </header>
      <div className="admin-layout">
        <aside className="admin-sidebar">{navigation}</aside>
        <div className="admin-content">
          <details key={pathname} className="admin-mobile-nav">
            <summary>
              {active?.[locale] ||
                (locale === "zh" ? "管理导航" : "Navigation")}
            </summary>
            {navigation}
          </details>
          <main id="admin-main">{children}</main>
        </div>
      </div>
    </div>
  );
}
