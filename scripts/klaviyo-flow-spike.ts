/**
 * Phase 3 spike CLI — read-only flow exploration.
 *
 * Usage:
 *   npm run klaviyo:flow:spike list
 *   npm run klaviyo:flow:spike get-welcome
 *   npm run klaviyo:flow:spike get <flow_id>
 *
 * Why read-only: Klaviyo's own docs discourage programmatic flow
 * creation (https://developers.klaviyo.com/en/reference/flows_api_overview)
 * — the recommended pattern is "create in UI, retrieve definition via
 * GET, iterate via PATCH". This spike establishes baseline by reading
 * what's there. Phase 3 outcome reshapes Phase 4 scope before any
 * writes happen.
 *
 * All outputs land in /tmp; nothing is written to Klaviyo.
 *
 * Phase 3 of specs/work-plans/todo/klaviyo-integration.md.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { KlaviyoClient } from "../src/lib/klaviyo/client";

const OUT_DIR = "/tmp/klaviyo-spike";

function ensureOutDir() {
  mkdirSync(OUT_DIR, { recursive: true });
}

function save(name: string, data: unknown): string {
  ensureOutDir();
  const p = join(OUT_DIR, `${name}.json`);
  writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}

async function cmdList(client: KlaviyoClient) {
  const flows = await client.listFlows();
  flows.sort((a, b) => a.name.localeCompare(b.name));
  console.log(`\n${flows.length} flow(s) in this account:\n`);
  console.log("STATUS    ID              NAME");
  console.log("--------  --------------  ----");
  for (const f of flows) {
    const status = f.status.padEnd(8);
    const id = f.id.padEnd(14);
    console.log(`${status}  ${id}  ${f.name}`);
  }
  const out = save("flows-list", flows);
  console.log(`\nFull list saved to ${out}\n`);
}

async function cmdGetById(client: KlaviyoClient, id: string) {
  console.log(`\nFetching flow ${id}…`);
  const result = await client.getFlowDefinition(id);
  console.log(`  name:   ${result.name}`);
  console.log(`  status: ${result.status}`);
  const out = save(`flow-${id}`, result);
  console.log(`  saved:  ${out}\n`);
  describeDefinition(result.definition);
}

async function cmdGetWelcome(client: KlaviyoClient) {
  const flows = await client.listFlows();
  const welcomes = flows.filter((f) =>
    f.name.toLowerCase().includes("welcome"),
  );
  if (welcomes.length === 0) {
    console.error("No flow whose name contains 'welcome' was found.");
    console.error("Run `npm run klaviyo:flow:spike list` to see what's there.");
    process.exit(1);
  }
  if (welcomes.length > 1) {
    console.warn(
      `Found ${welcomes.length} flows containing 'welcome' — picking first:\n  ${welcomes
        .map((f) => `${f.id} (${f.name})`)
        .join("\n  ")}\n`,
    );
  }
  await cmdGetById(client, welcomes[0].id);
}

/**
 * Print a quick structural summary of the definition. We don't yet
 * know the exact JSON shape — this is best-effort introspection so
 * the operator can scan stdout and decide whether to crack open the
 * full file.
 */
function describeDefinition(def: unknown) {
  if (def === null || def === undefined) {
    console.log("  definition: (null — not returned)");
    return;
  }
  if (typeof def !== "object") {
    console.log(`  definition: (${typeof def}) ${JSON.stringify(def).slice(0, 200)}`);
    return;
  }
  const obj = def as Record<string, unknown>;
  const keys = Object.keys(obj);
  console.log(`  definition keys: ${keys.join(", ")}`);
  // Common shapes to look for
  const triggers = obj.triggers;
  if (Array.isArray(triggers)) {
    console.log(`  triggers: ${triggers.length}`);
    for (const t of triggers as Array<Record<string, unknown>>) {
      console.log(`    - type=${t.type ?? "?"} id=${t.id ?? "?"}`);
    }
  }
  const actions = obj.actions;
  if (Array.isArray(actions)) {
    console.log(`  actions: ${actions.length}`);
    const types = new Map<string, number>();
    const samplePerType = new Map<string, Record<string, unknown>>();
    for (const a of actions as Array<Record<string, unknown>>) {
      const t = String(a.type ?? "?");
      types.set(t, (types.get(t) ?? 0) + 1);
      if (!samplePerType.has(t)) samplePerType.set(t, a);
    }
    for (const [t, n] of types) console.log(`    - ${t}: ${n}`);
    console.log("\n  Sample action per type (top-level keys + small values):");
    for (const [t, sample] of samplePerType) {
      console.log(`\n    [${t}]`);
      for (const [k, v] of Object.entries(sample)) {
        const preview =
          typeof v === "object" && v !== null
            ? `(${Array.isArray(v) ? "array" : "object"}, keys: ${Object.keys(v).join(", ")})`
            : JSON.stringify(v);
        console.log(`      ${k}: ${String(preview).slice(0, 200)}`);
      }
    }
  }
  if (obj.profile_filter) {
    console.log(
      `\n  profile_filter keys: ${Object.keys(obj.profile_filter as object).join(", ")}`,
    );
  }
  if (obj.entry_action_id) {
    console.log(`  entry_action_id: ${obj.entry_action_id}`);
  }
}

async function main() {
  const cmd = process.argv[2];
  const arg = process.argv[3];

  if (!cmd) {
    console.error("Usage:");
    console.error("  npm run klaviyo:flow:spike list");
    console.error("  npm run klaviyo:flow:spike get-welcome");
    console.error("  npm run klaviyo:flow:spike get <flow_id>");
    process.exit(2);
  }

  const client = new KlaviyoClient();

  switch (cmd) {
    case "list":
      await cmdList(client);
      break;
    case "get-welcome":
      await cmdGetWelcome(client);
      break;
    case "get":
      if (!arg) {
        console.error("Usage: npm run klaviyo:flow:spike get <flow_id>");
        process.exit(2);
      }
      await cmdGetById(client, arg);
      break;
    default:
      console.error(`Unknown subcommand: ${cmd}`);
      process.exit(2);
  }
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
