"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, EditorialInput } from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";
import type { TrainingVideo } from "@/db/schema";

export function TrainingManager({
  initialVideos,
  cloudflareConfigured,
}: {
  initialVideos: TrainingVideo[];
  cloudflareConfigured: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [uid, setUid] = useState("");
  const [category, setCategory] = useState("");
  const [duration, setDuration] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    if (!title.trim() || !uid.trim()) {
      setError("Title and Cloudflare UID are required.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        cloudflareUid: uid,
        category,
        durationLabel: duration,
        description,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Could not save — admin only.");
      return;
    }
    setTitle("");
    setUid("");
    setCategory("");
    setDuration("");
    setDescription("");
    router.refresh();
  }

  async function togglePublish(v: TrainingVideo) {
    await fetch(`/api/training/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !v.isPublished }),
    });
    router.refresh();
  }

  async function remove(v: TrainingVideo) {
    if (!confirm(`Delete "${v.title}"?`)) return;
    await fetch(`/api/training/${v.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Card className="p-5 mb-10" style={{ background: tone.paper }}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-serif" style={{ fontSize: 16, color: tone.ink }}>
            Manage videos
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: tone.ink50 }}>
            Upload to Cloudflare Stream, then paste the video UID here.
          </div>
        </div>
        <Btn variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Add video"}
        </Btn>
      </div>

      {!cloudflareConfigured && (
        <div
          className="mt-3 rounded-lg p-3 text-[12.5px]"
          style={{ background: tone.amberSoft, color: tone.amber }}
        >
          Set <span className="font-mono">NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE</span> in Vercel
          so the videos can play.
        </div>
      )}

      {open && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <EditorialInput value={title} onChange={setTitle} placeholder="Title" />
          <EditorialInput value={uid} onChange={setUid} placeholder="Cloudflare Stream UID" mono />
          <EditorialInput value={category} onChange={setCategory} placeholder="Category (e.g. Foundations)" />
          <EditorialInput value={duration} onChange={setDuration} placeholder="Duration (e.g. 8 min)" />
          <div className="sm:col-span-2">
            <EditorialInput value={description} onChange={setDescription} placeholder="Short description (optional)" />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <Btn variant="primary" size="sm" onClick={add} disabled={busy}>
              {busy ? "Saving…" : "Save video"}
            </Btn>
            {error && (
              <span className="text-[12.5px]" style={{ color: tone.rose }}>
                {error}
              </span>
            )}
          </div>
        </div>
      )}

      {initialVideos.length > 0 && (
        <div className="mt-5">
          {initialVideos.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-3 py-2.5"
              style={{ borderTop: `1px solid ${tone.lineSoft}` }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] truncate" style={{ color: tone.ink }}>
                  {v.title}
                </div>
                <div className="text-[11.5px] truncate font-mono" style={{ color: tone.ink50 }}>
                  {v.category} · {v.cloudflareUid}
                </div>
              </div>
              <button
                type="button"
                onClick={() => togglePublish(v)}
                className="text-[12px] px-2.5 py-1 rounded-md"
                style={{ color: v.isPublished ? tone.green : tone.ink50, background: tone.paperDeep }}
              >
                {v.isPublished ? "Published" : "Hidden"}
              </button>
              <button
                type="button"
                onClick={() => remove(v)}
                className="text-[12px] px-2.5 py-1 rounded-md"
                style={{ color: tone.rose }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
