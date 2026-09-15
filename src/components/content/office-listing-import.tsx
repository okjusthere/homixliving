"use client";
import { useState } from "react";
import { ListingPicker } from "./listing-picker";
import { contentFetch } from "./ui";
import { listingEvents, type StudioListing } from "@/lib/content/listing-source";
import type { ContentInput, ContentTemplate, PosterHighlight } from "@/lib/content/types";

export function OfficeListingImport({ subjectAgentId, zh, onSaved, onError }: {
  subjectAgentId: number; zh: boolean;
  onSaved: (ids: string[]) => Promise<void>; onError: (message: string) => void;
}) {
  const [selected, setSelected] = useState<StudioListing[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  async function importSelected() {
    setBusy(true); onError("");
    const saved: string[] = [], failed: string[] = [];
    const succeeded = new Set<string>();
    try {
      const { templates } = await contentFetch<{ templates: ContentTemplate[] }>("/api/content/templates");
      const template = templates.find((v) => v.config.kind === "listing" && v.config.style === "editorial" && v.config.themes.includes("just_listed"));
      if (!template) throw new Error(zh ? "请先发布 Just Listed 经典模板。" : "Publish a Just Listed Classic template first.");
      for (const [index, listing] of selected.entries()) {
        setProgress(`${index + 1} / ${selected.length} · ${listing.address.full}`);
        try {
          const { listing: detail } = await contentFetch<{ listing: StudioListing }>(`/api/content/listings?slug=${encodeURIComponent(listing.slug)}`);
          if (!detail.photos[0]) throw new Error(zh ? "缺少房源照片，请单独添加并上传图片。" : "No listing photo; add this poster individually and upload a photo.");
          const { asset } = await contentFetch<{ asset: { id: string } }>(`/api/content/assets?subject=${subjectAgentId}`, { method: "POST", body: JSON.stringify({ url: detail.photos[0].url }) });
          const input: ContentInput = {
            kind: "listing", theme: "just_listed", language: "zh", size: "1024x1280", includePortrait: true,
            headline: "", message: "", additionalInstructions: "", representationRole: "unspecified",
            events: listingEvents(detail),
            listing: { source: "mls", sourceKey: detail.id, address: detail.address.full, price: detail.askingPrice ? `$${detail.askingPrice.toLocaleString("en-US")}` : "", beds: String(detail.beds ?? ""), baths: String(detail.baths + (detail.halfBaths || 0) * 0.5 || ""), area: String(detail.sqft || ""), description: detail.description || "", annualPropertyTax: detail.annualPropertyTax, monthlyMaintenanceFee: detail.monthlyMaintenanceFee, associationFee: detail.associationFee, associationFeeFrequency: detail.associationFeeFrequency, imageAssetIds: [asset.id], fetchedAt: new Date().toISOString(), sourceStatus: detail.status },
          };
          if ((detail.description?.trim().length || 0) >= 10) {
            const result = await contentFetch<{ highlights: PosterHighlight[]; financialFacts: NonNullable<ContentInput["listing"]>["financialFacts"]; model: string }>("/api/content/highlights", { method: "POST", body: JSON.stringify({ listing: input.listing }) });
            Object.assign(input.listing!, { highlights: result.highlights, financialFacts: result.financialFacts, highlightsModel: result.model, highlightsReviewed: false });
          }
          const { id } = await contentFetch<{ id: string }>("/api/content/office", { method: "POST", body: JSON.stringify({ subjectAgentId, request: { templateId: template.id, input, languages: ["zh"] } }) });
          saved.push(id); succeeded.add(listing.id);
        } catch (e) { failed.push(`${listing.address.full}: ${e instanceof Error ? e.message : "Import failed"}`); }
      }
      setSelected((v) => v.filter((l) => !succeeded.has(l.id)));
      await onSaved(saved);
      if (failed.length) onError(failed.join("\n"));
      setProgress(zh ? `已保存 ${saved.length} 条草稿。提交前请核对卖点和照片。` : `${saved.length} drafts saved. Review the photos and selling points before submitting.`);
    } catch (e) { onError(e instanceof Error ? e.message : "Import failed"); }
    finally { setBusy(false); }
  }
  return <section className="studio-panel">
    <p className="studio-note">{zh ? "勾选多套房源，自动带入第一张主图并提取卖点，保存为中文 Just Listed 草稿。提交前可以修改。" : "Select several properties to import their hero photos and extract selling points as Chinese Just Listed drafts. Review and edit before generating."}</p>
    <ListingPicker zh={zh} disabled={busy} onError={onError} onChoose={async () => {}} selection={{ ids: selected.map((v) => v.id), onToggle: (listing) => setSelected((v) => v.some((l) => l.id === listing.id) ? v.filter((l) => l.id !== listing.id) : [...v, listing]) }} />
    <div className="office-toolbar"><p className="studio-note" role="status">{progress}</p><button className="studio-button" disabled={busy || !selected.length} onClick={importSelected}>{busy ? (zh ? "正在导入…" : "Importing…") : zh ? `导入选中的 ${selected.length} 套房源` : `Import ${selected.length} selected properties`}</button></div>
  </section>;
}
