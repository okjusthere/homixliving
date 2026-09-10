import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PendingApprovalClient } from "./pending-approval-client";

export default async function PendingApprovalPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/login");
  }

  return (
    <PendingApprovalClient
      accountStatus={session.user.accountStatus}
    />
  );
}
