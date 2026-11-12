import { ImageResponse } from "next/og";
import { BRAND_COLORS, LOGO_LOOP_PATH, SITE_NAME, TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME}: ${TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  const [borrow, lend] = TAGLINE.split(/(?<=\.)\s+/);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: BRAND_COLORS.paper,
          color: BRAND_COLORS.ink,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width={88} height={88} viewBox="0 0 32 32">
            <rect width="32" height="32" rx="8" fill={BRAND_COLORS.moss} />
            <path
              d={LOGO_LOOP_PATH}
              fill="none"
              stroke={BRAND_COLORS.card}
              strokeWidth="2.6"
              strokeLinejoin="round"
            />
          </svg>
          <div style={{ fontSize: 56, letterSpacing: -1 }}>{SITE_NAME}</div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 88,
            lineHeight: 1.05,
            letterSpacing: -2,
          }}
        >
          <div>{borrow}</div>
          <div style={{ color: BRAND_COLORS.moss }}>{lend}</div>
        </div>
        <div style={{ fontSize: 32, color: BRAND_COLORS.inkSoft }}>
          A neighborhood tool-lending board
        </div>
      </div>
    ),
    size,
  );
}
