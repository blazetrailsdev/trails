// fixtures:compare — diff Rails activerecord/test/fixtures/*.yml against
// packages/activerecord/src/test-helpers/fixtures/<kebab-name>.ts. Soft
// failure only per the fixtures port plan (Decision 4); PR 7 flips
// to hard-fail. ERB stubs adapter_name to "SQLite"; other ERB → skipped.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
type Status = "MATCH" | "MISSING" | "DIFF" | "ERB-UNSUPPORTED" | "ERB-ALLOWED" | "YAML-PARSE-ERR" | "TS-IMPORT-ERR" | "TS-EXPORT-MISSING";

// Fixtures whose Rails YAML uses ERB constructs we don't reduce (binary
// helpers, 1000+ row loops). Listed here so the PR-7b strict flip treats
// them as expected gaps rather than failures. Per the fixtures port plan (complete)
// — the TS side is the source of truth for these tables (rows expanded
// statically, with the original ERB intent preserved in a header comment).
export const ERB_ALLOW_LIST: ReadonlySet<string> = new Set<string>([
  "mixins",
  "paragraphs",
  "citations",
]);

// Per-table assoc-shorthand → FK-column override map. Mirrors Rails
// `fixtures.rb#replace_belongs_to_keys`, which rewrites `pirate: blackbeard`
// to `pirate_id` via the model's belongs_to reflection. We don't have the
// reflection, so the convention `<assoc>_id` covers the common case and
// this table holds explicit overrides for assocs whose FK column doesn't
// follow it (e.g. a `creator:` shorthand in YAML that targets a `captain_id`
// column on the TS row). Keys are the YAML association names; values are
// the materialized FK column on the row.
export const FK_OVERRIDES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  // Sponsor `belongs_to :sponsor_club, class_name: "Club", foreign_key: "club_id"`
  // — the YAML association name (`sponsor_club`) doesn't follow the
  // `<assoc>_id` convention, so map it to the real FK column `club_id`.
  sponsors: { sponsor_club: "club_id" },
};

// Per-table enum-symbol → integer map for `enum :status, [:proposed, …]`
// columns. Rails YAML carries `status: :published` (or sometimes
// `status: "proposed"`); the TS fixture carries the integer assigned by
// the model's `enum` declaration. Lookups are best-effort: when a column
// is registered, the comparator resolves symbol↔int; when it isn't, the
// pair is reported as `enum-unmapped` and counted as a soft attribute skip
// (not a DIFF). Maps are intentionally small — populating them is the
// follow-up DIFF-reconcile PR. Keep this an `enums` registry and not a
// general "I declare this string equals this number" knob.
//
// A value of `null` mirrors a Rails enum member mapped to nil (e.g.
// `enum :last_read, { …, forgotten: nil }`) — the stored column is NULL,
// and the TS fixture carries `null` for that row.
export const ENUM_MAPS: Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<string, number | null>>>>>
> = {
  // Book — `vendor/rails/activerecord/test/models/book.rb`. Symbol/string
  // enum members on the Rails side resolve to the integer (or NULL) the TS
  // fixture stores.
  books: {
    status: { proposed: 0, written: 1, published: 2 },
    last_read: { unread: 0, reading: 2, read: 3, forgotten: null },
    language: { english: 0, spanish: 1, french: 2 },
    author_visibility: { visible: 0, invisible: 1 },
    illustrator_visibility: { visible: 0, invisible: 1 },
    font_size: { small: 0, medium: 1, large: 2 },
    difficulty: { easy: 0, medium: 1, hard: 2 },
    // `boolean_status` is deliberately omitted: its Book enum is
    // `{ enabled: true, disabled: false }` (a boolean, not an integer), so it
    // doesn't belong in an integer ENUM_MAPS. The fixture row currently
    // carries an integer — the known int→bool cross-engine #2572 followup —
    // so `awdr.boolean_status` stays an honest `enum-unmapped` soft-skip
    // until that fixture value is corrected to a boolean.
  },
};

// Per-table columns intentionally not mirrored in the TS fixture, counted as
// soft attribute skips rather than DIFFs. Reserved for values that can't be
// faithfully carried in a static TS literal — binary blobs (`!binary`) and
// opaque ERB binary helpers (`<%= binary(...) %>`). Tests needing real bytes
// build them in-test. Keep this narrow: it suppresses an attribute entirely,
// so anything that *could* be mirrored belongs in the fixture, not here.
export const SKIP_ATTRS: Readonly<Record<string, ReadonlySet<string>>> = {
  // binaries.yml `data` is a `!binary` JPEG blob (flowers) and an
  // `<%= binary(...) %>` helper (binary_helper) — neither is mirrored.
  binaries: new Set<string>(["data"]),
};

// prettier-ignore
interface FileResult { yamlPath: string; tsBase: string | null; status: Status; rowsMatched: number; rowsTotal: number; attrsMatched: number; attrsTotal: number; attrsSkipped: number; schemaPorted: boolean; schemaExtras: number; notes: string[]; }

// Sentinel substituted for opaque `<%= ... %>` output expressions we can't
// reduce (e.g. `<%= 2.weeks.ago.to_fs(:db) %>`, `<%= binary(...) %>`). The
// per-attr diff treats Rails values equal to this token as skipped — keeps
// the rest of the file comparable instead of dropping it as ERB-UNSUPPORTED.
export const ERB_SKIP_SENTINEL = "__ERB_SKIP__";

// Baseline locked at PR #2715 (93% milestone) + updated for recursive subdir scan
// (Phase 1 of the subdir-fixtures plan) + 4 admin fixtures ported in Phase 3
// + 2 categories fixtures ported in Phase 4a.
// Phases 2, 4b-6 will close the remaining 18 subdir YAMLs. Bump match when new
// fixtures are ported; bump diff only for intentional accepted drifts.
const CI_BASELINE = { match: 119, diff: 6, missing: 18 } as const;

function parseArgs(argv: string[]): {
  pkg: string;
  filter: string | null;
  models: boolean;
  incomplete: boolean;
  ci: boolean;
} {
  let pkg = "activerecord";
  let filter: string | null = null;
  let models = false;
  let incomplete = false;
  let ci = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--package") {
      if (!argv[i + 1]) throw new Error("--package requires a value");
      pkg = argv[++i];
    } else if (a.startsWith("--package=")) {
      pkg = a.slice(10);
      if (!pkg) throw new Error("--package= requires a value");
    } else if (a === "--models") {
      models = true;
    } else if (a === "--incomplete") {
      incomplete = true;
    } else if (a === "--ci") {
      ci = true;
    } else if (!a.startsWith("--") && filter === null) filter = a;
  }
  return { pkg, filter, models, incomplete, ci };
}

const kebab = (s: string): string => s.replace(/_/g, "-");

// CRC32 mirror of define-fixtures.ts#fixtureId. Duplicated (not imported) so
// the compare script stays standalone — no cross-package import for ~10 LOC.
const FIXTURE_MAX_ID = 2 ** 30 - 1;
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
function fixtureIdValue(label: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < label.length; i++) crc = CRC32_TABLE[(crc ^ label.charCodeAt(i)) & 0xff]! ^ (crc >>> 8); // prettier-ignore
  return ((crc ^ 0xffffffff) >>> 0) % FIXTURE_MAX_ID;
}

// Evaluate a tiny arithmetic expression containing only integers, `+ - * ( )`,
// whitespace, and the single loop-var name. `/` is intentionally excluded:
// Ruby integer division truncates toward -∞, JS `/` is float division, and
// silently disagreeing on a fixture id would be worse than falling back to
// ERB_SKIP_SENTINEL. Outside-grammar expressions return verbatim wrapped back
// in `<%= %>` so `stripErb`'s final `<%= ... %>` → ERB_SKIP_SENTINEL pass
// turns them into per-attribute skips (rather than file-level unsupported).
function evalExpr(expr: string, varName: string, value: number): string {
  const e = expr.trim();
  if (!new RegExp(`^[\\d\\s+\\-*()${varName}]+$`).test(e)) return `<%= ${expr} %>`;
  try {
    return String(new Function(varName, `"use strict"; return (${e});`)(value));
  } catch {
    // prettier-ignore
    return `<%= ${expr} %>`;
  }
}

// `<% (1..N).each do |v| %>...<% end %>` and `<% N.times do |v| %>...<% end %>`.
// Body's `<%= v %>` / `<%= v+1 %>` and `#{v}` interpolations get substituted.
function expandLoops(text: string): string {
  const re = /<%\s*(?:\((\d+)\.\.(\d+)\)\.each|(\d+)\.times)\s+do\s*\|\s*(\w+)\s*\|\s*%>([\s\S]*?)<%\s*end\s*%>/g; // prettier-ignore
  return text.replace(re, (orig, lo, hi, n, v, body) => {
    const start = lo !== undefined ? Number(lo) : 0;
    const end = lo !== undefined ? Number(hi) : Number(n) - 1;
    // Cap: paragraphs.yml (1001) + citations.yml (65536) expand to
    // multi-MB YAML and parse-stall the script. Leave them as
    // ERB-UNSUPPORTED stragglers — PR 7b allow-list candidates.
    if (end - start + 1 > 200) return orig;
    const out: string[] = [];
    for (let i = start; i <= end; i++) {
      let b = body.replace(/<%=\s*([^%]+?)\s*%>/g, (_m: string, expr: string) => evalExpr(expr, v, i)); // prettier-ignore
      b = b.replace(/#\{([^}]+)\}/g, (_m: string, expr: string) => evalExpr(expr, v, i));
      out.push(b);
    }
    return out.join("");
  });
}

// `<%= ActiveRecord::FixtureSet.identify(:label[, :type]) %>` and
// `<%= ActiveRecord::FixtureSet.composite_identify(:label, [:a, :b])[:key] %>`.
// Mirrors fixtures.rb#identify (CRC32 % MAX_ID) and #composite_identify
// (`(identify(label) << index) % MAX_ID`). BigInt avoids 32-bit overflow.
function expandIdentify(text: string): string {
  text = text.replace(
    /<%=\s*ActiveRecord::FixtureSet\.identify\(:(\w+)(?:,\s*:\w+)?\)\s*%>/g,
    (_, label) => String(fixtureIdValue(label)),
  );
  return text.replace(
    /<%=\s*ActiveRecord::FixtureSet\.composite_identify\(:(\w+),\s*\[([^\]]+)\]\)\[:(\w+)\]\s*%>/g,
    (_, label, keysSrc, accessor) => {
      const keys = (keysSrc as string).split(",").map((k) => k.trim().replace(/^:/, ""));
      const idx = keys.indexOf(accessor);
      if (idx < 0) return ERB_SKIP_SENTINEL;
      const shifted = (BigInt(fixtureIdValue(label)) << BigInt(idx)) % BigInt(FIXTURE_MAX_ID);
      return String(shifted);
    },
  );
}

export function stripErb(text: string): { rendered: string; unsupported: boolean } {
  let r = text.replace(/<%=\s*ActiveRecord::Base\.connection\.adapter_name\s*%>/g, "SQLite");
  r = expandLoops(r);
  r = expandIdentify(r);
  // Any remaining `<%= ... %>` output is opaque (`2.weeks.ago.to_fs(:db)`,
  // `binary(...)`, `Cpk::Order.primary_key` lookups) — sentinelize so YAML
  // parses and the per-attr diff can skip just that attribute.
  r = r.replace(/<%=[\s\S]*?%>/g, ERB_SKIP_SENTINEL);
  // Non-output `<%`/`<%#` tags (unhandled control flow) still mark whole file.
  return { rendered: r, unsupported: /<%[#]?[\s\S]*?%>/.test(r) };
}

// Exported under a `*ForTest` alias so the test suite can pin parsing
// fidelity (merge keys, `_fixture.ignore`, list-form auto-labels, `$LABEL`)
// without going through `main()`. Internal callers still use `loadRailsYaml`.
export { loadRailsYaml as loadRailsYamlForTest };
// prettier-ignore
function loadRailsYaml(file: string, basename: string): { ok: true; data: FixtureMap } | { ok: false; reason: Status } {
  const raw = readFileSync(file, "utf8");
  const { rendered, unsupported } = stripErb(raw);
  if (unsupported) return { ok: false, reason: "ERB-UNSUPPORTED" };
  let parsed: unknown;
  try {
    parsed = parseYaml(rendered, { merge: true });
  } catch {
    return { ok: false, reason: "YAML-PARSE-ERR" };
  }
  const out: FixtureMap = {};
  if (!parsed || typeof parsed !== "object") return { ok: true, data: out };
  // Three shapes Rails accepts:
  //   1) plain map: `label: { col: val }` → Object.entries.
  //   2) `!omap` (array of single-key maps; labels preserved in source order)
  //      — Rails opts in via the document tag `--- !omap`. Disambiguates from
  //      list-form: without the tag, a single-key array entry is a bare row,
  //      not a labeled entry (e.g. `- settings: { theme: dark }` is one row
  //      with column `settings`, not an entry labeled `settings`).
  //   3) list-form (array of bare maps, no label) → Rails auto-labels as
  //      `<basename>_<index>` via `Fixtures::ClassCache#auto_named_fixtures`.
  const isOmap = /^---\s*!omap\b/m.test(rendered);
  let entries: [string, unknown][];
  if (Array.isArray(parsed)) {
    const flat: [string, unknown][] = [];
    parsed.forEach((e, i) => {
      if (!e || typeof e !== "object") return;
      const ks = Object.keys(e);
      if (isOmap && ks.length === 1) flat.push(...(Object.entries(e) as [string, unknown][]));
      else flat.push([`${basename}_${i}`, e]);
    });
    entries = flat;
  } else entries = Object.entries(parsed as Record<string, unknown>);
  // `_fixture` is the only YAML metadata key Rails reserves at parse time
  // (carries `model_class` / `ignore` for `set_fixture_class`). Anchor labels
  // like `DEFAULTS` (`&NAME`) are *still real fixture rows* — Rails inserts
  // them unless they're explicitly listed in `_fixture.ignore` (e.g.
  // `_fixture: { ignore: DEAD_PARROT }` skips only the DEAD_PARROT anchor).
  // For array-shaped (`!omap`) documents `_fixture` shows up as an entry,
  // not a top-level key; pull from `entries` so omap fixtures honor `ignore`.
  const meta = entries.find(([k]) => k === "_fixture")?.[1]
    ?? (parsed as Record<string, unknown>)._fixture;
  const ignored = new Set<string>(["_fixture"]);
  if (meta && typeof meta === "object" && "ignore" in meta) {
    const ig = (meta as { ignore: unknown }).ignore;
    if (typeof ig === "string") ignored.add(ig);
    else if (Array.isArray(ig)) for (const n of ig) if (typeof n === "string") ignored.add(n);
  }
  for (const [k, v] of entries)
    if (v && typeof v === "object" && !Array.isArray(v) && !ignored.has(k))
      out[k] = v as Row;
  // Interpolate Rails' `$LABEL` token (the row name) on scalar string values.
  for (const [name, row] of Object.entries(out)) {
    for (const [col, val] of Object.entries(row)) {
      if (typeof val === "string" && val.includes("$LABEL")) row[col] = val.replace(/\$LABEL/g, name); // prettier-ignore
    }
  }
  return { ok: true, data: out };
}

export { buildIdIndex as buildIdIndexForTest };
function buildIdIndex(yamls: Map<string, FixtureMap>): Map<string, Map<number, string[]>> {
  const idx = new Map<string, Map<number, string[]>>();
  for (const [table, rows] of yamls) {
    const inner = new Map<number, string[]>();
    for (const [name, row] of Object.entries(rows)) {
      // Rails fixtures.rb assigns each row an effective id even when the YAML
      // omits an explicit `id:` — `ActiveRecord::FixtureSet.identify(label)`
      // (CRC32 % MAX_ID). Numeric FK references in *other* fixtures
      // (`<%= identify(:george) %>`) round-trip to that implicit id, so the
      // reverse lookup must include it. CRC32 fallback ONLY when `id` is
      // absent — an explicit non-numeric id (string PKs, CPK tables) means
      // the row genuinely doesn't live in the numeric-id space, so leaving
      // it unindexed is correct.
      const id =
        row.id === undefined ? fixtureIdValue(name) : typeof row.id === "number" ? row.id : null;
      if (id !== null) inner.set(id, [...(inner.get(id) ?? []), name]);
    }
    idx.set(table, inner);
  }
  return idx;
}

export function isRefLike(v: unknown): v is { tableName: string; fixtureName: string } {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o === "object" && typeof o.tableName === "string" && typeof o.fixtureName === "string"; // prettier-ignore
}

// `:foo` (Ruby symbol literal as YAML parses it: a string with a leading colon).
const SYMBOL_RE = /^:(\w+)$/;
// "YYYY-MM-DD" optionally followed by [T ]HH:MM:SS[.fff][TZ]. The YAML lib
// already produces JS `Date` for tagged !!timestamp scalars, but Rails
// often serializes datetimes as plain strings in fixtures (and AR's own
// fixture loader re-parses them at insert time) — normalize both sides to
// epoch ms before comparing so 2003-07-16T15:28:11+01:00 ≡ 2003-07-16 14:28:11.
const DATETIMEISH_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}:\d{2}(\.\d+)?([+\-]\d{2}:?\d{2}|Z)?)?$/i;
// Rails' YAML coder emits `--- <scalar>\n...\n` for `serialize :col` columns
// stored as YAML literals. The TS fixture carries the deserialized scalar.
const SERIALIZED_YAML_RE = /^---\s*([\s\S]*?)\n\.\.\.\n?$/;

function normalizeDatetime(v: unknown): number | null {
  if (v instanceof Date) return v.getTime();
  if (typeof v !== "string" || !DATETIMEISH_RE.test(v)) return null;
  // Normalize: T-separator and force UTC when no offset is present. Rails
  // fixtures without a TZ marker mean "UTC" (that's how AR's adapters
  // store timestamps); JS `Date` would otherwise treat them as local time
  // and the comparison would be host-dependent. Date-only scalars
  // (`YYYY-MM-DD`) get midnight-UTC so `Date.parse` doesn't choke on the
  // bare `YYYY-MM-DDZ` shape it considers invalid.
  // ISO 8601 mandates uppercase `T` and `Z`, but yaml-lib's !!timestamp
  // output uses lowercase. V8 accepts both today; spec'd JS engines and
  // stricter runtimes can return NaN. Normalize both separators here.
  let iso = v
    .replace(" ", "T")
    .replace(/(\d)t(\d)/, "$1T$2")
    .replace(/z$/, "Z");
  // Date-only check is strict (must be exactly `YYYY-MM-DD`) so lowercase
  // `t` separators from `yaml` lib's !!timestamp output aren't mistaken
  // for date-only and double-appended.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) iso += "T00:00:00";
  if (!/[zZ]|[+\-]\d{2}:?\d{2}$/.test(iso)) iso += "Z";
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function unwrapSerializedYaml(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const m = SERIALIZED_YAML_RE.exec(v);
  return m ? m[1] : v;
}

function resolveEnumSymbol(table: string, attr: string, symbol: string): number | null | undefined {
  const map = ENUM_MAPS[table]?.[attr];
  return map && Object.hasOwn(map, symbol) ? map[symbol] : undefined;
}

/** JSON.stringify with keys sorted at every nesting level — order-insensitive deep equality. */
function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_key, val: unknown) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0,
        ),
      );
    }
    return val;
  });
}

// prettier-ignore
export function compareValue(tsVal: unknown, railsVal: unknown, attr: string, idIndex: Map<string, Map<number, string[]>>, notes: string[], table: string = "", attrsSkipped?: { n: number }): boolean {
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
  // Array-typed columns (postgres `text[]`, etc.) appear as arrays on both
  // sides; compare structurally so identical contents don't flag.
  if (Array.isArray(tsVal) && Array.isArray(railsVal)
    && tsVal.length === railsVal.length && tsVal.every((v, i) => v === railsVal[i]))
    return true;
  // Plain-object columns (store/serialize hash values): Rails YAML carries a
  // nested hash; compare via a key-sorted JSON round-trip so symbol-keyed
  // hashes (e.g. `{":symbol": "symbol"}`) that are structurally identical
  // don't DIFF regardless of property insertion order.
  if (
    tsVal !== null && typeof tsVal === "object" && !Array.isArray(tsVal) &&
    railsVal !== null && typeof railsVal === "object" && !Array.isArray(railsVal) &&
    stableStringify(tsVal) === stableStringify(railsVal)
  ) return true;
  // Datetime tolerance: round to second-precision since Rails fixtures often
  // carry sub-second fractions the TS side trims when materializing values.
  const tsT = normalizeDatetime(tsVal);
  const railsT = normalizeDatetime(railsVal);
  if (tsT !== null && railsT !== null && Math.floor(tsT / 1000) === Math.floor(railsT / 1000))
    return true;
  // Mixed datetime ↔ time-of-day: TIME columns (e.g. `bonus_time`) carry just
  // `HH:MM:SS` in the TS fixture, but the YAML side often has a full datetime
  // because Rails synthesizes a date prefix. Compare hours/min/sec in UTC.
  const timeOnly = (v: unknown): [number, number, number] | null =>
    typeof v === "string" && /^\d{2}:\d{2}:\d{2}$/.test(v)
      ? (v.split(":").map(Number) as [number, number, number])
      : null;
  const tsTime = timeOnly(tsVal);
  const railsTime = timeOnly(railsVal);
  const utcHMS = (t: number): [number, number, number] => {
    const d = new Date(t);
    return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()];
  };
  const eqHMS = (a: [number, number, number], b: [number, number, number]): boolean =>
    a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  if (tsTime && railsT !== null && eqHMS(tsTime, utcHMS(railsT))) return true;
  if (railsTime && tsT !== null && eqHMS(railsTime, utcHMS(tsT))) return true;
  // `serialize :col` columns: Rails YAML wraps the value in `--- … \n…\n`;
  // peel that off before retrying equality.
  const railsUnwrapped = unwrapSerializedYaml(railsVal);
  if (railsUnwrapped !== railsVal && tsVal === railsUnwrapped) return true;
  // Enum: Rails `enum :status, [:proposed, …]` columns appear as either
  // `:foo` (Ruby symbol literal) or a bare string on the Rails side, integer
  // on the TS side. Resolution order:
  //   1. Registered ENUM_MAPS entry — exact symbol↔int lookup either way.
  //   2. Unambiguous `:foo` symbol form with no registry entry — soft-skip
  //      as `enum-unmapped` so unported enums don't gate the strict flip.
  //   3. Bare-string ↔ number — fall through to value-differs. Without the
  //      leading `:` we can't tell an unmapped enum from a real mismatch
  //      (e.g. `count: 5` vs `count: "five"`), and silent-passing would
  //      mask data drift.
  // A nil-mapped enum member (`forgotten: nil`) stores NULL — the TS fixture
  // carries `null`, the Rails side a symbol/string resolving to null.
  if (tsVal === null && typeof railsVal === "string") {
    const col = attr.split(".").pop() ?? attr;
    const sym = SYMBOL_RE.exec(railsVal)?.[1] ?? railsVal;
    if (/^\w+$/.test(sym) && resolveEnumSymbol(table, col, sym) === null) return true;
  }
  if (typeof tsVal === "number" && typeof railsVal === "string") {
    const col = attr.split(".").pop() ?? attr;
    const symMatch = SYMBOL_RE.exec(railsVal);
    const sym = symMatch ? symMatch[1] : railsVal;
    const mapped = /^\w+$/.test(sym) ? resolveEnumSymbol(table, col, sym) : undefined;
    if (mapped === tsVal) return true;
    if (symMatch && mapped === undefined) {
      notes.push(`enum-unmapped: ${attr}: ts=${tsVal} rails=${JSON.stringify(railsVal)} (add to ENUM_MAPS: ${table}.${col}.${sym} = ${tsVal})`); // prettier-ignore
      if (attrsSkipped) attrsSkipped.n++;
      return true;
    }
  }
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

/**
 * Rails fixture loader maps association names to FK columns: `pirate: blackbeard`
 * → `pirate_id`, `pirate: blackbeard (Pirate)` → `pirate_id` + `pirate_type` for
 * polymorphic. HABTM keys (`treasures: diamond, sapphire`) populate a join table,
 * not a column on the host row. The TS side encodes the materialized FK columns
 * directly. Rewrite the Rails row to canonical TS shape so the per-attr diff
 * doesn't drown in shorthand-vs-canonical noise.
 *
 * Without schema (`columns === null`, i.e. table not yet ported in TEST_SCHEMA)
 * we can't tell HABTM from a real column the TS side dropped, so we *preserve*
 * unknown Rails keys verbatim — the downstream per-attr pass surfaces them as
 * `missing-in-ts` drift instead of silently dropping them. Only when we have a
 * column list AND the `_id` form is missing do we drop the key as HABTM-like.
 */
// prettier-ignore
export function canonicalizeRailsRow(railsRow: Row, tsRow: Row, columns: Set<string> | null, table: string = ""): Row {
  const out: Row = {};
  const overrides: Readonly<Record<string, string>> = FK_OVERRIDES[table] ?? {};
  // Use Object.hasOwn for the schemaless tsRow probe so prototype keys
  // (`toString`, `constructor`, …) don't read as columns.
  const known = (k: string): boolean => (columns ? columns.has(k) : Object.hasOwn(tsRow, k));
  const hasIdForm = (k: string): boolean =>
    columns ? columns.has(`${k}_id`) : Object.hasOwn(tsRow, `${k}_id`);
  for (const [k, v] of Object.entries(railsRow)) {
    if (known(k)) { out[k] = v; continue; } // prettier-ignore
    // Rails' `replace_belongs_to_keys` also handles polymorphic shorthand —
    // `assoc: label (Type)` splits into `<col>` + `<assoc>_type`. Shared
    // between the convention path and FK_OVERRIDES so an override on a
    // polymorphic belongs_to doesn't drop the `_type` column.
    const assignAssoc = (assocKey: string, fkCol: string): void => {
      if (typeof v === "string") {
        const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(v);
        if (m) { out[fkCol] = m[1]; out[`${assocKey}_type`] = m[2]; }
        else out[fkCol] = v;
      } else out[fkCol] = v as Row[string];
    };
    // FK_OVERRIDES lets a fixture declare `assoc → column` when the shorthand
    // doesn't follow the `<assoc>_id` convention (e.g. `creator → captain_id`).
    const overrideCol = overrides[k];
    if (overrideCol && (columns ? columns.has(overrideCol) : Object.hasOwn(tsRow, overrideCol))) {
      assignAssoc(k, overrideCol);
      continue;
    }
    if (hasIdForm(k)) {
      assignAssoc(k, `${k}_id`);
      continue;
    }
    // With a schema: drop as HABTM / unknown association (won't be a column on
    // this table). Without a schema: keep verbatim so the downstream attr-diff
    // can surface "missing-in-ts: <k>" — silently dropping would mask drift.
    if (!columns) out[k] = v;
  }
  return out;
}

// prettier-ignore
export async function compareFile(yamlPath: string, yamlByTable: Map<string, FixtureMap>, idIndex: Map<string, Map<number, string[]>>, prelimFailure: Status | undefined, schema: Schema = TEST_SCHEMA): Promise<FileResult> {
  const snake = yamlPath.replace(/\.yml$/, "");
  // Derive the DB table name for schema/FK lookups from the fixture path.
  // Two conventions:
  //   1. Namespaced dirs:     "admin/accounts"     → "admin_accounts"  (Rails table_name for Admin::Account)
  //   2. Non-namespaced dirs: "reserved_words/distinct" → "distinct"   (Distinct.table_name = "distinct")
  // Try the slash→underscore form first; fall back to the bare basename when
  // the joined form isn't in the schema. Top-level files: joined === snake (no-op).
  const tableSnakeJoined = snake.replace(/\//g, "_");
  const tableSnakeBase = snake.includes("/") ? (snake.split("/").pop() ?? snake) : snake;
  const tableSnake = schema[tableSnakeJoined] ? tableSnakeJoined : tableSnakeBase;
  const tsFile = path.join(TS_DIR, `${kebab(snake)}.ts`);
  const tsBase = existsSync(tsFile) ? `${kebab(snake)}.ts` : null;
  const r: FileResult = { yamlPath, tsBase, status: "MATCH", rowsMatched: 0, rowsTotal: 0, attrsMatched: 0, attrsTotal: 0, attrsSkipped: 0, schemaPorted: false, schemaExtras: 0, notes: [] }; // prettier-ignore
  if (prelimFailure) {
    // For ERB-ALLOWED files the TS side is the source of truth, so confirm
    // the TS counterpart actually exists before silently promoting — if
    // mixins.ts is deleted we want MISSING to surface, not a clean pass.
    if (prelimFailure === "ERB-UNSUPPORTED" && ERB_ALLOW_LIST.has(snake)) {
      r.status = tsBase ? "ERB-ALLOWED" : "MISSING";
    } else r.status = prelimFailure;
    return r;
  }
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
  const sc = schemaCheck(tableSnake, tsRows, schema, r.notes);
  r.schemaPorted = sc.ported;
  r.schemaExtras = sc.extras;
  let anyDiff = sc.extras > 0;
  const tableShapeForCols = schema[tableSnake] ? tableShape(schema[tableSnake]) : null;
  const cols: Set<string> | null = tableShapeForCols
    ? new Set([
        ...Object.keys(tableShapeForCols.columns),
        ...(tableShapeForCols.hasImplicitId ? ["id"] : []),
      ])
    : null;
  for (const [rowName, railsRowRaw] of Object.entries(railsRows)) {
    const tsRow = tsRows[rowName];
    if (!tsRow || typeof tsRow !== "object") {
      r.notes.push(`row missing in TS: ${rowName}`);
      anyDiff = true;
      continue;
    }
    const railsRow = canonicalizeRailsRow(railsRowRaw, tsRow, cols, tableSnake);
    r.rowsMatched++;
    if ("id" in railsRow && (!("id" in tsRow) || tsRow.id !== railsRow.id)) {
      r.notes.push(`id-divergence: ${rowName} ts=${String(tsRow.id)} rails=${String(railsRow.id)}`);
      anyDiff = true;
    }
    const skipAttrs = SKIP_ATTRS[snake];
    for (const attr of new Set([...Object.keys(railsRow), ...Object.keys(tsRow)])) {
      // Intentionally-unmirrored columns (binary blobs) are soft skips, even
      // when the TS row drops them entirely — so the presence check below
      // doesn't flag them as missing-in-ts.
      if (skipAttrs?.has(attr)) { r.attrsSkipped++; continue; } // prettier-ignore
      r.attrsTotal++;
      if (!(attr in tsRow) || !(attr in railsRow)) {
        r.notes.push(`${attr in tsRow ? "extra" : "missing"}-in-ts: ${rowName}.${attr}`);
        anyDiff = true;
        continue;
      }
      // Sentinel skip only after presence check: a Rails-side sentinel must
      // still flag missing-in-ts when the TS row drops the attribute entirely.
      if (railsRow[attr] === ERB_SKIP_SENTINEL) { r.attrsSkipped++; r.attrsTotal--; continue; } // prettier-ignore
      if (attr === "id") { if (tsRow.id === railsRow.id) r.attrsMatched++; continue; } // prettier-ignore
      const skipCounter = { n: 0 };
      const ok = compareValue(tsRow[attr], railsRow[attr], `${rowName}.${attr}`, idIndex, r.notes, tableSnake, skipCounter); // prettier-ignore
      if (skipCounter.n > 0) { r.attrsSkipped += skipCounter.n; r.attrsTotal -= skipCounter.n; continue; } // prettier-ignore
      if (ok) r.attrsMatched++;
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
    r.yamlPath.padEnd(40) +
    (r.tsBase ?? "(missing)").padEnd(28) +
    `rows: ${r.rowsMatched}/${r.rowsTotal}`.padEnd(14) +
    `attrs: ${r.attrsMatched}/${r.attrsTotal}${r.attrsSkipped ? ` (+${r.attrsSkipped} skipped)` : ""}`.padEnd(
      30,
    ) +
    pct.padEnd(6) +
    sch.padEnd(20) +
    r.status
  );
}

/** Recursively collects `.yml` paths under `dir`, returning paths relative to `dir` (sorted). */
export function collectYamlPaths(dir: string, prefix: string = ""): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push(...collectYamlPaths(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith(".yml")) {
      result.push(rel);
    }
  }
  return result.sort();
}

async function main(): Promise<void> {
  const { pkg, filter, models, incomplete, ci } = parseArgs(process.argv.slice(2));
  if (pkg !== "activerecord") {
    console.error(`fixtures:compare: --package ${pkg} not supported yet`);
    process.exit(2);
  }

  const allYamls = collectYamlPaths(YML_DIR);
  const yamlFiles = filter ? allYamls.filter((f) => f.includes(filter)) : allYamls;

  // Parse every YAML so the id index is complete even when --filter narrows the per-file pass.
  // Keys are path-relative (e.g. "accounts" or "admin/accounts"); basenames are file-only for
  // list-form auto-labeling (Rails' auto_named_fixtures uses the last path component).
  const yamlByTable = new Map<string, FixtureMap>();
  const prelim = new Map<string, Status>();
  for (const f of allYamls) {
    const snake = f.replace(/\.yml$/, "");
    const basename = path.basename(f).replace(/\.yml$/, "");
    const loaded = loadRailsYaml(path.join(YML_DIR, f), basename);
    if (loaded.ok) yamlByTable.set(snake, loaded.data);
    else prelim.set(snake, loaded.reason);
  }
  // Build the id index keyed by DB table name, not path key.
  // Two conventions (see compareFile tableSnake derivation above):
  //   - Namespaced:     "admin/accounts"         → "admin_accounts"
  //   - Non-namespaced: "reserved_words/distinct" → also alias as "distinct"
  // Always add the joined form; also add the basename alias for subdir files
  // when it doesn't collide with an existing top-level key (e.g. "accounts"
  // is occupied by accounts.yml, so admin/accounts gets no "accounts" alias).
  const yamlByTableName = new Map<string, FixtureMap>();
  for (const [snake, rows] of yamlByTable) {
    yamlByTableName.set(snake.replace(/\//g, "_"), rows);
    if (snake.includes("/")) {
      const joined = snake.replace(/\//g, "_");
      const base = snake.split("/").pop()!;
      // Only alias by basename for non-namespaced grouping dirs whose joined
      // form is not a real schema table (e.g. "reserved_words/distinct" → "distinct").
      // Skip when the joined form IS in the schema (e.g. "admin/users" → "admin_users"
      // is a real namespaced table; adding a "users" alias would mislead ref() lookups).
      if (!TEST_SCHEMA[joined] && !yamlByTableName.has(base)) yamlByTableName.set(base, rows);
    }
  }
  const idIndex = buildIdIndex(yamlByTableName);

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
  const other =
    results.length -
    n("MATCH") -
    n("DIFF") -
    n("MISSING") -
    n("ERB-UNSUPPORTED") -
    n("ERB-ALLOWED");
  const evaluated = results.filter(schemaEvaluated);
  const ported = evaluated.filter((r) => r.schemaPorted).length;
  const withExtras = evaluated.filter((r) => r.schemaExtras > 0).length;
  console.log(`\n${results.length} files — match=${n("MATCH")} diff=${n("DIFF")} missing=${n("MISSING")} erb-unsupported=${n("ERB-UNSUPPORTED")} erb-allowed=${n("ERB-ALLOWED")} other=${other}`); // prettier-ignore
  console.log(
    `schema — ported=${ported}/${evaluated.length} extras-flagged=${withExtras} (skipped ${results.length - evaluated.length})`,
  );
  if (ci) {
    console.log(
      `(--ci baseline: match>=${CI_BASELINE.match} diff<=${CI_BASELINE.diff} missing=${CI_BASELINE.missing})`,
    );
  } else {
    console.log("(fixture MISSING/DIFF soft; runtime errors hard-fail)");
  }

  if (models) runModelsPass(filter, incomplete);

  // Fixture MISSING/DIFF are soft; YAML/TS load errors are script-runtime, hard-fail.
  const hard: readonly Status[] = ["YAML-PARSE-ERR", "TS-IMPORT-ERR", "TS-EXPORT-MISSING"];
  if (results.some((r) => hard.includes(r.status))) process.exit(1);

  if (ci) {
    const matchCount = n("MATCH");
    const diffCount = n("DIFF");
    const missingCount = n("MISSING");
    const failures: string[] = [];
    if (matchCount < CI_BASELINE.match)
      failures.push(`match regressed: ${matchCount} < baseline ${CI_BASELINE.match}`);
    if (diffCount > CI_BASELINE.diff)
      failures.push(`diff grew: ${diffCount} > baseline ${CI_BASELINE.diff}`);
    if (missingCount > CI_BASELINE.missing)
      failures.push(`missing grew: ${missingCount} > baseline ${CI_BASELINE.missing}`);
    if (failures.length > 0) {
      for (const f of failures) console.error(`fixtures:compare: ${f}`);
      process.exit(1);
    }
  }
}

// ---- Models pass ----

// Rails shorthand validation macros that map to named TS helpers rather than
// the generic this.validates(). Helpers are implemented in:
//   packages/activemodel/src/model.ts       — all *Of helpers + acceptance/confirmation/comparison
//   packages/activerecord/src/validations.ts — uniqueness (validatesUniqueness, no "Of")
//                                              + validatesAssociated
const VALIDATION_KIND_TO_TS: Record<string, string> = {
  validates_presence_of: "validatesPresenceOf",
  validates_absence_of: "validatesAbsenceOf",
  validates_length_of: "validatesLengthOf",
  validates_size_of: "validatesSizeOf",
  validates_numericality_of: "validatesNumericalityOf",
  validates_inclusion_of: "validatesInclusionOf",
  validates_exclusion_of: "validatesExclusionOf",
  validates_format_of: "validatesFormatOf",
  validates_acceptance_of: "validatesAcceptanceOf",
  validates_confirmation_of: "validatesConfirmationOf",
  validates_comparison_of: "validatesComparisonOf",
  validates_uniqueness_of: "validatesUniqueness", // exported as validatesUniqueness (no "Of")
  validates_associated: "validatesAssociated",
};

const MODELS_TS_DIR = path.join(ROOT, "packages/activerecord/src/test-helpers/models");
const RUBY_EXTRACTOR = path.join(HERE, "extract-ruby-models.rb");

export interface RubyAssoc {
  kind: string;
  name: string;
  options: Record<string, string>;
}
interface RubyValidation {
  kind: string;
  attributes: string[];
  options: Record<string, string>;
}
interface RubyScope {
  name: string;
}
interface RubyCallback {
  kind: string;
  target: string | null;
}
interface RubyAttr {
  name: string;
  type: string;
}
export interface RubyClass {
  name: string;
  parent: string | null;
  tableName: string | null;
  associations: RubyAssoc[];
  validations: RubyValidation[];
  scopes: RubyScope[];
  callbacks: RubyCallback[];
  attributes: RubyAttr[];
}
interface RubyFileEntry {
  file: string;
  classes: RubyClass[];
}

type ModelStatus = "MATCH" | "MISSING" | "DIFF";

interface ModelResult {
  rubyFile: string;
  tsFile: string | null;
  status: ModelStatus;
  assocMatched: number;
  assocTotal: number;
  valsMatched: number;
  valsTotal: number;
  scopesMatched: number;
  scopesTotal: number;
  notes: string[];
}

function loadRubyModelsManifest(): RubyFileEntry[] {
  const out = execFileSync("ruby", [RUBY_EXTRACTOR], { encoding: "utf8" });
  return JSON.parse(out) as RubyFileEntry[];
}

// Infer TS filename from Ruby file path. `test/models/post.rb` → `post.ts`;
// `test/models/admin/account.rb` → `admin/account.ts` (preserving subdir).
export function tsModelPath(rubyFile: string): string {
  const rel = rubyFile.replace(/^test\/models\//, "").replace(/\.rb$/, ".ts");
  return path.join(MODELS_TS_DIR, rel.replace(/_/g, "-"));
}

export function compareModelClass(
  ruby: RubyClass,
  tsContent: string,
  rubyFile: string,
  tsFile: string,
): ModelResult {
  const r: ModelResult = {
    rubyFile,
    tsFile,
    status: "MATCH",
    assocMatched: 0,
    assocTotal: ruby.associations.length,
    valsMatched: 0,
    valsTotal: ruby.validations.length,
    scopesMatched: 0,
    scopesTotal: ruby.scopes.length,
    notes: [],
  };
  // Check associations by (kind, name) set equality. Options diff deferred to later PRs.
  // Accept both the raw Ruby snake_case name and the camelCase equivalent used in TS.
  for (const a of ruby.associations) {
    const tsMacro = a.kind.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    const camelName = a.name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    const nameAlts = a.name === camelName ? a.name : `(?:${a.name}|${camelName})`;
    const pattern = new RegExp(`this\\.${tsMacro}\\s*\\(\\s*["']${nameAlts}["']`, "i");
    if (pattern.test(tsContent)) r.assocMatched++;
    else r.notes.push(`assoc-missing: ${a.kind} :${a.name}`);
  }
  for (const v of ruby.validations) {
    const attr = v.attributes[0];
    // Check both the named shorthand helper (if implemented) and the generic validates().
    const tsMethod = VALIDATION_KIND_TO_TS[v.kind] ?? "validates";
    const vpat = attr ? new RegExp(`this\\.${tsMethod}\\s*\\(\\s*["']${attr}["']`, "i") : null;
    const genericPat =
      attr && tsMethod !== "validates"
        ? new RegExp(`this\\.validates\\s*\\(\\s*["']${attr}["']`, "i")
        : null;
    if (vpat && (vpat.test(tsContent) || genericPat?.test(tsContent))) r.valsMatched++;
    else r.notes.push(`val-missing: ${v.kind} ${v.attributes.join(",")}`);
  }
  for (const s of ruby.scopes) {
    const sCamel = s.name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    const sAlts = s.name === sCamel ? s.name : `(?:${s.name}|${sCamel})`;
    const spat = new RegExp(`this\\.scope\\s*\\(\\s*["']${sAlts}["']`, "i");
    if (spat.test(tsContent)) r.scopesMatched++;
    else r.notes.push(`scope-missing: ${s.name}`);
  }
  const anyDiff =
    r.assocMatched < r.assocTotal || r.valsMatched < r.valsTotal || r.scopesMatched < r.scopesTotal;
  r.status = anyDiff ? "DIFF" : "MATCH";
  return r;
}

function formatModelLine(r: ModelResult): string {
  const ruby = path.basename(r.rubyFile).padEnd(36);
  const ts = (r.tsFile ? path.relative(MODELS_TS_DIR, r.tsFile) : "(missing)").padEnd(32);
  if (r.status === "MISSING") {
    return `${ruby}${ts}${r.status}`;
  }
  const pct =
    r.assocTotal + r.valsTotal + r.scopesTotal === 0
      ? "100%"
      : `${Math.round(((r.assocMatched + r.valsMatched + r.scopesMatched) / (r.assocTotal + r.valsTotal + r.scopesTotal)) * 100)}%`;
  return (
    ruby +
    ts +
    `assoc: ${r.assocMatched}/${r.assocTotal}  `.padEnd(14) +
    `vals: ${r.valsMatched}/${r.valsTotal}  `.padEnd(12) +
    `scopes: ${r.scopesMatched}/${r.scopesTotal}  `.padEnd(12) +
    pct.padEnd(6) +
    r.status
  );
}

function runModelsPass(filter: string | null, incomplete = false): void {
  console.log("\n=== models:compare ===");
  let manifest: RubyFileEntry[];
  try {
    manifest = loadRubyModelsManifest();
  } catch (e) {
    const err = e as Error & { stderr?: Buffer };
    const detail = err.stderr?.toString().trim() || err.message;
    console.error("models:compare: failed to run Ruby extractor:", detail);
    process.exit(1);
  }

  const entries = filter ? manifest.filter((e) => e.file.includes(filter)) : manifest;

  const results: ModelResult[] = [];
  for (const entry of entries) {
    const tsPath = tsModelPath(entry.file);
    const tsExists = existsSync(tsPath);
    const tsContent = tsExists ? readFileSync(tsPath, "utf8") : null;
    // One result per primary class (first AR::Base descendant or first class).
    const primaryClass =
      entry.classes.find((c) => c.parent === "ActiveRecord::Base") ?? entry.classes[0];
    if (!primaryClass) continue;

    if (!tsExists) {
      results.push({
        rubyFile: entry.file,
        tsFile: null,
        status: "MISSING",
        assocMatched: 0,
        assocTotal: primaryClass.associations.length,
        valsMatched: 0,
        valsTotal: primaryClass.validations.length,
        scopesMatched: 0,
        scopesTotal: primaryClass.scopes.length,
        notes: [],
      });
      continue;
    }

    const r = compareModelClass(primaryClass, tsContent!, entry.file, tsPath);
    results.push(r);
  }

  for (const r of results) {
    if (incomplete && r.status === "MATCH") continue;
    console.log(formatModelLine(r));
    if (process.env.FIXTURES_COMPARE_VERBOSE === "1") {
      for (const n of r.notes) console.log(`    ${n}`);
    }
  }

  const missing = results.filter((r) => r.status === "MISSING").length;
  const matched = results.filter((r) => r.status === "MATCH").length;
  const diff = results.filter((r) => r.status === "DIFF").length;
  console.log(`\n${results.length} files — match=${matched} diff=${diff} missing=${missing}`);
  if (missing > 0 || diff > 0) process.exit(1);
}

// Run as a script when invoked directly, but stay importable from tests.
// Resolve to an absolute path before comparing — `process.argv[1]` can be relative under some launchers.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
