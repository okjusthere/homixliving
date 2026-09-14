import { signingErrorMessage } from "@/lib/signing-contract";

export class SigningFetchError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function signingFetch<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/signing/${path}`, {
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new SigningFetchError(
      typeof result.error === "string" ? result.error : "SIGNING_UNAVAILABLE",
      response.status,
    );
  return result as T;
}
export function errorText(error: unknown, zh: boolean) {
  return signingErrorMessage(
    error instanceof Error ? error.message : undefined,
    zh,
  );
}
export const signingButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50";
export const signingInput =
  "mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm";
export const categories = {
  zh: {
    all: "全部",
    mine: "待我处理",
    draft: "草稿",
    waiting: "待他人签署",
    completed: "已完成",
    attention: "需要处理",
  },
  en: {
    all: "All",
    mine: "My actions",
    draft: "Drafts",
    waiting: "Awaiting others",
    completed: "Completed",
    attention: "Needs attention",
  },
};
export const nativeStatus = {
  zh: {
    DRAFT: "草稿",
    PENDING: "签署中",
    COMPLETED: "已完成",
    REJECTED: "已拒签",
    CANCELLED: "已取消",
  },
  en: {
    DRAFT: "Draft",
    PENDING: "Signing",
    COMPLETED: "Completed",
    REJECTED: "Declined",
    CANCELLED: "Cancelled",
  },
};
