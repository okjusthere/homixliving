import { requireAdmin } from "@/lib/auth-guards";
import { SigningAdministration } from "@/components/signing/administration";

export const metadata = { title: "签署管理 · Homix" };
export default async function SigningAdminPage() {
  await requireAdmin();
  return <SigningAdministration />;
}
