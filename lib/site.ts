/** Shared by page metadata, the sitemap, robots, the manifest and the social image. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

export const SITE_NAME = "LendLoop";

export const SITE_TITLE = "LendLoop: borrow and lend tools with your neighbors";

export const TAGLINE = "Borrow what you need. Lend what you don't.";

export const DESCRIPTION =
  "A neighborhood tool-lending board. List the tools you rarely use, borrow a drill, ladder or tent for a few days, and get a reminder when it's due back.";

/** The loop in the logo, drawn on a 32 by 32 grid. Matches app/icon.svg. */
export const LOGO_LOOP_PATH =
  "M11 11.5a6.5 6.5 0 1 0 0 9h10a6.5 6.5 0 1 0 0-9H11z";

export const BRAND_COLORS = {
  paper: "#f5f0e6",
  card: "#fffdf8",
  ink: "#1d2521",
  inkSoft: "#5a645e",
  moss: "#2b5a46",
} as const;
