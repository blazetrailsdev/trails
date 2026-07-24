// schema:compare — structural parity check of TEST_SCHEMA
// (packages/activerecord/src/test-helpers/test-schema.ts) against the vendored
// vendor/rails/activerecord/test/schema/schema.rb it is documented to mirror.
//
// Two verdicts:
//   INVENTED (fatal)    — a table or column present in TEST_SCHEMA that
//                         schema.rb does not declare. This is the guard-rail:
//                         it is how the `encrypted_posts` near-miss and
//                         vendor-bump drift get caught mechanically.
//   SHAPE  (report-only) — a shared table whose column types diverge, or a
//                         Rails column TEST_SCHEMA has not ported yet. Printed
//                         but non-fatal; tightening these is follow-up work.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_SCHEMA } from "../../packages/activerecord/src/test-helpers/test-schema.js";
import type {
  ColumnSpec,
  Schema,
} from "../../packages/activerecord/src/test-helpers/schema-types.js";
import { columnsOf } from "../../packages/activerecord/src/test-helpers/schema-types.js";
import type { RailsColumnOptions, RailsTable } from "./parse-schema-rb.js";
import { parseSchemaRb, parseSchemaRbWithCoverage } from "./parse-schema-rb.js";
import { writeJsonManifest } from "../api-compare/write-json-manifest.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const SCHEMA_RB = path.join(ROOT, "vendor/rails/activerecord/test/schema/schema.rb");
const BASELINE = path.join(HERE, "invented-baseline.json");

/**
 * Pre-existing invented entries, recorded so the gate ratchets: anything in
 * the baseline is reported as debt, anything new is fatal. Entries are table
 * names, or `table.column` for a column on an otherwise-canonical table.
 *
 * The list only ever shrinks. Reseed with `pnpm schema:compare:reseed` after
 * *removing* inventions — the reseed refuses to grow the file, so a red gate
 * can never be "fixed" by blessing the invention that turned it red.
 */
export interface Baseline {
  tables: string[];
  columns: string[];
}

export async function readBaseline(): Promise<Baseline> {
  try {
    return JSON.parse(await readFile(BASELINE, "utf8")) as Baseline;
  } catch {
    return { tables: [], columns: [] };
  }
}

/**
 * Tables that exist in TEST_SCHEMA with no `create_table` in schema.rb.
 *
 * Every entry needs a reason and, ideally, a story to remove it — the point of
 * this check is that the list trends to empty. An entry here is a documented
 * deviation, not a licence to add more.
 */
export const TABLE_ALLOW_LIST: ReadonlyMap<string, string> = new Map([
  [
    "schema_migrations",
    "Rails creates this from the migration context, not schema.rb; the canonical loader lays it directly so schema-dumper tests have it.",
  ],
  [
    "ar_internal_metadata",
    "Same as schema_migrations — Rails-internal bookkeeping table, created outside schema.rb.",
  ],
]);

/**
 * Columns that exist in TEST_SCHEMA with no counterpart in the table's
 * schema.rb block, keyed `table.column`. Same rules as TABLE_ALLOW_LIST.
 */
export const COLUMN_ALLOW_LIST: ReadonlyMap<string, string> = new Map([]);

/** Rails column type → the `ColumnSpec` type TEST_SCHEMA would spell it with. */
const RAILS_TYPE_TO_SPEC: Readonly<Record<string, string>> = {
  bigint: "big_integer",
  bigserial: "big_integer",
  serial: "integer",
  timestamp: "datetime",
  blob: "binary",
  numeric: "decimal",
  jsonb: "json",
  // `t.references` width is adapter-chosen; TEST_SCHEMA spells FK columns as
  // integer or big_integer, so both are accepted (see typesAgree).
  references: "integer",
};

export type Verdict = "INVENTED-TABLE" | "INVENTED-COLUMN" | "SHAPE" | "OPTION" | "UNPORTED-COLUMN";

/**
 * How many `OPTION` findings the vendored schema currently carries. The gate
 * ratchets this down: it may fall as divergences are fixed, never rise. When it
 * reaches 0 the option check is armed — any `OPTION` finding then fails the gate
 * fatally, alongside the INVENTED verdicts (see {@link optionRegressions}).
 *
 * The 4 live findings are `parrots.{created,updated}_{at,on}`: schema.rb pins
 * `precision: 0` on those timestamps but TEST_SCHEMA leaves precision implicit.
 */
export const OPTION_DEBT_CEILING = 4;

export interface Finding {
  verdict: Verdict;
  table: string;
  column?: string;
  detail: string;
}

export function isFatal(finding: Finding): boolean {
  return finding.verdict === "INVENTED-TABLE" || finding.verdict === "INVENTED-COLUMN";
}

function specType(spec: ColumnSpec): string {
  return typeof spec === "string" ? spec : spec.type;
}

function typesAgree(railsType: string, tsType: string): boolean {
  const mapped = RAILS_TYPE_TO_SPEC[railsType] ?? railsType;
  if (mapped === tsType) return true;
  // FK width is a per-adapter choice in Rails; either spelling is faithful.
  if (railsType === "references") return tsType === "integer" || tsType === "big_integer";
  return false;
}

/** The object form of a ColumnSpec, or an empty options bag for the shorthand. */
type SpecOptions = Exclude<ColumnSpec, string>;

function specOptions(spec: ColumnSpec): SpecOptions {
  return typeof spec === "string" ? ({ type: spec } as SpecOptions) : spec;
}

/**
 * Normalises a Rails `default:` token — captured verbatim from schema.rb source
 * — to a comparable canonical string. `nil` and an omitted default both read as
 * "no default"; a lambda (`-> { ... }`) is a function default whose body is
 * adapter-specific SQL, so it collapses to a single `fn` tag rather than being
 * compared literally.
 */
export function normalizeRailsDefault(token: string | undefined): string {
  if (token === undefined) return "none";
  const value = token.trim();
  if (value === "" || value === "nil") return "none";
  if (value.startsWith("->") || value.startsWith("lambda") || value.startsWith("proc")) return "fn";
  const quoted = /^"([\s\S]*)"$/.exec(value) ?? /^'([\s\S]*)'$/.exec(value);
  if (quoted) return JSON.stringify(quoted[1]);
  if (value === "true" || value === "false") return value;
  const n = Number(value);
  if (value !== "" && Number.isFinite(n)) return JSON.stringify(n);
  return JSON.stringify(value);
}

/** Normalises the TEST_SCHEMA side's default to the same canonical string. */
export function normalizeSpecDefault(spec: SpecOptions): string {
  if (spec.defaultFunction !== undefined) return "fn";
  if (!("default" in spec) || spec.default === undefined) return "none";
  return JSON.stringify(spec.default);
}

/** Rails treats an omitted `null:` as nullable; so does a bare DDL column. */
function railsNullable(options: RailsColumnOptions): boolean {
  return options.null ?? true;
}

function specNullable(spec: SpecOptions): boolean {
  return spec.null ?? true;
}

function displayPrecision(precision: number | null | undefined): string {
  return precision === null ? "nil" : (precision ?? "—").toString();
}

/**
 * Column-option divergences between a schema.rb column and its TEST_SCHEMA
 * counterpart. `null` and `default` are compared through their Rails defaults
 * (omitted `null:` is nullable; see {@link normalizeRailsDefault}); `limit`,
 * `precision`, and `scale` are compared verbatim, where an omitted value is the
 * type/adapter default on both sides and `precision: nil` stays distinct from
 * an omitted precision.
 *
 * Two cases are tolerated rather than flagged, mirroring how {@link typesAgree}
 * already accepts adapter-chosen spellings:
 *   - a `**splat` option list (`dynamicOptions`) whose keys the parser never
 *     saw — comparing that partial evidence would manufacture false findings;
 *   - `precision: null` on the TEST_SCHEMA side paired with a function default,
 *     the documented bare-DATETIME request that suppresses MySQL's
 *     auto-precision upgrade for `DEFAULT CURRENT_TIMESTAMP`.
 */
export function optionMismatches(rails: RailsColumnOptions, spec: ColumnSpec): string[] {
  if (rails.dynamicOptions) return [];
  const opts = specOptions(spec);
  const specDefault = normalizeSpecDefault(opts);
  const detail: string[] = [];

  if (railsNullable(rails) !== specNullable(opts)) {
    detail.push(`null: schema.rb ${railsNullable(rails)}, TEST_SCHEMA ${specNullable(opts)}`);
  }
  for (const key of ["limit", "scale"] as const) {
    if (rails[key] !== opts[key]) {
      detail.push(`${key}: schema.rb ${rails[key] ?? "—"}, TEST_SCHEMA ${opts[key] ?? "—"}`);
    }
  }
  const precisionIsAdapterDriven = opts.precision === null && specDefault === "fn";
  const railsPrecision = "precision" in rails ? rails.precision : undefined;
  if (!precisionIsAdapterDriven && railsPrecision !== opts.precision) {
    detail.push(
      `precision: schema.rb ${displayPrecision(railsPrecision)}, ` +
        `TEST_SCHEMA ${displayPrecision(opts.precision)}`,
    );
  }
  const railsDefault = normalizeRailsDefault(rails.default);
  if (railsDefault !== specDefault) {
    detail.push(`default: schema.rb ${railsDefault}, TEST_SCHEMA ${specDefault}`);
  }
  return detail;
}

/**
 * Diffs TEST_SCHEMA against the parsed schema.rb tables. Pure — the caller
 * supplies both sides so tests can drive it without touching the filesystem.
 */
export function compareSchemas(
  testSchema: Schema,
  railsTables: ReadonlyMap<string, RailsTable>,
): Finding[] {
  const findings: Finding[] = [];

  for (const [tableName, tableSchema] of Object.entries(testSchema)) {
    const rails = railsTables.get(tableName);
    if (!rails) {
      if (TABLE_ALLOW_LIST.has(tableName)) continue;
      findings.push({
        verdict: "INVENTED-TABLE",
        table: tableName,
        detail: "no create_table in schema.rb",
      });
      continue;
    }

    const tsColumns = columnsOf(tableSchema);
    for (const [columnName, spec] of Object.entries(tsColumns)) {
      const railsColumn = rails.columns.get(columnName);
      if (!railsColumn) {
        if (COLUMN_ALLOW_LIST.has(`${tableName}.${columnName}`)) continue;
        // Rails' PK columns are implicit in the block; TEST_SCHEMA sometimes
        // spells them out (`bulbs.ID`, `owners.owner_id`).
        if (rails.primaryKeyColumns.has(columnName)) continue;
        // A block we could not fully parse may well declare this column; do
        // not accuse it of being invented on evidence we know is incomplete.
        if (rails.dynamic) continue;
        findings.push({
          verdict: "INVENTED-COLUMN",
          table: tableName,
          column: columnName,
          detail: "not declared in the schema.rb create_table block",
        });
        continue;
      }
      const tsType = specType(spec);
      if (!typesAgree(railsColumn.type, tsType)) {
        findings.push({
          verdict: "SHAPE",
          table: tableName,
          column: columnName,
          detail: `schema.rb says ${railsColumn.type}, TEST_SCHEMA says ${tsType}`,
        });
        // A type divergence makes the options incomparable (a limit on a
        // string means nothing against an integer), so stop at the type.
        continue;
      }
      const mismatches = optionMismatches(railsColumn.options, spec);
      if (mismatches.length > 0) {
        findings.push({
          verdict: "OPTION",
          table: tableName,
          column: columnName,
          detail: mismatches.join("; "),
        });
      }
    }

    for (const columnName of rails.columns.keys()) {
      if (columnName in tsColumns) continue;
      if (rails.primaryKeyColumns.has(columnName)) continue;
      findings.push({
        verdict: "UNPORTED-COLUMN",
        table: tableName,
        column: columnName,
        detail: "declared in schema.rb, absent from TEST_SCHEMA",
      });
    }
  }

  return findings;
}

function formatFinding(finding: Finding): string {
  const target = finding.column ? `${finding.table}.${finding.column}` : finding.table;
  return `${isFatal(finding) ? "FAIL" : "warn"}  ${finding.verdict.padEnd(15)} ${target} — ${finding.detail}`;
}

/**
 * `create_table` call sites the parser could not resolve to a table name. Any
 * result means the parser has fallen behind the vendored source and its
 * verdicts cannot be trusted — the caller must abort rather than report. An
 * unresolved call site would otherwise turn every TEST_SCHEMA table mirroring
 * it into a phantom "invention", the one false verdict this tool must never
 * emit (Codex review of #4966 found exactly that, twice).
 */
export function unresolvedCallSites(source: string): string[] {
  return parseSchemaRbWithCoverage(source).unresolved;
}

/** The baseline key for a finding: the table, or `table.column`. */
export function baselineKey(finding: Finding): string {
  return finding.column ? `${finding.table}.${finding.column}` : finding.table;
}

/** Splits invented findings into new regressions and known (baselined) debt. */
export function applyBaseline(
  findings: readonly Finding[],
  baseline: Baseline,
): { regressions: Finding[]; known: Finding[]; stale: string[] } {
  const knownTables = new Set(baseline.tables);
  const knownColumns = new Set(baseline.columns);
  const regressions: Finding[] = [];
  const known: Finding[] = [];
  const seen = new Set<string>();

  for (const finding of findings) {
    if (!isFatal(finding)) continue;
    const key = baselineKey(finding);
    seen.add(key);
    const listed =
      finding.verdict === "INVENTED-TABLE" ? knownTables.has(key) : knownColumns.has(key);
    (listed ? known : regressions).push(finding);
  }

  const stale = [...knownTables, ...knownColumns].filter((key) => !seen.has(key));
  return { regressions, known, stale };
}

/**
 * `OPTION` findings that trip the gate. While `OPTION_DEBT_CEILING` exceeds the
 * live count they are report-only debt; the moment the ceiling is ratcheted to
 * 0 every remaining finding is a fatal regression, mirroring the INVENTED gate.
 */
export function optionRegressions(
  findings: readonly Finding[],
  ceiling: number = OPTION_DEBT_CEILING,
): Finding[] {
  const options = findings.filter((f) => f.verdict === "OPTION");
  return options.length > ceiling ? options : [];
}

/**
 * Splits findings into the disjoint buckets the reporter prints and counts.
 * `shape` is the non-fatal type-level warnings (SHAPE / UNPORTED) only — OPTION
 * findings live in `option` / `optionFatal`, so a `shape` count never
 * double-counts them, and `option` (soft) ∩ `optionFatal` is empty.
 */
export function partitionFindings(
  findings: readonly Finding[],
  ceiling: number = OPTION_DEBT_CEILING,
): { shape: Finding[]; option: Finding[]; optionFatal: Finding[] } {
  const optionFindings = findings.filter((f) => f.verdict === "OPTION");
  const optionFatal = optionRegressions(findings, ceiling);
  return {
    shape: findings.filter((f) => !isFatal(f) && f.verdict !== "OPTION"),
    option: optionFatal.length > 0 ? [] : optionFindings,
    optionFatal,
  };
}

export async function main(): Promise<void> {
  const source = await readFile(SCHEMA_RB, "utf8");
  const railsTables = parseSchemaRb(source);

  // Trust the parser before trusting its verdicts.
  const unresolved = unresolvedCallSites(source);
  if (unresolved.length > 0) {
    console.error(
      `schema.rb has ${unresolved.length} create_table call site(s) the parser could not ` +
        `resolve to a table name:\n${unresolved.map((l) => `  ${l}`).join("\n")}\n\n` +
        `Every verdict would be unreliable, so nothing is reported. Teach ` +
        `scripts/schema-compare/parse-schema-rb.ts the new create_table form.`,
    );
    process.exit(1);
  }

  const findings = compareSchemas(TEST_SCHEMA, railsTables);

  if (process.argv.includes("--write")) {
    const invented = findings.filter(isFatal);
    const next: Baseline = {
      tables: invented
        .filter((f) => f.verdict === "INVENTED-TABLE")
        .map(baselineKey)
        .sort(),
      columns: invented
        .filter((f) => f.verdict === "INVENTED-COLUMN")
        .map(baselineKey)
        .sort(),
    };
    // A reseed exists to record that debt SHRANK. Letting it grow would let a
    // red gate be "fixed" by blessing the very invention it caught — which
    // silently retires the guard-rail this whole tool exists to be.
    const { regressions } = applyBaseline(findings, await readBaseline());
    if (regressions.length > 0 && !process.argv.includes("--allow-growth")) {
      console.error(
        `refusing to grow the baseline by ${regressions.length} new invention(s):\n` +
          regressions.map((f) => `  ${baselineKey(f)}`).join("\n") +
          "\n\nThe baseline records pre-existing debt only. Remove the table/column from " +
          "TEST_SCHEMA, or add it to schema.rb upstream. Pass --allow-growth only when a " +
          "vendored-Rails bump legitimately removed canonical schema.",
      );
      process.exit(1);
    }
    writeJsonManifest(BASELINE, next);
    console.log(
      `wrote baseline — ${next.tables.length} tables, ${next.columns.length} columns of known debt`,
    );
    return;
  }

  const { regressions, known, stale } = applyBaseline(findings, await readBaseline());
  const { shape, option, optionFatal } = partitionFindings(findings);
  const optionCount = findings.filter((f) => f.verdict === "OPTION").length;

  for (const finding of regressions) console.log(formatFinding(finding));
  for (const finding of optionFatal) console.log(formatFinding(finding));
  if (process.argv.includes("--verbose")) {
    for (const finding of [...shape, ...option]) console.log(formatFinding(finding));
  }
  for (const key of stale) {
    console.log(
      `note  BASELINE-STALE  ${key} — no longer invented; drop it with pnpm schema:compare:reseed`,
    );
  }

  console.log(
    `\n${Object.keys(TEST_SCHEMA).length} TEST_SCHEMA tables vs ${railsTables.size} schema.rb tables — ` +
      `new-inventions=${regressions.length} baselined=${known.length} ` +
      `option-divergences=${optionCount} (ceiling ${OPTION_DEBT_CEILING}) shape-warnings=${shape.length}` +
      (process.argv.includes("--verbose") ? "" : " (--verbose to list shape warnings)"),
  );

  if (regressions.length > 0) {
    console.log(
      "\nTEST_SCHEMA mirrors vendor/rails/activerecord/test/schema/schema.rb. Add the table/column " +
        "to schema.rb upstream, or drop it here — do not invent canonical schema. The baseline " +
        "records pre-existing debt only and must not grow.",
    );
  }
  if (optionFatal.length > 0) {
    console.log(
      `\n${optionFatal.length} column-option divergence(s) exceed the OPTION_DEBT_CEILING of ` +
        `${OPTION_DEBT_CEILING}. Align the TEST_SCHEMA column options with schema.rb, or ratchet ` +
        "the ceiling in scripts/schema-compare/compare.ts down to the new (lower) count.",
    );
  }
  if (regressions.length > 0 || optionFatal.length > 0) process.exit(1);
}

// Run as a script when invoked directly, but stay importable from tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
