"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LoaderCircle } from "lucide-react";
import { refreshApprovalSession } from "@/app/pending/approval-session";

const M = {
  en: {
    processing: "Activating your Homix Agents access…",
    lead: "This normally finishes within a few seconds. You will enter the Portal automatically.",
    delayed: "Payment is recorded, but activation is taking longer than expected.",
    continue: "Check activation status",
  },
  zh: {
    processing: "正在开通 Homix Agents…",
    lead: "通常几秒内完成，开通后会自动进入 Portal。",
    delayed: "付款已经记录，但自动开通所需时间比预期更长。",
    continue: "检查开通状态",
  },
} as const;

export function OnboardingActivationRedirect({ locale }: { locale: keyof typeof M }) {
  const t = M[locale];
  const router = useRouter();
  const { update } = useSession();
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const checkActivation = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const response = await fetch("/api/onboarding/profile", { cache: "no-store" });
        const payload = response.ok ? await response.json() : null;
        if (payload?.profile?.accountStatus === "active") {
          const refreshed = await refreshApprovalSession(update);
          if (refreshed?.user?.accountStatus === "active" || refreshed?.user?.isAdmin) {
            router.replace("/");
            router.refresh();
            return;
          }
        }
      } catch (error) {
        console.error("Unable to check onboarding activation", error);
      }
      if (attempts >= 15) {
        setDelayed(true);
        return;
      }
      timer = setTimeout(checkActivation, 2_000);
    };

    void checkActivation();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [router, update]);

  return (
    <div className="mt-8 rounded-lg border border-line bg-paper-deep px-4 py-4">
      {!delayed ? (
        <div className="flex items-start gap-3">
          <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin text-homix-green" />
          <div>
            <p className="text-[14px] font-medium text-ink">{t.processing}</p>
            <p className="mt-1 text-[13px] leading-5 text-ink-50">{t.lead}</p>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-[14px] text-ink">{t.delayed}</p>
          <Link
            href="/pending"
            className="mt-3 inline-flex h-10 items-center justify-center rounded-md bg-ink px-4 text-[14px] text-white transition hover:opacity-90"
          >
            {t.continue}
          </Link>
        </div>
      )}
    </div>
  );
}
