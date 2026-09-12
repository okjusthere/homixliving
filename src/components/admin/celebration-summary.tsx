import Link from "next/link";
import { birthdayList } from "@/lib/celebrations/data";
export async function CelebrationSummary({ zh }: { zh: boolean }) {
  const results = await Promise.allSettled([
    birthdayList("today"),
    birthdayList("today", "", 1, undefined, "anniversary"),
  ]);
  return (
    <section className="rounded-lg border border-line bg-white p-5">
      <h2 className="font-medium mb-4">
        {zh ? "今天的庆祝事项" : "Today’s celebrations"}
      </h2>
      <div className="grid gap-5 sm:grid-cols-2">
        {results.map((result, i) => (
          <div key={i}>
            <Link
              className="text-sm underline"
              href={`/admin/agents?view=${i === 0 ? "birthdays" : "anniversaries"}`}
            >
              {i === 0
                ? zh
                  ? "今天生日"
                  : "Birthdays today"
                : zh
                  ? "入职纪念日"
                  : "Work anniversaries"}{" "}
              →
            </Link>
            {result.status === "rejected" ? (
              <p className="mt-2 text-sm text-ink-50">
                {zh
                  ? "暂时无法读取，请进入名册重试。"
                  : "Unavailable; open the roster to retry."}
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm">
                  {result.value.total === 0
                    ? zh
                      ? "今天暂无已登记事项。"
                      : "No recorded celebrations today."
                    : result.value.rows.map((r) => r.name).join("、") +
                      (result.value.total > 25
                        ? ` +${result.value.total - 25}`
                        : "")}
                </p>
                {result.value.rows.some((r) =>
                  ["blocked", "failed", "needs_review"].includes(r.status),
                ) && (
                  <p className="mt-1 text-xs text-amber-800">
                    {zh
                      ? "有海报需要管理员处理"
                      : "Some posters need attention"}
                  </p>
                )}
                {result.value.counts.missing > 0 && (
                  <Link
                    className="block mt-1 text-xs text-ink-50 underline"
                    href={`/admin/agents?view=${i === 0 ? "birthdays" : "anniversaries"}&period=missing`}
                  >
                    {zh
                      ? `${result.value.counts.missing} 人待补日期`
                      : `${result.value.counts.missing} dates missing`}
                  </Link>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
