import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { anonymousSuggestions } from "@/db/schema";
import { requireActiveAgent } from "@/lib/auth-guards";
import { getLocale } from "@/lib/i18n";
import { PageHeader } from "@/components/homix/page-kit";
import { FeedbackInbox } from "./feedback-inbox";

export const metadata: Metadata = { title: "Feedback inbox · Homix" };

export default async function FeedbackAdminPage() {
  const session = await requireActiveAgent();
  if (!session.user.isAdmin) redirect("/");
  const locale = await getLocale();
  const rows = await db.select().from(anonymousSuggestions).orderBy(desc(anonymousSuggestions.createdAt));
  return (
    <div className="space-y-7">
      <PageHeader eyebrow={locale === "zh" ? "管理员" : "Admin"} title={locale === "zh" ? "匿名建议" : "Anonymous feedback"} description={locale === "zh" ? "这里只有建议内容，不包含提交人身份。" : "Only submission content is stored; sender identity is not available."} />
      <FeedbackInbox initialRows={rows} />
    </div>
  );
}
