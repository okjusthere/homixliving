"use client";

import { usePathname, useRouter, useSelectedLayoutSegment } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { Nav } from "@/components/nav";
import Link from "next/link";
import { useLocale } from "@/lib/i18n-client";

const NAV_FREE_PREFIXES = ["/login", "/pending", "/join", "/pay", "/claim"];

function isPathOrChild(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const segment = useSelectedLayoutSegment();
  const router = useRouter();
  const { data: session, status } = useSession();
  const locale = useLocale();

  // If signed in but not yet activated, send to /pending (unless already there)
  useEffect(() => {
    if (status !== "authenticated" || !session) return;
    const onPending = pathname === "/pending";
    const onPublic = NAV_FREE_PREFIXES.some((p) => isPathOrChild(pathname, p));
    if (onPublic || ["/limited", "/training", "/resources"].includes(pathname)) return;
    if (session.user.accountStatus !== "active" && !session.user.isAdmin && !onPending) {
      router.replace("/pending");
    }
  }, [session, status, pathname, router]);

  // Render from the matched route tree, which is identical during SSR and
  // hydration. A static 404 may have a /login/... browser URL even though its
  // server pathname is /_not-found; testing that URL would change the markup.
  const noShell = NAV_FREE_PREFIXES.includes(`/${segment}`);
  if (noShell || segment === "admin") {
    return <>{children}</>;
  }

  return (
    <>
      <Nav />
      <main className="min-w-0 w-full flex-1">
        <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-8 sm:py-10">{children}</div>
      </main>
      <footer
        className="mx-auto max-w-[1280px] px-4 py-6 sm:px-8 sm:py-10 flex items-center justify-between text-[11px] w-full"
        style={{ color: "#7A756C" }}
      >
        <div className="font-mono">agents.homixny.com</div>
        <div className="flex items-center gap-4">
          {session?.user?.accountStatus === "active" && (
            <Link href="/feedback" prefetch={false} className="hover:underline">
              {locale === "zh" ? "匿名建议" : "Anonymous feedback"}
            </Link>
          )}
          <span>© 2026 Homix</span>
        </div>
      </footer>
    </>
  );
}
