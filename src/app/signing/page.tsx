import { Suspense } from "react";
import { requireActiveAgent } from "@/lib/auth-guards";
import { SigningWorkspace } from "@/components/signing/workspace";

export const metadata = { title: "文件签署 · Homix" };
export default async function SigningPage() {
  await requireActiveAgent();
  return (
    <Suspense
      fallback={
        <div className="p-6" aria-busy="true">
          …
        </div>
      }
    >
      <SigningWorkspace />
    </Suspense>
  );
}
