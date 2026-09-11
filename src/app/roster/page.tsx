import { redirect } from "next/navigation";
import { legacyAdminUrl } from "@/lib/admin-navigation";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(legacyAdminUrl("/admin/agents", { ...await searchParams, view: "public" }));
}
