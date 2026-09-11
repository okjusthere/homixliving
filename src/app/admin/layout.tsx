import { requireAdmin } from "@/lib/auth-guards";
import { AdminShell } from "@/components/admin/admin-shell";
import "./admin.css";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();
  return <AdminShell email={session.user.email || ""}>{children}</AdminShell>;
}
