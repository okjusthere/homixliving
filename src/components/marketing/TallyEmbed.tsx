"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    Tally?: { loadEmbeds: () => void };
  }
}

const TALLY_JS = "https://tally.so/widgets/embed.js";

/**
 * Embeds a Tally form. In real browsers Tally's embed.js wires up seamless
 * auto-height (dynamicHeight=1) via postMessage. We also (a) set the iframe src
 * directly as a guaranteed fallback so the form always loads, and (b) listen for
 * Tally's height messages so the frame still resizes if loadEmbeds is unavailable.
 */
export function TallyEmbed({ formId, title }: { formId: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(700);
  const src = `https://tally.so/embed/${formId}?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1`;

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;

    const load = () => {
      window.Tally?.loadEmbeds();
      if (!iframe.getAttribute("src")) iframe.src = iframe.dataset.tallySrc || "";
    };

    if (window.Tally) {
      load();
    } else if (!document.querySelector(`script[src="${TALLY_JS}"]`)) {
      const s = document.createElement("script");
      s.src = TALLY_JS;
      s.onload = load;
      s.onerror = load;
      document.body.appendChild(s);
    } else {
      const t = setTimeout(load, 600);
      return () => clearTimeout(t);
    }

    const onMessage = (e: MessageEvent) => {
      if (typeof e.data !== "string" || !e.data.includes("Tally")) return;
      try {
        const h = JSON.parse(e.data)?.payload?.height;
        if (typeof h === "number" && h > 200) setHeight(h);
      } catch {
        /* ignore non-JSON messages */
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="overflow-hidden rounded-sm border border-line bg-surface">
      <iframe
        ref={ref}
        data-tally-src={src}
        title={title}
        width="100%"
        height={height}
        style={{ minHeight: 560 }}
        className="w-full"
      />
    </div>
  );
}
