"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { HomixMark, Icons } from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/sales", label: "Sales" },
  { href: "/rental", label: "Rental" },
  { href: "/training", label: "Training" },
  { href: "/resources", label: "Resources" },
  { href: "/agents", label: "Agents", adminOnly: true },
  { href: "/reports", label: "Reports", adminOnly: true },
  { href: "/settings", label: "Settings", adminOnly: true },
];

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

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
    if (href === "/agents") return pathname === "/agents" || /^\/agents\/\d+/.test(pathname);
    return pathname === href;
  };

  const isAdmin = session?.user?.isAdmin || false;
  const visibleItems = navItems.filter((it) => !it.adminOnly || isAdmin);
  const initials = getInitials(session?.user?.name, session?.user?.email);

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
              {visibleItems.map((item) => {
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
          <div className="flex items-center gap-3" ref={menuRef}>
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
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="w-9 h-9 rounded-full flex items-center justify-center font-medium hover:opacity-90 transition-opacity"
                style={{ background: tone.accent, color: "#fff", fontSize: 13 }}
                aria-label="User menu"
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
                      {session?.user?.name || "Signed in"}
                    </div>
                    <div className="text-[12px] mt-0.5 truncate" style={{ color: tone.ink50 }}>
                      {session?.user?.email}
                    </div>
                    {isAdmin && (
                      <div
                        className="mt-2 inline-block px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider"
                        style={{ background: tone.accentSoft, color: tone.accent }}
                      >
                        Admin
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="w-full text-left px-4 py-3 text-[13px] hover:bg-[#FAF7F0] transition-colors"
                    style={{ color: tone.ink70 }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
