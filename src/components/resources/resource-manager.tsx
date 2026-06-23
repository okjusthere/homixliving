"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, EditorialInput } from "@/components/homix/primitives";
import { tone } from "@/components/homix/tokens";
import type { Resource } from "@/db/schema";

export function ResourceManager({ initialResources }: { initialResources: Resource[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    if (!title.trim() || !url.trim()) {
      setError("Title and link (URL) are required.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, url, category, description }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Could not save — admin only.");
      return;
    }
    setTitle("");
    setUrl("");
    setCategory("");
    setDescription("");
    router.refresh();
  }

  async function togglePublish(r: Resource) {
    await fetch(`/api/resources/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !r.isPublished }),
    });
    router.refresh();
  }

  async function remove(r: Resource) {
    if (!confirm(`Delete "${r.title}"?`)) return;
    await fetch(`/api/resources/${r.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Card className="p-5 mb-10" style={{ background: tone.paper }}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-serif" style={{ fontSize: 16, color: tone.ink }}>
            Manage resources
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: tone.ink50 }}>
            Paste a link to a doc, template, or folder (Google Drive, Notion, Dropbox, or a file URL).
          </div>
        </div>
        <Btn variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Add resource"}
        </Btn>
      </div>

      {open && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <EditorialInput value={title} onChange={setTitle} placeholder="Title" />
          <EditorialInput value={category} onChange={setCategory} placeholder="Category (e.g. Scripts)" />
          <div className="sm:col-span-2">
            <EditorialInput value={url} onChange={setUrl} placeholder="Link (https://…)" mono />
          </div>
          <div className="sm:col-span-2">
            <EditorialInput value={description} onChange={setDescription} placeholder="Short description (optional)" />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <Btn variant="primary" size="sm" onClick={add} disabled={busy}>
              {busy ? "Saving…" : "Save resource"}
            </Btn>
            {error && (
              <span className="text-[12.5px]" style={{ color: tone.rose }}>
                {error}
              </span>
            )}
          </div>
        </div>
      )}

      {initialResources.length > 0 && (
        <div className="mt-5">
          {initialResources.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 py-2.5"
              style={{ borderTop: `1px solid ${tone.lineSoft}` }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] truncate" style={{ color: tone.ink }}>
                  {r.title}
                </div>
                <div className="text-[11.5px] truncate font-mono" style={{ color: tone.ink50 }}>
                  {r.category} · {r.url}
                </div>
              </div>
              <button
                type="button"
                onClick={() => togglePublish(r)}
                className="text-[12px] px-2.5 py-1 rounded-md"
                style={{ color: r.isPublished ? tone.green : tone.ink50, background: tone.paperDeep }}
              >
                {r.isPublished ? "Published" : "Hidden"}
              </button>
              <button
                type="button"
                onClick={() => remove(r)}
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
