import type { Metadata } from "next";
import { pages, type PageKey } from "../components/InteriorPage";

export function pageMetadata(page: PageKey): Metadata {
  const spec = pages[page];
  return {
    title: `${spec.title} — GitBounty`,
    description: spec.lede,
    openGraph: { title: `${spec.title} — GitBounty`, description: spec.lede, type: "website" },
    twitter: { card: "summary_large_image", title: `${spec.title} — GitBounty`, description: spec.lede },
  };
}
