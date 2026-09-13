import { currentSession } from "@/lib/auth-guards";
import { redirect } from "next/navigation";
import { PendingApprovalClient } from "./pending-approval-client";

export default async function PendingApprovalPage() {
  const session = await currentSession();

  if (!session?.user?.email) {
    redirect("/login");
  }

  return (
    <PendingApprovalClient
      accountStatus={session.user.accountStatus}
      limitedCapabilities={session.user.limitedCapabilities || []}
    />
  );
}
