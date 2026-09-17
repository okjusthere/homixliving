"use client";

import { PageRecovery } from "@/components/page-recovery";

export default function ErrorPage({ unstable_retry }: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  // Error details belong in server diagnostics, never in the recovery screen.
  return <PageRecovery onRetry={unstable_retry} />;
}
