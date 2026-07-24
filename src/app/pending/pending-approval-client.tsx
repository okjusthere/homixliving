"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Btn } from "@/components/homix/primitives";
import { HomixMark } from "@/components/homix/server-primitives";
import { tone } from "@/components/homix/tokens";

export function PendingApprovalClient({
  initialIsApproved,
  accountStatus,
}: {
  initialIsApproved: boolean;
  accountStatus: "pending" | "active" | "inactive";
}) {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [checking, setChecking] = useState(initialIsApproved);
  const checkedOnce = useRef(false);

  const redirectIfApproved = useCallback(
    (effectiveSession: typeof session) => {
      if (effectiveSession?.user.isAdmin || effectiveSession?.user.accountStatus === "active") {
        router.replace("/");
        router.refresh();
        return true;
      }

      return false;
    },
    [router]
  );

  const refreshApproval = useCallback(async () => {
    setChecking(true);
    const refreshed = await update();
    if (!redirectIfApproved(refreshed || session)) setChecking(false);
  }, [redirectIfApproved, session, update]);

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated" || !session?.user?.email) {
      router.replace("/login");
      return;
    }

    if (checkedOnce.current) return;
    checkedOnce.current = true;

    // Approval changes live in the DB, but proxy reads the JWT cookie.
    // Refresh once so approved users do not bounce between /pending and /.
    let cancelled = false;
    async function refreshSessionCookie() {
      const refreshed = await update();
      if (cancelled) return;
      if (!redirectIfApproved(refreshed || session)) setChecking(false);
    }

    void refreshSessionCookie();
    return () => {
      cancelled = true;
    };
  }, [redirectIfApproved, router, session, session?.user?.email, status, update]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <HomixMark size={36} />
        </div>

        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: tone.card, border: `1px solid ${tone.line}` }}
        >
          <div
            className="text-[40px] mb-3"
            style={{ lineHeight: 1 }}
            aria-hidden
          >
            {accountStatus === "inactive" ? "–" : "⏳"}
          </div>
          <h1
            className="font-serif"
            style={{
              fontSize: 30,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: tone.ink,
              marginBottom: 12,
            }}
          >
            {accountStatus === "inactive" ? "Account inactive" : "Pending approval"}
          </h1>
          <p className="text-[14px]" style={{ color: tone.ink70 }}>
            {accountStatus === "inactive"
              ? "This account has been deactivated. Contact a Homix administrator if you believe this is a mistake."
              : "Your account has been created. An admin needs to activate it before you can start working."}
          </p>
          <p className="text-[12px] mt-4" style={{ color: tone.ink50 }}>
            {accountStatus === "inactive"
              ? "Your historical deals and payment records remain retained by the company."
              : "Reach out to your team lead — they’ll see you in the Agents page."}
          </p>

          <div className="mt-6 grid gap-2">
            {accountStatus === "pending" && (
              <Btn
                variant="primary"
                size="md"
                type="button"
                className="w-full justify-center"
                onClick={() => void refreshApproval()}
                disabled={checking}
              >
                {checking ? "Checking approval..." : "Check approval"}
              </Btn>
            )}
            <Btn
              variant="outline"
              size="md"
              type="button"
              className="w-full justify-center"
              onClick={() => void signOut({ redirectTo: "/login" })}
            >
              Sign out
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
