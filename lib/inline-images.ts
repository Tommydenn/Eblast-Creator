import { readFile } from "node:fs/promises";
import path from "node:path";

const RELATIVE_IMG_RE = /src="(\/[^"]+\.(?:png|jpg|jpeg|gif|webp|svg))"/gi;

/**
 * Replaces relative image src attributes (e.g. /logos/community/primary.png)
 * with base64 data URIs by reading the corresponding files from the public/
 * directory. Leaves absolute URLs and data URIs untouched.
 *
 * Use after buildEblastHtml so logo images are self-contained and render
 * correctly in srcDoc iframes, approval page previews, and email clients.
 */
export async function inlineRelativeImages(html: string): Promise<string> {
  const matches = [...html.matchAll(RELATIVE_IMG_RE)];
  if (matches.length === 0) return html;
  let result = html;
  for (const [fullMatch, relPath] of matches) {
    const filePath = path.join(process.cwd(), "public", relPath);
    try {
      const bytes = await readFile(filePath);
      const ext = relPath.split(".").pop()?.toLowerCase() ?? "png";
      const mime = ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;
      result = result.replaceAll(fullMatch, `src="data:${mime};base64,${bytes.toString("base64")}"`);
    } catch { /* leave as-is if file is missing */ }
  }
  return result;
}
