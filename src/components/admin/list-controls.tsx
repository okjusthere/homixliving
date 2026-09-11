"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useLocale } from "@/lib/i18n-client";

export function useListQuery() {
  const params = useSearchParams();
  const pathname = usePathname();
  const update = (values: Record<string, string | null>, push = false) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const href = pathname + (next.size ? `?${next}` : "");
    window.history[push ? "pushState" : "replaceState"](null, "", href);
  };
  return { params, update, href: pathname + (params.size ? `?${params}` : "") };
}

export function ListPagination({
  total,
  page,
  pages,
  size,
  onChange,
}: {
  total: number;
  page: number;
  pages: number;
  size: string;
  onChange: (values: Record<string, string | null>) => void;
}) {
  const zh = useLocale() === "zh";
  return (
    <div className="list-pagination">
      <span>{zh ? `${total} 条结果` : `${total} results`}</span>
      <label className="flex items-center gap-2">
        {zh ? "每页" : "Per page"}
        <select
          className="admin-control"
          value={size}
          onChange={(e) => onChange({ size: e.target.value, page: null })}
        >
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="all">{zh ? "全部" : "All"}</option>
        </select>
      </label>
      <div className="flex items-center gap-2">
        <button
          className="admin-control"
          disabled={page <= 1}
          onClick={() => onChange({ page: String(page - 1) })}
          aria-label={zh ? "上一页" : "Previous page"}
        >
          ←
        </button>
        <span className="tabular-nums">
          {page} / {pages}
        </span>
        <button
          className="admin-control"
          disabled={page >= pages}
          onClick={() => onChange({ page: String(page + 1) })}
          aria-label={zh ? "下一页" : "Next page"}
        >
          →
        </button>
      </div>
    </div>
  );
}
