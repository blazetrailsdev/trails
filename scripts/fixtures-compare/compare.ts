// fixtures:compare — diff Rails activerecord/test/fixtures/*.yml against
// packages/activerecord/src/test-helpers/fixtures/<kebab-name>.ts. Soft
// failure only per docs/fixtures-port-plan.md (Decision 4); PR 7 flips
// to hard-fail. ERB stubs adapter_name to "SQLite"; other ERB → skipped.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { TEST_SCHEMA } from "../../packages/activerecord/src/test-helpers/test-schema.js";
import type {
  Schema,
  TableSchema,
} from "../../packages/activerecord/src/test-helpers/define-schema.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const YML_DIR = path.join(ROOT, "vendor/rails/activerecord/test/fixtures");
const TS_DIR = path.join(ROOT, "packages/activerecord/src/test-helpers/fixtures");

type Row = Record<string, unknown>;
type FixtureMap = Record<string, Row>;
// prettier-ignore
type Status = "MATCH" | "MISSING" | "DIFF" | "ERB-UNSUPPORTED" | "YAML-PARSE-ERR" | "TS-IMPORT-ERR" | "TS-EXPORT-MISSING";

// prettier-ignore
interface FileResult { yamlBase: string; tsBase: string | null; status: Status; rowsMatched: number; rowsTotal: number; attrsMatched: number; attrsTotal: number; schemaPorted: boolean; schemaExtras: number; notes: string[]; }

function parseArgs(argv: string[]): { pkg: string; filter: string | null } {
  let pkg = "activerecord";
  let filter: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--package") {
      if (!argv[i + 1]) throw new Error("--package requires a value");
      pkg = argv[++i];
    } else if (a.startsWith("--package=")) {
      pkg = a.slice(10);
      if (!pkg) throw new Error("--package= requires a value");
    } else if (!a.startsWith("--") && filter === null) filter = a;
  }
  return { pkg, filter };
}

const kebab = (s: string): string => s.replace(/_/g, "-");

export function stripErb(text: string): { rendered: string; unsupported: boolean } {
  const rendered = text.replace(/<%=\s*ActiveRecord::Base\.connection\.adapter_name\s*%>/g, "SQLite"); // prettier-ignore
  return { rendered, unsupported: /<%[=#]?[^%]*%>/.test(rendered) };
}

// prettier-ignore
function loadRailsYaml(file: string): { ok: true; data: FixtureMap } | { ok: false; reason: Status } {
  const raw = readFileSync(file, "utf8");
  const { rendered, unsupported } = stripErb(raw);
  if (unsupported) return { ok: false, reason: "ERB-UNSUPPORTED" };
  let parsed: unknown;
  try {
    parsed = parseYaml(rendered);
  } catch {
    return { ok: false, reason: "YAML-PARSE-ERR" };
  }
  const out: FixtureMap = {};
  if (!parsed || typeof parsed !== "object") return { ok: true, data: out };
  // YAML !omap → array of single-key maps; otherwise a plain object.
  const entries = Array.isArray(parsed)
    ? parsed.flatMap((e) => (e && typeof e === "object" ? Object.entries(e) : []))
    : Object.entries(parsed as Record<string, unknown>);
  for (const [k, v] of entries)
    if (v && typeof v === "object" && !Array.isArray(v)) out[k] = v as Row;
  return { ok: true, data: out };
}

function buildIdIndex(yamls: Map<string, FixtureMap>): Map<string, Map<number, string[]>> {
  const idx = new Map<string, Map<number, string[]>>();
  for (const [table, rows] of yamls) {
    const inner = new Map<number, string[]>();
    for (const [name, row] of Object.entries(rows)) {
      if (typeof row.id === "number") inner.set(row.id, [...(inner.get(row.id) ?? []), name]);
    }
    idx.set(table, inner);
  }
  return idx;
}

export function isRefLike(v: unknown): v is { tableName: string; fixtureName: string } {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o === "object" && typeof o.tableName === "string" && typeof o.fixtureName === "string"; // prettier-ignore
}

// prettier-ignore
export function compareValue(tsVal: unknown, railsVal: unknown, attr: string, idIndex: Map<string, Map<number, string[]>>, notes: string[]): boolean {
  if (isRefLike(tsVal)) {
    const { tableName, fixtureName } = tsVal;
    if (typeof railsVal === "number") {
      const cands = idIndex.get(tableName)?.get(railsVal) ?? [];
      if (cands.length === 1 && cands[0] === fixtureName) return true;
      const msg =
        cands.length > 1
          ? `ambiguous-fk: ${attr} id=${railsVal} matches ${cands.length}`
          : cands.length === 0
            ? `${attr}: no row in "${tableName}" with id=${railsVal}`
            : `${attr}: ref("${tableName}","${fixtureName}") but id=${railsVal} → "${cands[0]}"`;
      notes.push(msg);
      return false;
    }
    if (typeof railsVal === "string") {
      if (railsVal === fixtureName) return true;
      notes.push(`${attr}: ref "${fixtureName}" vs Rails string "${railsVal}"`);
      return false;
    }
    notes.push(`${attr}: ref vs unexpected Rails type ${typeof railsVal}`);
    return false;
  }
  if (tsVal === railsVal) return true;
  notes.push(`value-differs: ${attr}: ts=${JSON.stringify(tsVal)} rails=${JSON.stringify(railsVal)}`); // prettier-ignore
  return false;
}

// Mirror of the (non-exported) discriminator in define-schema.ts. Kept in
// strict step with `isWrappedSchema` there (require well-typed primaryKey,
// columns map, AND no other top-level keys; PK arrays must be all strings).
// Returns the column map plus whether `defineSchema` creates an implicit
// `id` column — only the legacy shape gets one; define-schema.ts sets
// `createOpts.id = false` for BOTH `primaryKey: false` and `primaryKey:
// string[]`, so any wrapped form has no implicit `id`.
const WRAPPER_KEYS = new Set(["columns", "primaryKey"]);
function tableShape(table: TableSchema): {
  columns: Record<string, unknown>;
  hasImplicitId: boolean;
} {
  if (table && typeof table === "object" && "primaryKey" in table) {
    const pk = (table as { primaryKey?: unknown }).primaryKey;
    const cols = (table as { columns?: unknown }).columns;
    const pkOk = pk === false || (Array.isArray(pk) && pk.every((v) => typeof v === "string"));
    const onlyWrapperKeys = Object.keys(table).every((k) => WRAPPER_KEYS.has(k));
    if (pkOk && cols && typeof cols === "object" && onlyWrapperKeys) {
      return { columns: cols as Record<string, unknown>, hasImplicitId: false };
    }
  }
  return { columns: table as Record<string, unknown>, hasImplicitId: true };
}

/**
 * Per-fixture schema-parity check. Complements the Rails-YAML diff: catches
 * drift between a TS fixture and `TEST_SCHEMA` even when the Rails YAML and
 * TS rows agree (typo'd column, column dropped from schema, etc.). Stays
 * useful after Rails-diff hits 100% — fixtures and schema can drift
 * independently afterward.
 *
 * `id` is allowed only when defineSchema would create one — that's the
 * legacy `Record<colName, ColumnSpec>` shape only. Any wrapped table
 * (`primaryKey: false` *or* `primaryKey: string[]`) has `id` suppressed
 * (see define-schema.ts setting `createOpts.id = false` for both),
 * so a stray `id` on those flags as drift.
 *
 * Returns `ported=false` when the table hasn't landed in TEST_SCHEMA yet —
 * expected during the 0.5a..0.5h schema port and treated as informational,
 * not drift.
 */
export function schemaCheck(
  snake: string,
  tsRows: FixtureMap,
  schema: Schema,
  notes: string[],
): { ported: boolean; extras: number } {
  const table = schema[snake];
  if (!table) return { ported: false, extras: 0 };
  const shape = tableShape(table);
  const declared = new Set(Object.keys(shape.columns));
  if (shape.hasImplicitId) declared.add("id");
  let extras = 0;
  for (const [rowName, row] of Object.entries(tsRows)) {
    // Skip non-object rows (null/undefined/scalar). compareFile's own row-
    // shape pass reports those as "row missing in TS"; the schema check
    // shouldn't promote a malformed-fixture soft DIFF to a runtime crash.
    if (!row || typeof row !== "object") continue;
    for (const attr of Object.keys(row)) {
      if (!declared.has(attr)) {
        notes.push(`schema-extra-col: ${rowName}.${attr} not in schema["${snake}"]`);
        extras++;
      }
    }
  }
  return { ported: true, extras };
}

// prettier-ignore
export async function compareFile(yamlBase: string, yamlByTable: Map<string, FixtureMap>, idIndex: Map<string, Map<number, string[]>>, prelimFailure: Status | undefined, schema: Schema = TEST_SCHEMA): Promise<FileResult> {
  const snake = yamlBase.replace(/\.yml$/, "");
  const tsFile = path.join(TS_DIR, `${kebab(snake)}.ts`);
  const tsBase = existsSync(tsFile) ? `${kebab(snake)}.ts` : null;
  const r: FileResult = { yamlBase, tsBase, status: "MATCH", rowsMatched: 0, rowsTotal: 0, attrsMatched: 0, attrsTotal: 0, schemaPorted: false, schemaExtras: 0, notes: [] }; // prettier-ignore
  if (prelimFailure) { r.status = prelimFailure; return r; } // prettier-ignore
  const railsRows = yamlByTable.get(snake)!;
  r.rowsTotal = Object.keys(railsRows).length;
  if (!tsBase) { r.status = "MISSING"; return r; } // prettier-ignore
  let mod: Record<string, unknown>;
  try {
    mod = (await import(pathToFileURL(tsFile).href)) as Record<string, unknown>;
  } catch (e) {
    r.status = "TS-IMPORT-ERR";
    r.notes.push((e as Error).message);
    return r;
  }
  // Fixture modules export singular names (authorFixtureData, not authorsFixtureData), and
  // developers-projects.ts uses developersProjectsFixtureData — too irregular to derive from the
  // file stem. Require exactly one *FixtureData export so an ambiguous file fails loudly.
  const keys = Object.keys(mod).filter((n) => n.endsWith("FixtureData"));
  const tsRows = keys.length === 1 ? (mod[keys[0]] as FixtureMap | undefined) : undefined;
  if (!tsRows || typeof tsRows !== "object") {
    r.status = "TS-EXPORT-MISSING";
    r.notes.push(keys.length > 1 ? `${tsBase} exports ${keys.length} *FixtureData symbols (expected 1)` : `no *FixtureData export in ${tsBase}`); // prettier-ignore
    return r;
  }
  const sc = schemaCheck(snake, tsRows, schema, r.notes);
  r.schemaPorted = sc.ported;
  r.schemaExtras = sc.extras;
  let anyDiff = sc.extras > 0;
  for (const [rowName, railsRow] of Object.entries(railsRows)) {
    const tsRow = tsRows[rowName];
    if (!tsRow || typeof tsRow !== "object") {
      r.notes.push(`row missing in TS: ${rowName}`);
      anyDiff = true;
      continue;
    }
    r.rowsMatched++;
    if ("id" in railsRow && (!("id" in tsRow) || tsRow.id !== railsRow.id)) {
      r.notes.push(`id-divergence: ${rowName} ts=${String(tsRow.id)} rails=${String(railsRow.id)}`);
      anyDiff = true;
    }
    for (const attr of new Set([...Object.keys(railsRow), ...Object.keys(tsRow)])) {
      r.attrsTotal++;
      if (!(attr in tsRow) || !(attr in railsRow)) {
        r.notes.push(`${attr in tsRow ? "extra" : "missing"}-in-ts: ${rowName}.${attr}`);
        anyDiff = true;
        continue;
      }
      if (attr === "id") { if (tsRow.id === railsRow.id) r.attrsMatched++; continue; } // prettier-ignore
      if (compareValue(tsRow[attr], railsRow[attr], `${rowName}.${attr}`, idIndex, r.notes))
        r.attrsMatched++; // prettier-ignore
      else anyDiff = true;
    }
  }
  for (const rowName of Object.keys(tsRows)) {
    if (!(rowName in railsRows)) { r.notes.push(`extra-row-in-ts: ${rowName}`); anyDiff = true; } // prettier-ignore
  }
  r.status = anyDiff ? "DIFF" : "MATCH";
  return r;
}

// `schemaCheck` only runs after a successful TS import, so a result has
// real schema data exactly when its final status is MATCH or DIFF. Early-
// return statuses (MISSING, ERB-UNSUPPORTED, YAML-PARSE-ERR, TS-IMPORT-ERR,
// TS-EXPORT-MISSING) skip the check entirely — distinguish "not evaluated"
// from "evaluated, no schema entry" both in per-file output and totals.
function schemaEvaluated(r: FileResult): boolean {
  return r.status === "MATCH" || r.status === "DIFF";
}

function formatLine(r: FileResult): string {
  const pct = r.attrsTotal === 0 ? "—" : `${Math.round((r.attrsMatched / r.attrsTotal) * 100)}%`;
  const sch = !schemaEvaluated(r)
    ? ""
    : !r.schemaPorted
      ? "schema:not-ported"
      : r.schemaExtras > 0
        ? `schema:extras=${r.schemaExtras}`
        : "schema:ok";
  return (
    r.yamlBase.padEnd(32) +
    (r.tsBase ?? "(missing)").padEnd(28) +
    `rows: ${r.rowsMatched}/${r.rowsTotal}`.padEnd(14) +
    `attrs: ${r.attrsMatched}/${r.attrsTotal}`.padEnd(16) +
    pct.padEnd(6) +
    sch.padEnd(20) +
    r.status
  );
}

async function main(): Promise<void> {
  const { pkg, filter } = parseArgs(process.argv.slice(2));
  if (pkg !== "activerecord") {
    console.error(`fixtures:compare: --package ${pkg} not supported yet`);
    process.exit(2);
  }

  const allYamls = readdirSync(YML_DIR)
    .filter((f) => f.endsWith(".yml"))
    .sort();
  const yamlFiles = filter ? allYamls.filter((f) => f.includes(filter)) : allYamls;

  // Parse every YAML so the id index is complete even when --filter narrows the per-file pass.
  const yamlByTable = new Map<string, FixtureMap>();
  const prelim = new Map<string, Status>();
  for (const f of allYamls) {
    const snake = f.replace(/\.yml$/, "");
    const loaded = loadRailsYaml(path.join(YML_DIR, f));
    if (loaded.ok) yamlByTable.set(snake, loaded.data);
    else prelim.set(snake, loaded.reason);
  }
  const idIndex = buildIdIndex(yamlByTable);

  const results: FileResult[] = [];
  for (const f of yamlFiles) {
    const snake = f.replace(/\.yml$/, "");
    results.push(await compareFile(f, yamlByTable, idIndex, prelim.get(snake)));
  }

  for (const r of results) {
    console.log(formatLine(r));
    if (process.env.FIXTURES_COMPARE_VERBOSE === "1") {
      for (const n of r.notes) console.log(`    ${n}`);
    }
  }
  const n = (s: Status): number => results.filter((r) => r.status === s).length;
  const other = results.length - n("MATCH") - n("DIFF") - n("MISSING") - n("ERB-UNSUPPORTED");
  const evaluated = results.filter(schemaEvaluated);
  const ported = evaluated.filter((r) => r.schemaPorted).length;
  const withExtras = evaluated.filter((r) => r.schemaExtras > 0).length;
  console.log(`\n${results.length} files — match=${n("MATCH")} diff=${n("DIFF")} missing=${n("MISSING")} erb-unsupported=${n("ERB-UNSUPPORTED")} other=${other}`); // prettier-ignore
  console.log(
    `schema — ported=${ported}/${evaluated.length} extras-flagged=${withExtras} (skipped ${results.length - evaluated.length})`,
  );
  console.log("(MISSING/DIFF soft per Decision 4 until PR 7; runtime errors hard-fail)");
  // Decision 4 names DIFF/MISSING as soft; YAML/TS load errors are script-runtime, hard-fail.
  const hard: readonly Status[] = ["YAML-PARSE-ERR", "TS-IMPORT-ERR", "TS-EXPORT-MISSING"];
  if (results.some((r) => hard.includes(r.status))) process.exit(1);
}

// Run as a script when invoked directly, but stay importable from tests.
// Resolve to an absolute path before comparing — `process.argv[1]` can be relative under some launchers.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
