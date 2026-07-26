/**
 * Onboarding completeness, derived — never stored.
 *
 * A new agent isn't "ready to work" until several unrelated things are true:
 * they can get paid, they're licensed on file, and they exist on the public
 * site. Those facts already live in three places (portal.agents,
 * portal.agent_payment_profiles, public.agents), but nothing tied them
 * together, so neither the agent nor an admin could answer "what's still
 * missing?".
 *
 * This computes that answer from data we already have. Deriving beats storing
 * a checklist: it can't drift out of sync, needs no backfill for the ~49
 * existing agents, and a step un-completes automatically if its data is
 * cleared (e.g. a W-9 is deleted).
 *
 * Deliberately NOT a gate. Homix wants advisors on the public site early — a
 * roster that looks well-staffed matters more than every profile being
 * polished — so an incomplete profile still publishes. This only *surfaces*
 * what's left.
 */

export type OnboardingStepId =
  | "account"
  | "license"
  | "publicProfile"
  | "photo"
  | "bio"
  | "payout"
  | "w9";

export type OnboardingStep = {
  id: OnboardingStepId;
  /** Done, per the underlying data. */
  done: boolean;
  /** The agent can finish this themselves (vs. needing an admin). */
  selfServe: boolean;
  /** In-app destination that completes the step. */
  href: string;
};

/** Everything the calculation needs. All fields optional so callers can pass
 *  whatever they have — a missing source degrades to "not done", never throws. */
export type OnboardingInput = {
  accountStatus?: string | null;
  licenseNumber?: string | null;
  /** The linked public profile, when one exists. */
  publicProfile?: {
    photoUrl?: string | null;
    bio?: string | null;
  } | null;
  hasPublicProfile?: boolean;
  payment?: {
    routingNumber?: string | null;
    accountNumber?: string | null;
    payeeName?: string | null;
    w9ObjectKey?: string | null;
  } | null;
};

/** The stock placeholder the website assigns before a real headshot exists. */
const PLACEHOLDER_PHOTO = "/agent-placeholder-logo.png";

function hasText(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export function computeOnboarding(input: OnboardingInput): {
  steps: OnboardingStep[];
  completed: number;
  total: number;
  /** 0-100, for a progress bar. */
  percent: number;
  /** True once nothing is outstanding. */
  complete: boolean;
  /** Steps the agent can act on themselves — what to nudge them about. */
  remainingSelfServe: OnboardingStep[];
} {
  const photo = input.publicProfile?.photoUrl;
  const linked = input.hasPublicProfile ?? Boolean(input.publicProfile);

  const steps: OnboardingStep[] = [
    {
      id: "account",
      done: input.accountStatus === "active",
      selfServe: false, // an admin approves this
      href: "/",
    },
    {
      id: "license",
      done: hasText(input.licenseNumber),
      selfServe: true,
      href: "/profile",
    },
    {
      id: "publicProfile",
      done: linked,
      selfServe: false, // an admin links or creates the website profile
      href: "/profile/public",
    },
    {
      // A placeholder counts as missing — it's the most visible gap on the
      // public site, and the whole point of the step.
      id: "photo",
      done: hasText(photo) && photo !== PLACEHOLDER_PHOTO,
      selfServe: true,
      href: "/profile/public",
    },
    {
      id: "bio",
      done: hasText(input.publicProfile?.bio),
      selfServe: true,
      href: "/profile/public",
    },
    {
      // Payable = we know where the money goes.
      id: "payout",
      done:
        hasText(input.payment?.routingNumber) &&
        hasText(input.payment?.accountNumber) &&
        hasText(input.payment?.payeeName),
      selfServe: true,
      href: "/profile",
    },
    {
      id: "w9",
      done: hasText(input.payment?.w9ObjectKey),
      selfServe: true,
      href: "/profile",
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;
  return {
    steps,
    completed,
    total,
    percent: total === 0 ? 100 : Math.round((completed / total) * 100),
    complete: completed === total,
    remainingSelfServe: steps.filter((s) => !s.done && s.selfServe),
  };
}

/** Bilingual labels, kept next to the definition so a new step can't ship
 *  without copy. Pages pass their own locale. */
export const ONBOARDING_LABELS: Record<
  "en" | "zh",
  Record<OnboardingStepId, string>
> = {
  en: {
    account: "Portal account approved",
    license: "License number on file",
    publicProfile: "Website profile linked",
    photo: "Headshot uploaded",
    bio: "Bio written",
    payout: "Payout account set up",
    w9: "W-9 uploaded",
  },
  zh: {
    account: "后台账号已开通",
    license: "已登记执照号",
    publicProfile: "已关联官网主页",
    photo: "已上传头像",
    bio: "已填写简介",
    payout: "已设置收款账户",
    w9: "已上传 W-9",
  },
};
