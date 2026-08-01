"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Btn } from "@/components/homix/primitives";
import { HomixMark } from "@/components/homix/brand-mark";
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
  const checkInFlight = useRef(false);
  const effectiveStatus = session?.user?.accountStatus ?? accountStatus;

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

  const refreshApproval = useCallback(async (showProgress = true) => {
    if (checkInFlight.current) return;
    checkInFlight.current = true;
    if (showProgress) setChecking(true);
    try {
      const refreshed = await update();
      redirectIfApproved(refreshed || session);
    } catch (error) {
      console.error("Unable to refresh approval status", error);
    } finally {
      checkInFlight.current = false;
      if (showProgress) setChecking(false);
    }
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
    // Refresh immediately so a previously approved user does not bounce
    // between /pending and /. Ongoing checks are scoped to this page below.
    void refreshApproval(false);
  }, [refreshApproval, router, session, session?.user?.email, status]);

  useEffect(() => {
    if (
      status !== "authenticated" ||
      !session?.user?.email ||
      effectiveStatus !== "pending"
    ) {
      return;
    }

    const checkNow = () => {
      if (document.visibilityState === "visible") void refreshApproval(false);
    };
    const interval = window.setInterval(checkNow, 15_000);
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") checkNow();
    };

    window.addEventListener("focus", checkNow);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", checkNow);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [effectiveStatus, refreshApproval, session?.user?.email, status]);

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
            {effectiveStatus === "inactive" ? "–" : "⏳"}
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
            {effectiveStatus === "inactive" ? "Account inactive" : "Pending approval"}
          </h1>
          <p className="text-[14px]" style={{ color: tone.ink70 }}>
            {effectiveStatus === "inactive"
              ? "This account has been deactivated. Contact a Homix administrator if you believe this is a mistake."
              : "Your account has been created. An admin needs to activate it before you can start working."}
          </p>
          <p className="text-[12px] mt-4" style={{ color: tone.ink50 }}>
            {effectiveStatus === "inactive"
              ? "Your historical deals and payment records remain retained by the company."
              : "This page checks automatically. Once approved, you will enter Homix Agents without signing out."}
          </p>

          <div className="mt-6 grid gap-2">
            {effectiveStatus === "pending" && (
              <Btn
                variant="primary"
                size="md"
                type="button"
                className="w-full justify-center"
                onClick={() => void refreshApproval(true)}
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
