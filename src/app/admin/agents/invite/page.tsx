import { requireAdmin } from "@/lib/auth-guards";
import { InvitePageContent } from "@/app/invite/invite-page-content";
export const metadata = { title: "Invite · Homix Admin" };
export default async function Page() {
  await requireAdmin();
  return <InvitePageContent admin />;
}
