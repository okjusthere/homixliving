/**
 * Apple Touch Icon — used when iOS users "Add to Home Screen".
 *
 * Renders a 180×180 PNG via Next.js ImageResponse. iOS Safari requires PNG
 * (not SVG) for home-screen icons, and Apple specifically recommends 180×180
 * as the canonical size — iOS will downscale for smaller surfaces.
 *
 * Design matches src/app/icon.svg: paper-tone rounded background with the
 * walnut house+chimney silhouette. The mark is centered at ~63% of the canvas
 * to leave breathing room (Apple home-screen icons sit closer to their edges
 * than tab favicons do).
 */
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#F7F4EE",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 64 64">
          <path
            d="M 8 48 L 32 16 L 44 30 L 44 22 L 52 22 L 52 38 L 56 48 Z"
            fill="#8B5A3C"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
