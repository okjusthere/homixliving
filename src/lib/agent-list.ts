import type { AdminAgentRow } from "@/lib/homixweb";

export function matchesAgentSearch(
  query: string,
  values: (string | null | undefined)[],
) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text = values.filter(Boolean).join(" ").toLocaleLowerCase();
  return terms.every((term) => text.includes(term));
}

export function websiteLinkState(
  row: Pick<AdminAgentRow, "portal_agent_id" | "linked_portal_agent">,
) {
  return row.portal_agent_id == null
    ? "unlinked"
    : row.linked_portal_agent
      ? "linked"
      : "broken";
}

export function moveListItem<T>(items: T[], from: number, to: number): T[] {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    from >= items.length ||
    to < 0 ||
    to >= items.length
  )
    return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function paginate<T>(
  items: T[],
  pageValue: string | null,
  sizeValue: string | null,
) {
  const size =
    sizeValue === "all"
      ? Math.max(items.length, 1)
      : sizeValue === "50"
        ? 50
        : 25;
  const pages = Math.max(1, Math.ceil(items.length / size));
  const raw = Number(pageValue);
  const page = Math.min(pages, Math.max(1, Number.isInteger(raw) ? raw : 1));
  return {
    page,
    pages,
    size,
    items: items.slice((page - 1) * size, page * size),
  };
}

export function agentListReturnUrl(
  value: string | null | undefined,
  fallback = "/admin/agents",
) {
  if (!value || /[\\\r\n]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://homix.local");
    if (
      url.origin !== "https://homix.local" ||
      !/^\/admin\/agents(?:\/\d+)?$/.test(url.pathname)
    )
      return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
