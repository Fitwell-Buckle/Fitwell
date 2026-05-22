import { remark } from "remark";
import remarkHtml from "remark-html";
import remarkGfm from "remark-gfm";
import { readFile } from "fs/promises";
import { join } from "path";

export async function renderMarkdown(relativePath: string): Promise<string> {
  const filePath = join(process.cwd(), relativePath);
  const content = await readFile(filePath, "utf-8");
  const result = await remark().use(remarkGfm).use(remarkHtml).process(content);
  return result.toString();
}
