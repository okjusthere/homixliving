/**
 * Third-party embed targets for the /offer (Tally) and /buyercoach (FastGPT)
 * pages. These are PUBLIC URLs/IDs (they ship to
 * the browser in an iframe), not secrets — so they can be hardcoded here or
 * overridden with NEXT_PUBLIC_* env vars in Vercel (a redeploy applies env
 * changes).
 *
 * To go live, set the values below (or the env vars):
 *  - offerTallyId       → the form id in your Tally URL, e.g. tally.so/r/<ID>
 *  - buyerCoachUrl      → the full FastGPT share/iframe URL
 * When a value is empty, the page shows a tasteful "being connected" fallback.
 */

export const offerTallyId =
  process.env.NEXT_PUBLIC_TALLY_OFFER_ID?.trim() || "mJPA4J";

/** Optional separate Chinese-language Tally form; falls back to the main one. */
export const offerTallyIdZh =
  process.env.NEXT_PUBLIC_TALLY_OFFER_ID_ZH?.trim() || offerTallyId;

export const buyerCoachUrl =
  process.env.NEXT_PUBLIC_BUYERCOACH_URL?.trim() ||
  "https://cloud.fastgpt.io/chat/share?shareId=eQARSV3riLnetFY59kTaniRg";

export function cloudflareStreamIframeUrl(videoUid: string) {
  const uid = videoUid.trim();
  return uid ? `https://iframe.videodelivery.net/${uid}` : "";
}
