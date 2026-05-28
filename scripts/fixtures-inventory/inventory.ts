#!/usr/bin/env tsx
/**
 * Phase G Phase A — fixtures-adoption inventory. Classifies every
 * `*.test.ts` under `packages/activerecord/src` into a structural adoption
 * tier (1 mechanical / 2 loader-gap / 3 bespoke-or-hazard / 4 no-DB-ops)
 * and writes the doc below. Tier rules + scope caveats are documented in
 * the generated doc's header and in `fixtures-adoption-plan.md` Phase A.
 *
 *   pnpm fixtures:adoption:inventory
 *
 * Hard rules: async fs only, no process.* — paths derive from import.meta.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const REPO = new URL("../../", import.meta.url);
const AR_SRC = fileURLToPath(new URL("packages/activerecord/src/", REPO));
const MODELS_DIR = `${AR_SRC}test-helpers/models/`;
const OUT_REL = "docs/activerecord/fixtures-adoption-inventory.md";
const OUT = fileURLToPath(new URL(OUT_REL, REPO));

type Tier = 1 | 2 | 3 | 4;

interface Row {
  file: string;
  loc: number;
  tier: Tier;
  hasUseFixtures: boolean;
  hasDbOps: boolean;
  inlineClasses: string[];
  nonCanonical: string[];
  hazard: string;
  blocker: string;
  estimate: string;
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const full = `${dir}${e.name}`;
    if (e.isDirectory()) out.push(...(await walk(`${full}/`)));
    else if (e.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

// kebab/snake filename → PascalCase class name (rough; matches classify.sh).
function pascal(name: string): string {
  return name.replace(/(^|[-_])(\w)/g, (_m, _s, c) => c.toUpperCase());
}

async function canonicalClassNames(): Promise<Set<string>> {
  const names = new Set<string>();
  const files = await readdir(MODELS_DIR, { withFileTypes: true });
  for (const f of files) {
    if (f.isDirectory()) {
      // nested module models (admin/, autoloadable/, …)
      const inner = await readdir(`${MODELS_DIR}${f.name}/`);
      for (const i of inner) if (i.endsWith(".ts")) names.add(pascal(i.replace(/\.ts$/, "")));
      continue;
    }
    if (!f.name.endsWith(".ts") || f.name === "index.ts") continue;
    const src = await readFile(`${MODELS_DIR}${f.name}`, "utf8");
    for (const m of src.matchAll(/export\s+(?:default\s+)?class\s+(\w+)/g)) names.add(m[1]);
    // also the filename-derived name, for re-exported barrels
    names.add(pascal(f.name.replace(/\.ts$/, "")));
  }
  return names;
}

// Blank out `//` and block comments (preserving newlines/indentation) so
// commented-out mentions of `useFixtures`/`defineSchema`/etc. stop counting
// as real code. String literals are kept on purpose: RAW_DDL and the
// dependent-option hazard match SQL/option text that lives inside strings.
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let state: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    const blank = c === "\n" ? "\n" : " ";
    if (state === "code") {
      if (c === "/" && n === "/") ((state = "line"), (out += "  "), (i += 2));
      else if (c === "/" && n === "*") ((state = "block"), (out += "  "), (i += 2));
      else if (c === "'") ((state = "sq"), (out += c), i++);
      else if (c === '"') ((state = "dq"), (out += c), i++);
      else if (c === "`") ((state = "tpl"), (out += c), i++);
      else ((out += c), i++);
    } else if (state === "line") {
      if (c === "\n") ((state = "code"), (out += "\n"), i++);
      else ((out += blank), i++);
    } else if (state === "block") {
      if (c === "*" && n === "/") ((state = "code"), (out += "  "), (i += 2));
      else ((out += blank), i++);
    } else {
      // inside a string literal: copy verbatim, handle escapes + terminators
      out += c;
      if (c === "\\" && i + 1 < src.length) ((out += src[i + 1]), (i += 2));
      else {
        if (
          (state === "sq" && c === "'") ||
          (state === "dq" && c === '"') ||
          (state === "tpl" && c === "`")
        )
          state = "code";
        i++;
      }
    }
  }
  return out;
}

// Persistence/query methods that signal a file seeds or reads real rows.
const DB_METHOD =
  /\b([A-Z]\w+)\.(create|createAll|save|update|updateAll|upsert|insert|insertAll|destroy|destroyAll|deleteAll|increment|decrement|findBy|findOrCreateBy|first|last|count|sum|pluck|exists)\b/g;
// Receivers that look like a model but aren't (stdlib / infra helpers).
const NOT_A_MODEL = new Set(
  "Object Array Promise Map Set Date Number String Boolean JSON Math SchemaDumper Reflect Proxy Symbol Buffer ActiveSupport".split(
    " ",
  ),
);

function detectDbOps(content: string): boolean {
  for (const m of content.matchAll(DB_METHOD)) {
    if (!NOT_A_MODEL.has(m[1])) return true;
  }
  return false;
}

const INLINE_BODY_SCHEMA = /^\s+(?:await\s+)?defineSchema\(/m;
const DEPENDENT_HAZARD = /dependent:\s*["']?(destroy|nullify|restrict)/;
const RAW_DDL = /CREATE\s+TABLE|executeSql|execute\(\s*["'`]\s*CREATE/i;

function classify(raw: string, canonical: Set<string>): Omit<Row, "file" | "loc"> {
  const content = stripComments(raw);
  const hasUseFixtures = /useFixtures\s*\(/.test(content);
  const hasDbOps = detectDbOps(content);

  const inlineClasses = [
    ...content.matchAll(/class\s+(\w+)\s+extends\s+(?:Base|ApplicationRecord|Model)\b/g),
  ].map((m) => m[1]);
  const uniqueInline = [...new Set(inlineClasses)];
  const nonCanonical = uniqueInline.filter((c) => !canonical.has(c));

  // Phase 6 / bespoke hazards
  const hazards: string[] = [];
  if (INLINE_BODY_SCHEMA.test(content)) hazards.push("inline-body-defineSchema");
  if (DEPENDENT_HAZARD.test(content)) hazards.push("dependent:destroy/nullify/restrict");
  if (RAW_DDL.test(content)) hazards.push("raw-DDL");
  // many distinct inline classes => bespoke per-describe model factory
  if (uniqueInline.length > 4) hazards.push(`${uniqueInline.length}-inline-classes`);
  const hazard = hazards.join("; ");

  let tier: Tier;
  let blocker = "";
  let estimate = "";

  if (hasUseFixtures) {
    tier = 1;
    estimate = "converted";
  } else if (!hasDbOps) {
    tier = 4;
    blocker = "no DB ops (in-memory / SQL-gen)";
    estimate = "n/a";
  } else if (hazard) {
    tier = 3;
    blocker = hazard;
    estimate = "bespoke surgery";
  } else if (nonCanonical.length > 0) {
    // bespoke inline class with no canonical equivalent => loader can't seed it
    tier = nonCanonical.length === uniqueInline.length ? 3 : 2;
    blocker =
      tier === 2
        ? `non-canonical class(es): ${nonCanonical.join(", ")}`
        : `all inline classes bespoke: ${nonCanonical.join(", ")}`;
    estimate = tier === 2 ? "loader PR then convert" : "bespoke surgery";
  } else {
    tier = 1;
    estimate = "~mechanical";
  }

  return {
    tier,
    hasUseFixtures,
    hasDbOps,
    inlineClasses: uniqueInline,
    nonCanonical,
    hazard,
    blocker,
    estimate,
  };
}

function renderDoc(rows: Row[]): string {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<Tier, number>;
  for (const r of rows) counts[r.tier]++;
  const total = rows.length;
  const converted = rows.filter((r) => r.hasUseFixtures).length;
  const tier1Unconverted = counts[1] - converted;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;

  const lines: string[] = [];
  lines.push("# Fixtures-adoption inventory");
  lines.push("");
  lines.push(
    "> **Generated** by `pnpm fixtures:adoption:inventory` " +
      "(`scripts/fixtures-inventory/inventory.ts`). Do not hand-edit — re-run " +
      "the script.",
  );
  lines.push("");
  lines.push("## Scope & method (read before acting on the tiers)");
  lines.push("");
  lines.push(
    "This is a **TS-side structural** classification, not the full Phase A " +
      "tiering contract. The Phase A plan envisioned deriving tiers from a " +
      "Rails-counterpart map (`scripts/api-compare/test-mapping.json`), parsed " +
      "`fixtures :foo` usage on the Rails side, and `fixtures:compare` " +
      "readiness. Those committed inputs **do not exist in this repo** " +
      "(`test-mapping.json` is absent; there is no Rails-fixture-usage " +
      "extractor), so this script cannot consume them. Instead it uses the " +
      "static heuristics the Phase A task spec actually lists — DB-op presence, " +
      "inline `class X extends Base`, canonical-model membership, inline-body " +
      "`defineSchema`, and Phase 6 hazards — applied to comment-stripped " +
      "source.",
  );
  lines.push("");
  lines.push(
    "Consequence: a Tier 1 here means *structurally mechanical to convert*, " +
      "not *confirmed to have a fixtures-using Rails counterpart*. Treat the " +
      "tiers as an **upper bound** on the convertible pool — the true pool is " +
      "smaller once Rails-counterpart/`fixtures:compare` filtering is applied. " +
      "That only strengthens the recommendation below (a small pool gets " +
      "smaller). Classification is rough by design — it drives a planning " +
      "decision, not automated conversion.",
  );
  lines.push("");
  lines.push("## Tier counts");
  lines.push("");
  lines.push("| Tier | Meaning | Count | % |");
  lines.push("| ---- | ------- | ----- | - |");
  lines.push(`| 1 | auto-eligible (mechanical) | ${counts[1]} | ${pct(counts[1])} |`);
  lines.push(`| 2 | loader-gap blocker | ${counts[2]} | ${pct(counts[2])} |`);
  lines.push(`| 3 | Phase 6 hazard / bespoke schema | ${counts[3]} | ${pct(counts[3])} |`);
  lines.push(`| 4 | no DB ops / intentional isolation | ${counts[4]} | ${pct(counts[4])} |`);
  lines.push(`| — | **total** | **${total}** | 100% |`);
  lines.push("");
  lines.push(
    `Of the ${counts[1]} Tier 1 files, **${converted}** already call ` +
      `\`useFixtures\` (converted in Phase B canaries) and ` +
      `**${tier1Unconverted}** are unconverted Tier 1 (the Phase C sweep pool).`,
  );
  lines.push("");
  lines.push("## Comparison to phase-g-candidates.md (D-1 subset, 2026-05-26)");
  lines.push("");
  lines.push(
    "`phase-g-candidates.md` measured **0 YES / 3 PARTIAL / 62 NO** across " +
      "the 65 then-D-1-pending files, matching the ~8% canary yield. That " +
      "audit ran only on bypass files mid-D-1. This inventory runs on the " +
      "full post-D-1 suite (every file now uses `Base.adapter` + transactional " +
      "fixtures). The structural prerequisites are universal, but the " +
      "bespoke-model reality the candidates doc found persists: see the " +
      "Tier 3 share below.",
  );
  lines.push("");
  lines.push("## Recommendation");
  lines.push("");
  const pool = tier1Unconverted;
  if (pool >= 40) {
    lines.push(
      `**Launch Phase C as planned.** ${pool} unconverted Tier 1 files is ` +
        "enough to justify a 12–18 PR mechanical sweep at ~250 LOC each.",
    );
  } else if (pool >= 12) {
    lines.push(
      `**Run a Phase C-trial batch first.** ${pool} unconverted Tier 1 files ` +
        "is a moderate pool — convert one cluster (~3–5 files) and re-measure " +
        "yield against the 8% canary baseline before committing the full sweep.",
    );
  } else if (counts[2] >= 20) {
    lines.push(
      `**Refactor the loader first.** Only ${pool} files are Tier 1 today, but ` +
        `${counts[2]} are Tier 2 (loader-gap blocked). A few loader PRs would ` +
        "promote them to Tier 1 and make a sweep worthwhile.",
    );
  } else {
    lines.push(
      `**Defer Phase G as a sweep.** Only ${pool} unconverted Tier 1 files ` +
        `remain and Tier 2 is ${counts[2]} — the canary-era ~8% yield reality ` +
        "persists post-D-1. The structural prerequisites became universal, but " +
        "the binding constraint was never D-1: it is that the AR suite is built " +
        `on bespoke per-describe models (${counts[3]} Tier 3 files) and ` +
        `no-DB-op unit tests (${counts[4]} Tier 4 files), neither of which a ` +
        "canonical-fixture loader can serve. Recommend: do NOT spin up a " +
        "12–18 PR sweep. Instead convert the small Tier 1 pool opportunistically " +
        "(bundled into adjacent PRs touching those files) and treat fixtures " +
        "adoption as a per-file Rails-parity nicety, not a program.",
    );
  }
  lines.push("");
  lines.push("## Per-file classification");
  lines.push("");
  lines.push("| File | Tier | DB ops | useFixtures | Blocker | Estimate |");
  lines.push("| ---- | ---- | ------ | ----------- | ------- | -------- |");
  for (const r of rows) {
    lines.push(
      `| \`${r.file}\` | ${r.tier} | ${r.hasDbOps ? "y" : "n"} | ` +
        `${r.hasUseFixtures ? "y" : "n"} | ${r.blocker || "—"} | ${r.estimate} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const canonical = await canonicalClassNames();
  const files = (await walk(AR_SRC)).sort();
  const rows: Row[] = [];
  for (const full of files) {
    const content = await readFile(full, "utf8");
    const loc = content.split("\n").length;
    const file = full.slice(AR_SRC.length);
    rows.push({ file, loc, ...classify(content, canonical) });
  }
  await writeFile(OUT, renderDoc(rows), "utf8");
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<Tier, number>;
  for (const r of rows) counts[r.tier]++;
  // eslint-disable-next-line no-console
  console.log(
    `Classified ${rows.length} files → T1=${counts[1]} T2=${counts[2]} ` +
      `T3=${counts[3]} T4=${counts[4]} → ${OUT_REL}`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  throw err;
});
