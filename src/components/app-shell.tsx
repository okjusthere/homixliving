"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { Nav } from "@/components/nav";

const NAV_FREE_PREFIXES = ["/login", "/pending", "/pay"];

function isPathOrChild(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();

  // If signed in but not yet activated, send to /pending (unless already there)
  useEffect(() => {
    if (status !== "authenticated" || !session) return;
    const onPending = pathname === "/pending";
    const onPublic = NAV_FREE_PREFIXES.some((p) => isPathOrChild(pathname, p));
    if (onPublic) return;
    if (!session.user.isActive && !session.user.isAdmin && !onPending) {
      router.replace("/pending");
    }
  }, [session, status, pathname, router]);

  const noShell = NAV_FREE_PREFIXES.some((p) => isPathOrChild(pathname, p));
  if (noShell) {
    return <>{children}</>;
  }

  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-[1280px] px-8 py-10">{children}</div>
      </main>
      <footer
        className="mx-auto max-w-[1280px] px-8 py-10 flex items-center justify-between text-[11px] w-full"
        style={{ color: "#7A756C" }}
      >
        <div className="font-mono">homix-deals v2.0</div>
        <div>© 2026 Homix Deals · Homix Group</div>
      </footer>
    </>
  );
}
