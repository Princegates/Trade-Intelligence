import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Public marketing/auth routes only — /dashboard, /admin, and everything
// behind requireUser()/requireAdmin() have nothing for a crawler to index
// and are excluded via robots.ts anyway.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/disclaimer`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/signup`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];
}
