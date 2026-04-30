"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomixMark, Icons } from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/invoices", label: "Invoices" },
  { href: "/invoices/new", label: "New Invoice" },
  { href: "/buildings", label: "Buildings" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/invoices") return pathname === "/invoices" || /^\/invoices\/\d+/.test(pathname);
    return pathname === href;
  };

  return (
    <nav
      className="sticky top-0 z-30"
      style={{ background: tone.card, borderBottom: `1px solid ${tone.line}` }}
    >
      <div className="mx-auto max-w-[1280px] px-8">
        <div className="h-16 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <Link href="/">
              <HomixMark />
            </Link>
            <div className="flex items-center gap-0.5">
              {navItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="px-3 h-9 rounded-md text-[13px] font-medium transition-colors flex items-center"
                    style={{
                      color: active ? tone.ink : tone.ink50,
                      background: active ? tone.paperDeep : "transparent",
                    }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 h-9 px-3 rounded-md"
              style={{ border: `1px solid ${tone.line}`, color: tone.ink50 }}
            >
              <span style={{ color: tone.ink30 }}>
                <Icons.Search />
              </span>
              <span className="text-[13px]">Search</span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                style={{ background: tone.paperDeep, color: tone.ink50 }}
              >
                ⌘K
              </span>
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center font-serif"
              style={{ background: tone.accent, color: "#fff", fontSize: 15 }}
            >
              H
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
