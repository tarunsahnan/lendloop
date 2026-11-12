import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Only the public board is indexable. Its listings change through the day. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
