import type { Metadata } from "next";
import { requireActiveAgent } from "@/lib/auth-guards";
import { getLocale } from "@/lib/i18n";
import { PageHeader } from "@/components/homix/page-kit";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = { title: "Anonymous feedback · Homix" };

const M = {
  en: {
    eyebrow: "Speak freely",
    title: "Anonymous feedback",
    description: "Share a concern or idea without attaching your portal identity to the submission.",
  },
  zh: {
    eyebrow: "自由表达",
    title: "匿名建议",
    description: "提交意见或想法，建议记录不会关联你的 Portal 身份。",
  },
} as const;

export default async function FeedbackPage() {
  await requireActiveAgent();
  const t = M[await getLocale()];
  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />
      <FeedbackForm />
    </div>
  );
}
