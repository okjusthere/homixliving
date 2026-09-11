import { requireActiveAgent } from "@/lib/auth-guards";
import { redirect } from "next/navigation";
import { ContentAdmin } from "@/components/content/admin";
export const metadata = { title: "Content templates · Homix" };
export default async function Page() {
  const s = await requireActiveAgent();
  if (!s.user.isAdmin) redirect("/content");
  return <ContentAdmin />;
}
