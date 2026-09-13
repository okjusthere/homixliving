import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireActiveAgent } from "@/lib/auth-guards";
import { SigningDetail } from "@/components/signing/detail";

export default async function SigningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireActiveAgent();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return (
    <Suspense
      fallback={
        <div className="p-6" aria-busy="true">
          …
        </div>
      }
    >
      <SigningDetail id={id} />
    </Suspense>
  );
}
