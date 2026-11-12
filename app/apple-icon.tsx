import { ImageResponse } from "next/og";
import { BRAND_COLORS, LOGO_LOOP_PATH } from "@/lib/site";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS rounds the corners itself, so the tile is a plain square. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <svg width={180} height={180} viewBox="0 0 32 32">
        <rect width="32" height="32" fill={BRAND_COLORS.brand} />
        <path
          d={LOGO_LOOP_PATH}
          fill="none"
          stroke={BRAND_COLORS.ink}
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
      </svg>
    ),
    size,
  );
}
