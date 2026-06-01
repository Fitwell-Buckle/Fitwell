/**
 * Smoke-test the business-card vision pipeline against a real image.
 * Bypasses the auth gate + Blob upload — calls extractBusinessCard()
 * directly so you can iterate on prompt / model choices without a
 * full sign-in dance.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/test-card-scan.ts <image-path>
 *
 * Or, if you've pulled prod env locally:
 *   npm run vc env pull .env.production.local
 *   npx --env-file=.env.production.local tsx scripts/test-card-scan.ts <image>
 *
 * Exit codes:
 *   0 — extraction succeeded, results printed to stdout
 *   1 — bad args or model error
 *   2 — missing ANTHROPIC_API_KEY
 */
import fs from "node:fs";
import path from "node:path";
import {
  extractBusinessCard,
  type SupportedImageMediaType,
} from "../src/lib/ai/anthropic";

function die(code: number, msg: string): never {
  console.error(msg);
  process.exit(code);
}

const imagePath = process.argv[2];
if (!imagePath) {
  die(1, "usage: test-card-scan.ts <path-to-card-image.jpg|png|gif|webp>");
}
if (!process.env.ANTHROPIC_API_KEY) {
  die(2, "ANTHROPIC_API_KEY is not set in this shell.");
}
if (!fs.existsSync(imagePath)) {
  die(1, `file not found: ${imagePath}`);
}

const ext = path.extname(imagePath).toLowerCase();
const mediaType: SupportedImageMediaType | null = (
  {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  } as const
)[ext as ".jpg" | ".jpeg" | ".png" | ".gif" | ".webp"] ?? null;
if (!mediaType) die(1, `unsupported image extension: ${ext}`);

const buffer = fs.readFileSync(imagePath);
const sizeMb = (buffer.length / 1024 / 1024).toFixed(2);
console.error(`→ ${path.basename(imagePath)} (${sizeMb} MB, ${mediaType})`);
console.error(`→ Calling Claude Sonnet 4.5 vision…`);

const t0 = performance.now();
const result = await extractBusinessCard({
  imageBase64: buffer.toString("base64"),
  mediaType,
});
const elapsed = Math.round(performance.now() - t0);

console.error(`✓ Done in ${elapsed}ms\n`);
const display = {
  firstName: result.firstName,
  lastName: result.lastName,
  email: result.email,
  phone: result.phone,
  title: result.title,
  companyName: result.companyName,
  website: result.website,
  confidence: result.confidence,
  rawTextPreview: result.rawText.slice(0, 200),
};
console.log(JSON.stringify(display, null, 2));
