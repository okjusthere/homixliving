import { redirect } from "next/navigation";
import { legacyAdminUrl } from "@/lib/admin-navigation";
export default async function LegacyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(legacyAdminUrl("/admin/payouts", await searchParams));
}
