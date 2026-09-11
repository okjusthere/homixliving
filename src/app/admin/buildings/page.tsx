import { requireAdmin } from "@/lib/auth-guards";
import BuildingsPage from "@/app/buildings/page";
export const metadata = { title: "Buildings · Homix" };
export default async function Page() {
  await requireAdmin();
  return <BuildingsPage />;
}
