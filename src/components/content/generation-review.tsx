"use client";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n-client";
import { ContentErrorDialog } from "./error-dialog";
import { contentFetch, Field } from "./ui";
import type { Generation } from "@/lib/content/types";
export function GenerationReview() {
  const zh = useLocale() === "zh",
    t = (en: string, cn: string) => (zh ? cn : en);
  const [jobs, setJobs] = useState<Generation[]>([]),
    [selected, setSelected] = useState<Generation | null>(null),
    [diagnostics, setDiagnostics] = useState<Record<string, unknown>>({}),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    contentFetch<{ generations: Generation[] }>(
      `/api/content/generations?admin=1&page=${page}`,
    )
      .then((r) => {
        if (active) setJobs(r.generations);
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, [page]);
  async function inspect(g: Generation) {
    setError("");
    setBusy(true);
    try {
      const r = await contentFetch<{
        generation: Generation;
        diagnostics: Record<string, unknown>;
      }>(`/api/content/generations/${g.id}`);
      setSelected(r.generation);
      setDiagnostics(r.diagnostics);
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="studio-grid">
      <main>
        <ContentErrorDialog
          message={error}
          onClose={() => setError("")}
          zh={zh}
        />
        <p className="studio-note">
          {t(
            "Review the provider request and workflow before closing an uncertain outcome. Closing does not start another paid generation.",
            "请先检查服务请求和 Workflow 记录，再关闭待检查状态。关闭操作不会触发新的付费生成。",
          )}
        </p>
        {jobs.map((g) => (
          <button
            key={g.id}
            className="studio-topic w-full mb-3"
            disabled={busy}
            onClick={() => inspect(g)}
          >
            <span>
              {g.input.listing?.address || g.input.headline || g.input.theme}
              <small>
                Agent #{g.ownerAgentId} · {g.status} ·{" "}
                {new Date(g.createdAt).toLocaleString()}
              </small>
            </span>
          </button>
        ))}
        <div className="studio-row">
          <button
            className="studio-button secondary"
            disabled={!page || busy}
            onClick={() => setPage((p) => p - 1)}
          >
            {t("Previous", "上一页")}
          </button>
          <button
            className="studio-button secondary"
            disabled={jobs.length < 24 || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("Next", "下一页")}
          </button>
        </div>
      </main>
      {selected && (
        <aside className="studio-panel">
          <h2>{t("Generation details", "生成详情")}</h2>
          <pre className="whitespace-pre-wrap break-all text-xs my-4">
            {JSON.stringify(
              {
                id: selected.id,
                status: selected.status,
                error: selected.error,
                usage: selected.usage,
                ...diagnostics,
              },
              null,
              2,
            )}
          </pre>
          {selected.outputAssetId && (
            <a
              className="studio-button secondary"
              href={`/api/content/assets/${selected.outputAssetId}`}
              target="_blank"
              rel="noreferrer"
            >
              {t("Open artwork", "查看作品")}
            </a>
          )}
          {selected.status === "needs_review" && (
            <>
              <Field label={t("Review conclusion", "检查结论")}>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  minLength={5}
                  maxLength={500}
                />
              </Field>
              <button
                className="studio-button"
                disabled={busy || note.trim().length < 5}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await contentFetch(
                      `/api/content/generations/${selected.id}`,
                      {
                        method: "PATCH",
                        body: JSON.stringify({ action: "close_review", note }),
                      },
                    );
                    const updated = {
                      ...selected,
                      status: "failed" as const,
                      error: `REVIEWED: ${note}`,
                    };
                    setSelected(updated);
                    setJobs((v) =>
                      v.map((g) => (g.id === updated.id ? updated : g)),
                    );
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Request failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("Close review without retrying", "结束检查，不重新生成")}
              </button>
            </>
          )}
        </aside>
      )}
    </div>
  );
}
