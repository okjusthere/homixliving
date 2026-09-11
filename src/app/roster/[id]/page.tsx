import { redirect } from "next/navigation";
import { legacyAdminUrl } from "@/lib/admin-navigation";
export default async function LegacyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  redirect(legacyAdminUrl(`/admin/agents/website/${encodeURIComponent(id)}`, await searchParams));
}
