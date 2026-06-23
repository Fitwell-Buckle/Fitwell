/**
 * Re-run STL → GLB for stored CAD models using the *current* converter. Use
 * after a converter change (e.g. the angle-based normal smoothing that fixes
 * jagged edges) so existing models pick up the improvement without a Fusion
 * re-export — it re-reads each model's stored source STL and overwrites its GLB.
 *
 * Usage (local dev DB):
 *   npm run reconvert:cad                  # list models + ids
 *   npm run reconvert:cad -- <id|name>     # re-convert one (exact id, exact or
 *                                          # partial name match)
 *   npm run reconvert:cad -- --all         # re-convert every model with a source STL
 *
 * Against PRODUCTION (overwrites prod GLB blobs + rows — explicit action):
 *   vercel --global-config ~/.vercel-fitwell env pull .env.production.local \
 *     --environment=production --yes
 *   node --env-file=.env.production.local --import tsx/esm \
 *     --import ./scripts/_no-server-only.mjs scripts/reconvert-cad-model.ts <id|name>
 *   rm -f .env.production.local
 */
import { listCadModels, reconvertCadModel } from "@/lib/cad/service";

async function main() {
  const args = process.argv.slice(2);
  const models = await listCadModels();

  if (args.length === 0) {
    console.log("CAD models (newest first):\n");
    for (const m of models) {
      const flag = m.sourceStlUrl ? "" : "  (no source STL — can't re-convert)";
      console.log(`  ${m.id}  ${String(m.status).padEnd(10)} ${m.name}${flag}`);
    }
    console.log("\nPass a model id or name (or --all) to re-convert.");
    return;
  }

  let targets;
  if (args[0] === "--all") {
    targets = models.filter((m) => m.sourceStlUrl);
  } else {
    const q = args.join(" ").trim().toLowerCase();
    targets = models.filter(
      (m) => m.id === args[0] || m.name.toLowerCase() === q,
    );
    if (targets.length === 0) {
      targets = models.filter((m) => m.name.toLowerCase().includes(q));
    }
  }

  if (targets.length === 0) {
    console.error(`No model matched "${args.join(" ")}".`);
    process.exitCode = 1;
    return;
  }

  for (const m of targets) {
    process.stdout.write(`Re-converting ${m.name} (${m.id})… `);
    try {
      const { glbUrl } = await reconvertCadModel(m.id);
      console.log(`done → ${glbUrl}`);
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  }
}

main().then(() => process.exit(process.exitCode ?? 0));
