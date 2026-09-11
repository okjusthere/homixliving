import { requireAdmin } from "@/lib/auth-guards";
import { ContentAdmin } from "@/components/content/admin";
import "@/app/content/studio.css";
export const metadata = { title: "Poster management · Homix" };
export default async function Page() {
  await requireAdmin();
  return <ContentAdmin />;
}
