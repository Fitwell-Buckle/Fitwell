import { remark } from "remark";
import remarkHtml from "remark-html";
import remarkGfm from "remark-gfm";
import { readFile } from "fs/promises";
import { join } from "path";

// Wiki-style links used across specs/strategy/*.md:
//   [[funnel]]                  → /docs/strategy/funnel
//   [[../invariants/attribution]] → /docs/invariants/attribution
//   [[name|display]]            → [display](resolved-url)
// Resolved before remark so the result is regular markdown that
// remark-html renders as proper anchors.
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

function resolveWikilink(target: string): string {
  const t = target.trim();
  if (t.startsWith("../invariants/")) {
    return "/docs/invariants/" + t.replace(/^\.\.\/invariants\//, "");
  }
  if (t.startsWith("../")) {
    // Unknown ../ prefix — leave as a non-navigating anchor rather than
    // guess at a 404 route.
    return "#";
  }
  return "/docs/strategy/" + t;
}

function transformWikilinks(content: string): string {
  return content.replace(WIKILINK_RE, (_, target: string, label?: string) => {
    const url = resolveWikilink(target);
    const display =
      label?.trim() ?? (target.trim().split("/").pop() ?? target.trim());
    return `[${display}](${url})`;
  });
}

export async function renderMarkdown(relativePath: string): Promise<string> {
  const filePath = join(process.cwd(), relativePath);
  const content = await readFile(filePath, "utf-8");
  const transformed = transformWikilinks(content);
  const result = await remark()
    .use(remarkGfm)
    .use(remarkHtml)
    .process(transformed);
  return result.toString();
}
