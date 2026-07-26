"use client";

/**
 * "Your setup" card — the one place an agent can see what's still outstanding.
 *
 * Shown on /profile (where most of the remaining work happens) and at the top
 * of /onboarding (which was pure reading material with no next action). Hides
 * itself entirely once everything is done, so it never nags a settled agent.
 */
import Link from "next/link";
import { Card } from "./primitives";
import { tone } from "./tokens";
import {
  ONBOARDING_LABELS,
  type OnboardingStep,
} from "@/lib/onboarding-progress";

const M = {
  en: {
    eyebrow: "Your setup",
    title: (done: number, total: number) => `${done} of ${total} complete`,
    lead: "Finish these so commissions reach you and your profile is live on homixny.com.",
    adminNote: "An admin handles this step.",
    allDone: "Setup complete",
  },
  zh: {
    eyebrow: "入职进度",
    title: (done: number, total: number) => `已完成 ${done} / ${total}`,
    lead: "补齐这几项，佣金才能顺利发放，个人主页也才会完整地出现在 homixny.com。",
    adminNote: "该项由管理员处理。",
    allDone: "资料已齐全",
  },
} as const;

export function OnboardingProgressCard({
  steps,
  completed,
  total,
  percent,
  complete,
  locale,
  className = "",
}: {
  steps: OnboardingStep[];
  completed: number;
  total: number;
  percent: number;
  complete: boolean;
  locale: "en" | "zh";
  className?: string;
}) {
  // Nothing outstanding — don't take up space on the page.
  if (complete) return null;

  const t = M[locale];
  const labels = ONBOARDING_LABELS[locale];

  return (
    <Card className={`overflow-hidden ${className}`}>
      <div className="px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div
            className="text-[11px] font-medium uppercase tracking-[0.14em]"
            style={{ color: tone.ink50 }}
          >
            {t.eyebrow}
          </div>
          <div className="font-mono text-[12px]" style={{ color: tone.ink50 }}>
            {t.title(completed, total)}
          </div>
        </div>

        {/* Progress bar */}
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: tone.paperDeep }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${percent}%`, background: tone.accent }}
          />
        </div>

        <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: tone.ink70 }}>
          {t.lead}
        </p>
      </div>

      <div className="divide-y" style={{ borderColor: tone.lineSoft }}>
        {steps.map((step) => {
          const label = labels[step.id];
          // Done steps stay listed (as confirmation) but aren't links.
          if (step.done) {
            return (
              <div
                key={step.id}
                className="flex items-center gap-3 px-5 py-2.5 sm:px-6"
              >
                <StepMark done />
                <span className="text-[13px]" style={{ color: tone.ink50 }}>
                  {label}
                </span>
              </div>
            );
          }
          const body = (
            <>
              <StepMark done={false} />
              <span className="flex-1 text-[13px]" style={{ color: tone.ink }}>
                {label}
              </span>
              {step.selfServe ? (
                <span aria-hidden style={{ color: tone.accent }}>
                  →
                </span>
              ) : (
                <span className="text-[11.5px]" style={{ color: tone.ink50 }}>
                  {t.adminNote}
                </span>
              )}
            </>
          );
          // Only link the steps the agent can actually finish — pointing them
          // at a page where they can't act would be a dead end.
          return step.selfServe ? (
            <Link
              key={step.id}
              href={step.href}
              className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-[#FAF7F0] sm:px-6"
            >
              {body}
            </Link>
          ) : (
            <div key={step.id} className="flex items-center gap-3 px-5 py-2.5 sm:px-6">
              {body}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function StepMark({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]"
      style={
        done
          ? { background: tone.accentSoft, color: tone.accent }
          : { border: `1px solid ${tone.line}`, color: "transparent" }
      }
    >
      {done ? "✓" : ""}
    </span>
  );
}
