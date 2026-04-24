/**
 * Pure generator for trails ActiveRecord model classes from an
 * introspected schema. No I/O — takes a list of `IntrospectedTable`
 * objects and returns a TS module string.
 *
 * Consumed by the `trails-models-dump` CLI (src/bin/trails-models-dump.ts)
 * which handles DB connections, argument parsing, and file output. Keeping
 * the generator separate means it's unit-testable against fabricated
 * input without spinning up a database.
 *
 * Output shape follows the idiomatic trails model declaration in
 * dx-tests/declare-patterns.test-d.ts:38-46 — static-block declarations
 * rather than post-class Associations.*.call() wiring.
 */

import type { ForeignKeyDefinition } from "./connection-adapters/abstract/schema-definitions.js";
import { classify, pluralize, singularize, tableize, underscore } from "@blazetrails/activesupport";

/**
 * One table worth of introspection data, sufficient for codegen.
 * Callers will assemble this by running introspectTables +
 * introspectPrimaryKey + introspectColumns + introspectForeignKeys
 * from schema-introspection.ts.
 */
export interface IntrospectedTable {
  name: string;
  /**
   * Primary-key column name(s) in PK-position order, or `null` / `[]`
   * when the table has no primary key (likely a view). Both no-PK forms
   * are skipped entirely by the generator. introspectPrimaryKey() in
   * schema-introspection.ts normalises adapter-level null to [], so the
   * documented pipeline feeds []; `null` remains accepted for callers
   * that distinguish null-vs-empty at a lower level.
   */
  primaryKey: string | string[] | null;
  foreignKeys: ForeignKeyDefinition[];
  /**
   * Reserved for future polymorphic + STI detection; currently unused by
   * this generator. Callers should still populate it when cheap so later
   * versions can infer `{ polymorphic: true }` and STI subclass hints.
   */
  columns: { name: string; type: string }[];
}

export interface GenerateModelsOptions {
  /**
   * Free-form provenance string included in the header comment
   * (e.g. "sqlite:blog.db"). Ignored when `noHeader` is true.
   */
  sourceHint?: string;
  /**
   * Stripped from table names before classify() so `blog_posts` with
   * `stripPrefix: "blog_"` yields `class Post`. `_tableName` on the
   * generated class still preserves the full original name.
   */
  stripPrefix?: string;
  stripSuffix?: string;
  /** Suppress the "GENERATED ..." header comment. */
  noHeader?: boolean;
  /** Injected for deterministic test snapshots. Defaults to `new Date()`. */
  now?: Date;
}

interface PendingAssoc {
  kind: "belongsTo" | "hasMany";
  name: string;
  opts: Record<string, string>;
}

interface PlannedClass {
  name: string;
  tableName: string;
  primaryKey: string | string[] | null;
  /** Collected pre-sort; finalised inline in generateModels() before emitting. */
  associations: PendingAssoc[];
  /** Comments (TODO / NOTE / WARNING) prepended at the top of the static block. */
  leadingComments: string[];
}

const BUILTIN_IGNORE = new Set(["schema_migrations", "ar_internal_metadata"]);

/**
 * Strip a PostgreSQL schema qualifier from a table identifier and drop
 * surrounding double quotes that PG adds when identifiers need quoting
 * (mixed case, reserved words, embedded spaces/dots).
 *
 * The PG adapter's FK introspection selects `t1.oid::regclass::text` /
 * `t2.oid::regclass::text`, which PostgreSQL renders as:
 *   - `table`                    — unqualified, bare (search_path hit)
 *   - `schema.table`             — qualified, bare
 *   - `schema."Mixed"`           — qualified, target needs quoting
 *   - `"other schema"."authors"` — qualified, schema needs quoting
 *   - `"a""b"."c"`               — embedded double quote ("" escape)
 *
 * `introspectTables()` returns unqualified, unquoted names, so the FK
 * target needs both the schema prefix stripped AND the surrounding
 * quotes removed — otherwise `classes.get(toTableUnqual)` silently
 * misses and the association drops. We walk the string tracking quote
 * state rather than using `lastIndexOf(".")`, which would misbehave on
 * quoted schema names containing a literal dot.
 *
 * SQLite and MySQL return unqualified unquoted names, so this is a
 * no-op for those adapters.
 */
export function unqualify(tableName: string): string {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < tableName.length; i++) {
    const ch = tableName[i]!;
    if (ch === '"') {
      current += ch;
      // "" inside a quoted identifier is an escaped double-quote —
      // stays inside the identifier, doesn't toggle state.
      if (inQuotes && tableName[i + 1] === '"') {
        current += tableName[i + 1]!;
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "." && !inQuotes) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return unquoteIdentifier(parts[parts.length - 1]!);
}

function unquoteIdentifier(id: string): string {
  if (id.length >= 2 && id[0] === '"' && id[id.length - 1] === '"') {
    return id.slice(1, -1).replaceAll('""', '"');
  }
  return id;
}

/**
 * Generate a TS module containing one `export class X extends Base { ... }`
 * per introspected table, with `belongsTo` / `hasMany` inferred from FKs.
 */
export function generateModels(
  tables: IntrospectedTable[],
  opts: GenerateModelsOptions = {},
): string {
  const { stripPrefix, stripSuffix, noHeader, sourceHint } = opts;
  const now = opts.now ?? new Date();

  // Filter: skip built-in bookkeeping tables and tables with no PK (views).
  // Accept both `null` and `[]` as the "no PK" signal — introspectPrimaryKey()
  // in schema-introspection.ts normalises adapter-level null to [], so the
  // documented pipeline (introspectTables + introspectPrimaryKey + ...) feeds
  // [] for PK-less tables. Handling both forms means callers don't have to
  // re-normalise before calling generateModels.
  const hasNoPk = (pk: string | string[] | null): boolean =>
    pk === null || (Array.isArray(pk) && pk.length === 0);
  const skipped: Array<{ name: string; reason: string }> = [];
  const kept: IntrospectedTable[] = [];
  for (const t of tables) {
    if (BUILTIN_IGNORE.has(t.name)) continue;
    if (hasNoPk(t.primaryKey)) {
      skipped.push({ name: t.name, reason: "no primary key (likely a view)" });
      continue;
    }
    kept.push(t);
  }

  // Sort alphabetically for stable diffs.
  kept.sort((a, b) => a.name.localeCompare(b.name));

  // Build the class plan for each kept table. FKs from OTHER tables still
  // need to contribute hasMany() to THIS class, so we collect them in a
  // second pass after resolving names.
  const strip = (name: string): string => {
    let n = name;
    if (stripPrefix && n.startsWith(stripPrefix)) n = n.slice(stripPrefix.length);
    if (stripSuffix && n.endsWith(stripSuffix)) n = n.slice(0, -stripSuffix.length);
    return n;
  };

  const classNameForTable = (tableName: string): string => classify(strip(tableName));
  const classes = new Map<string, PlannedClass>();
  // Track collisions so we fail fast rather than emit two `export class X`
  // declarations (invalid TS). Two tables strip/classify to the same name
  // most commonly when --strip-prefix uncovers a second copy of an existing
  // table (e.g. `posts` + `blog_posts` both → `Post`).
  const nameToTable = new Map<string, string>();
  for (const t of kept) {
    const className = classNameForTable(t.name);
    const existing = nameToTable.get(className);
    if (existing !== undefined) {
      // Thrown as a plain Error with a library-neutral message (no
      // "model-codegen:" or similar prefix). The CLI wrapper
      // (trails-models-dump) prefixes the thrown message with
      // "trails-models-dump:" at its top-level catch; surfacing the
      // library's own prefix here would cause double-prefixing.
      const [a, b] = [existing, t.name].sort();
      throw new Error(
        `class name collision: tables "${a}" and "${b}" both classify to \`${className}\`.`,
      );
    }
    nameToTable.set(className, t.name);
    classes.set(t.name, {
      name: className,
      tableName: t.name,
      primaryKey: t.primaryKey,
      associations: [],
      leadingComments: [],
    });
  }

  // Build belongs_to on the "from" side and collect has_many additions
  // for the "to" side. We iterate deterministically (sorted by fromTable,
  // then column) so output ordering is stable.
  interface PendingHasMany {
    toTable: string;
    name: string;
    opts: Record<string, string>;
  }
  const hasManyByTable = new Map<string, PendingHasMany[]>();

  for (const t of kept) {
    const fromCls = classes.get(t.name);
    if (!fromCls) continue;
    // Sort FKs by column here only so TODO-comment ordering is stable for
    // composite FKs (which share a class and share no belongsTo name).
    // belongsTo output order is re-sorted by association name below.
    const fks = [...t.foreignKeys].sort((a, b) => a.column.localeCompare(b.column));
    for (const fk of fks) {
      // Normalise PG-qualified table names (e.g. "other_schema.authors" →
      // "authors") before class lookup and name derivation. classes Map is
      // keyed by the unqualified names returned from introspectTables().
      const toTableUnqual = unqualify(fk.toTable);
      // Composite FK: emit TODO comment, no association.
      if (fk.column.includes(",")) {
        fromCls.leadingComments.push(
          `// TODO composite FK ${fk.name}: ${fk.column} -> ${fk.toTable}.${fk.primaryKey}`,
        );
        continue;
      }
      // If the target table was filtered out, skip — no class to point at.
      const toCls = classes.get(toTableUnqual);
      if (!toCls) continue;

      // belongsTo name: strip _id if present, otherwise fall back to the
      // underscored singular of the target table name — matching Rails'
      // convention so callers of Model.some_fk see the right association.
      // stripPrefix/stripSuffix deliberately do NOT apply here — they
      // reshape class names (the TS identifier) but association names
      // follow Rails convention off the real table. A FK to blog_posts
      // via a non-convention column should still emit belongsTo("blog_post"),
      // never belongsTo("post").
      const belongsToBase =
        fk.column.endsWith("_id") && fk.column !== "_id"
          ? fk.column.slice(0, -3)
          : underscore(singularize(toTableUnqual));

      // Disambiguate when two non-_id FKs from the same source table
      // would derive the same belongsTo name (e.g. books.written_by +
      // books.edited_by → authors both fall back to belongsTo("author")).
      // First wins the conventional name; subsequent ones use the FK
      // column directly as the association name, which is always unique
      // per-class since it's the column name. className + foreignKey
      // options auto-emit below because the column-derived name won't
      // match Rails' convention for the target class.
      let belongsToName = belongsToBase;
      if (fromCls.associations.some((a) => a.kind === "belongsTo" && a.name === belongsToName)) {
        belongsToName = underscore(fk.column);
        let suffix = 2;
        while (
          fromCls.associations.some((a) => a.kind === "belongsTo" && a.name === belongsToName)
        ) {
          belongsToName = `${underscore(fk.column)}_${suffix}`;
          suffix += 1;
        }
      }

      // Rails convention for belongsTo(name) infers:
      //   foreignKey = "${name}_id"
      //   className  = classify(name)
      // Emit those options only when the actual FK column / target class
      // differs from what Rails would pick by default given `belongsToName`.
      const expectedForeignKey = `${underscore(belongsToName)}_id`;
      const conventionalClassName = classify(belongsToName);
      const belongsToOpts: Record<string, string> = {};
      if (fk.column !== expectedForeignKey) belongsToOpts.foreignKey = fk.column;
      if (toCls.name !== conventionalClassName) belongsToOpts.className = toCls.name;

      fromCls.associations.push({ kind: "belongsTo", name: belongsToName, opts: belongsToOpts });

      // hasMany on the target side. Derive the association name from the
      // already-singular source class name, then pluralise — pluralising
      // the table name directly would mangle irregular already-plural
      // tables (e.g. `children` → `childrens`, `people` → `peoples`).
      const hasManyBaseName = pluralize(underscore(fromCls.name));

      // Disambiguate when multiple FKs from the same source table point at
      // the same target (posts.author_id + posts.editor_id → users). Without
      // this, both would emit `this.hasMany("posts")` on User — duplicate
      // declarations, second one silently wins. Role is derived from the
      // belongsTo name (column minus `_id`), giving natural inverse names
      // like "authored_posts" / "edited_posts" with className + foreignKey
      // options auto-emitted below since the disambiguated name won't
      // match Rails' convention for the target class.
      const existingHms = hasManyByTable.get(toTableUnqual) ?? [];
      let hasManyName = hasManyBaseName;
      if (existingHms.some((h) => h.name === hasManyName)) {
        const rolePrefix = `${underscore(belongsToName)}_`;
        hasManyName = `${rolePrefix}${hasManyBaseName}`;
        let suffix = 2;
        while (existingHms.some((h) => h.name === hasManyName)) {
          hasManyName = `${rolePrefix}${hasManyBaseName}_${suffix}`;
          suffix += 1;
        }
      }

      // Rails convention for hasMany(name) infers:
      //   foreignKey = "${underscore(current_class_name)}_id"
      //   className  = classify(singularize(name))
      // Note: the foreign-key default does NOT singularize the class name
      // (class names are already singular). Singularizing would mangle
      // class names ending in "s" like "Canvas" → "Canva".
      const hmConventionalClassName = classify(singularize(hasManyName));
      const hmConventionalForeignKey = `${underscore(toCls.name)}_id`;
      const hmOpts: Record<string, string> = {};
      if (fk.column !== hmConventionalForeignKey) hmOpts.foreignKey = fk.column;
      if (fromCls.name !== hmConventionalClassName) hmOpts.className = fromCls.name;

      existingHms.push({ toTable: toTableUnqual, name: hasManyName, opts: hmOpts });
      hasManyByTable.set(toTableUnqual, existingHms);
    }
  }

  // Fold hasMany additions into each class. Ordering is finalised at
  // serialize time (belongsTo group first, sorted by name; then hasMany
  // group, sorted by name) so belongsTo entries from non-conventional FK
  // columns still sort alphabetically by association name, not by the
  // underlying column.
  for (const [tableName, hms] of hasManyByTable) {
    const cls = classes.get(tableName);
    if (!cls) continue;
    for (const hm of hms) {
      cls.associations.push({ kind: "hasMany", name: hm.name, opts: hm.opts });
    }
  }

  // Emit.
  const out: string[] = [];

  if (!noHeader) {
    const fromClause = sourceHint ? ` from ${sourceHint}` : "";
    out.push(
      `// GENERATED by trails-models-dump${fromClause} on ${now.toISOString()}.`,
      "// Do not edit by hand — re-run trails-models-dump to regenerate.",
    );
    const total = kept.length;
    const fkCount = kept.reduce((n, t) => n + t.foreignKeys.length, 0);
    const assocCount =
      2 *
      kept.reduce(
        (n, t) =>
          n +
          t.foreignKeys.filter(
            (fk) => !fk.column.includes(",") && classes.has(unqualify(fk.toTable)),
          ).length,
        0,
      );
    out.push(`//`);
    out.push(
      `// ${total} model${total === 1 ? "" : "s"}, ${assocCount} association${assocCount === 1 ? "" : "s"} from ${fkCount} foreign key${fkCount === 1 ? "" : "s"}.`,
    );
    for (const s of skipped) {
      out.push(`// SKIPPED ${s.name}: ${s.reason}`);
    }
    out.push("");
  }

  out.push(`import { Base } from "@blazetrails/activerecord";`, "");

  const emittedClasses = [...classes.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (let i = 0; i < emittedClasses.length; i++) {
    const cls = emittedClasses[i]!;
    out.push(`export class ${cls.name} extends Base {`);
    const staticLines: string[] = [];

    // Explicit _tableName when tableize round-trip doesn't recover the original.
    if (tableize(cls.name) !== cls.tableName) {
      staticLines.push(`    this._tableName = ${JSON.stringify(cls.tableName)};`);
    }
    // Explicit _primaryKey when non-default.
    if (Array.isArray(cls.primaryKey) && cls.primaryKey.length > 1) {
      staticLines.push(`    this._primaryKey = ${JSON.stringify(cls.primaryKey)};`);
    } else if (typeof cls.primaryKey === "string" && cls.primaryKey !== "id") {
      staticLines.push(`    this._primaryKey = ${JSON.stringify(cls.primaryKey)};`);
    } else if (
      Array.isArray(cls.primaryKey) &&
      cls.primaryKey.length === 1 &&
      cls.primaryKey[0] !== "id"
    ) {
      staticLines.push(`    this._primaryKey = ${JSON.stringify(cls.primaryKey[0])};`);
    }

    for (const c of cls.leadingComments) {
      staticLines.push(`    ${c}`);
    }
    // Sort belongsTo first then hasMany, alphabetical by association name
    // within each group. Matches the PR description's stated contract and
    // keeps diffs stable across regenerations even when FK columns are
    // non-conventional (which would otherwise drive column-based ordering).
    const belongsTo = cls.associations
      .filter((a) => a.kind === "belongsTo")
      .sort((a, b) => a.name.localeCompare(b.name));
    const hasMany = cls.associations
      .filter((a) => a.kind === "hasMany")
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const a of [...belongsTo, ...hasMany]) {
      staticLines.push(`    ${formatAssoc(a.kind, a.name, a.opts)}`);
    }

    if (staticLines.length === 0) {
      out.push(`  static {}`);
    } else {
      out.push("  static {");
      out.push(...staticLines);
      out.push("  }");
    }
    out.push(`}`);
    if (i < emittedClasses.length - 1) out.push("");
  }

  return out.join("\n") + "\n";
}

function formatAssoc(
  kind: "belongsTo" | "hasMany",
  name: string,
  opts: Record<string, string>,
): string {
  const optKeys = Object.keys(opts).sort();
  if (optKeys.length === 0) return `this.${kind}(${JSON.stringify(name)});`;
  const optStr = optKeys.map((k) => `${k}: ${JSON.stringify(opts[k])}`).join(", ");
  return `this.${kind}(${JSON.stringify(name)}, { ${optStr} });`;
}
