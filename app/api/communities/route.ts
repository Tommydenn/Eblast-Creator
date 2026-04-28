import { NextResponse } from "next/server";
import { listCommunities } from "@/data/communities";
import { readdir } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

/**
 * Returns the registered communities plus, for each, the list of HTML
 * templates available under data/communities/{slug}/templates/.
 */
export async function GET() {
  const communities = listCommunities();
  const enriched = await Promise.all(
    communities.map(async (c) => {
      let templates: string[] = [];
      try {
        const dir = path.join(process.cwd(), "data", "communities", c.slug, "templates");
        const files = await readdir(dir);
        templates = files.filter((f) => f.endsWith(".html"));
      } catch {
        // No templates folder yet — that's fine.
      }
      return { ...c, templates };
    }),
  );
  return NextResponse.json({ communities: enriched });
}
