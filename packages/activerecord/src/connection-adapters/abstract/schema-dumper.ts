/**
 * Connection-adapters-layer SchemaDumper column-spec helpers. Mirrors Rails'
 * `ActiveRecord::ConnectionAdapters::SchemaDumper < SchemaDumper`
 * (connection_adapters/abstract/schema_dumper.rb) — the adapter subclass of the
 * base dumper that adds the column-spec helpers driving `schema_type`,
 * `schema_limit`, `schema_default`, etc.
 *
 * Rails mixes these into the dumper via subclassing; the base `SchemaDumper#table`
 * calls the unqualified (private) `column_spec` that only the adapter subclass
 * defines. TypeScript can't statically `extends` the base from here without an
 * ESM temporal-dead-zone cycle (base ↔ subclass), so instead of a subclass we
 * ship these as `this`-typed functions ("Module mixins" in CLAUDE.md). The base
 * class (`../../schema-dumper.ts`) assigns them onto its own prototype via thin
 * `protected` wrappers, so there is a single dumper class with no cyclic
 * `extends` — a bare-base construction needs no other module to have loaded the
 * adapter layer. Keeping the bodies here preserves the api:compare file mapping
 * (`column_spec`/`schema_default`/`schema_expression` live in this file).
 *
 * `SchemaDumper` is re-exported from the base module so existing deep imports
 * (`connection-adapters/abstract/schema-dumper.js`) and the public `index.ts`
 * export keep resolving to the single class.
 */

import type { ColumnInfo, IndexInfo } from "../../schema-dumper.js";
export { SchemaDumper } from "../../schema-dumper.js";

/**
 * Mirrors the abstract subclass's `DEFAULT_DATETIME_PRECISION = 6` (Rails
 * redeclares the constant on `ConnectionAdapters::SchemaDumper`). Kept local so
 * `schemaPrecision` doesn't reach back into the base class value at module eval.
 */
export const DEFAULT_DATETIME_PRECISION = 6;

/**
 * Column-shaped interface these helpers depend on.
 *
 * @noRailsEquivalent CONVERGEABLE (story:
 * converge-abstract-schema-dumper-column-onto-column-class). Rails' dumper
 * reads real `ConnectionAdapters::Column` objects, which trails ports as a
 * class in `connection-adapters/column.ts`; this weaker shape exists because
 * schema reflection hands the dumper plain records instead.
 */
export interface Column extends ColumnInfo {
  bigint?: boolean;
  virtual?: boolean;
  hasDefault?: boolean;
  defaultFunction?: string | null;
  comment?: string | null;
  /** Raw SQL type string (e.g. "integer", "varchar(255)") — present on all schema-reflected columns. */
  sqlType?: string | null;
}

/**
 * Public view of the dumper members these `this`-typed helpers reach. The base
 * `SchemaDumper` declares most of these `protected`; a free function can't touch
 * protected members through `this`, so the base wraps each helper and passes
 * `this` cast to this host interface. Dialect subclass overrides of the mixin
 * methods (schemaType, schemaLimit, …) still dispatch dynamically through `this`.
 * @internal
 */
export interface SchemaDumperMixinHost {
  readonly tableName: string | undefined;
  _adapter(): any;
  resolvePrimaryKeyColumns(tableName: string, columns: ColumnInfo[]): ColumnInfo[];
  removePrefixAndSuffix(table: string): string;
  formatColspec(colspec: Record<string, unknown>): string;
  indexesInCreate(tableName: string, lines: string[], indexes?: IndexInfo[]): void;
  _isDslHelper(dslType: string): boolean;
  validType(type: string | null | undefined): boolean;
  emitTableBody(
    lines: string[],
    tableName: string,
    columns: ColumnInfo[],
    indexes: IndexInfo[],
    adapterTableOpts?: Record<string, unknown>,
    inlineConstraints?: string[],
  ): void;
  /** @internal */
  columnSpec(column: Column): [string, Record<string, unknown>];
  /** @internal */
  columnSpecForPrimaryKey(column: Column): Record<string, unknown>;
  /** @internal */
  prepareColumnOptions(column: Column): Record<string, unknown>;
  /** @internal */
  isDefaultPrimaryKey(column: Column): boolean;
  /** @internal */
  isExplicitPrimaryKeyDefault(column: Column): boolean;
  /** @internal */
  schemaTypeWithVirtual(column: Column): string;
  /** @internal */
  schemaType(column: Column): string;
  isBigint(column: Column): boolean;
  /** @internal */
  schemaLimit(column: Column): string | undefined;
  /** @internal */
  schemaPrecision(column: Column): string | undefined;
  /** @internal */
  schemaScale(column: Column): string | undefined;
  /** @internal */
  schemaDefault(column: Column): string | undefined;
  /** @internal */
  schemaExpression(column: Column): string | undefined;
  /** @internal */
  schemaCollation(column: Column): string | undefined;
}

/** @internal */
export function columnSpec(
  this: SchemaDumperMixinHost,
  column: Column,
): [string, Record<string, unknown>] {
  return [this.schemaTypeWithVirtual(column), this.prepareColumnOptions(column)];
}

/** @internal */
export function columnSpecForPrimaryKey(
  this: SchemaDumperMixinHost,
  column: Column,
): Record<string, unknown> {
  const spec: Record<string, unknown> = {};
  if (!this.isDefaultPrimaryKey(column)) {
    // Pre-format the id value as a TS-DSL string literal for formatColspec.
    spec["id"] = JSON.stringify(this.schemaType(column));
  }
  const colOpts = this.prepareColumnOptions(column);
  delete colOpts["null"];
  Object.assign(spec, colOpts);
  if (this.isExplicitPrimaryKeyDefault(column)) {
    // "null" (not Ruby "nil") — emitted verbatim by formatColspec as `default: null`.
    spec["default"] ??= "null";
  }
  return spec;
}

/** @internal */
export function prepareColumnOptions(
  this: SchemaDumperMixinHost,
  column: Column,
): Record<string, unknown> {
  const spec: Record<string, unknown> = {};
  const limit = this.schemaLimit(column);
  if (limit !== undefined) spec["limit"] = limit;
  const precision = this.schemaPrecision(column);
  if (precision !== undefined) spec["precision"] = precision;
  const scale = this.schemaScale(column);
  if (scale !== undefined) spec["scale"] = scale;
  const def = this.schemaDefault(column);
  if (def !== undefined) spec["default"] = def;
  if (column.null === false) spec["null"] = "false";
  const collation = this.schemaCollation(column);
  if (collation !== undefined) spec["collation"] = collation;
  if (column.comment) spec["comment"] = JSON.stringify(column.comment);
  return spec;
}

/** @internal */
export function isDefaultPrimaryKey(this: SchemaDumperMixinHost, column: Column): boolean {
  return this.schemaType(column) === "bigint";
}

/** @internal */
export function isExplicitPrimaryKeyDefault(this: SchemaDumperMixinHost, _column: Column): boolean {
  return false;
}

/** @internal */
export function schemaTypeWithVirtual(this: SchemaDumperMixinHost, column: Column): string {
  if (column.virtual) return "virtual";
  return this.schemaType(column);
}

/** @internal */
export function schemaType(this: SchemaDumperMixinHost, column: Column): string {
  if (this.isBigint(column)) return "bigint";
  // `column.type` is non-null here: `emitTable` runs `validType?` over every
  // column first and raises on a nil type, so a null never reaches schemaType.
  return column.type ?? "";
}

/**
 * Mirrors `ConnectionAdapters::Column#bigint?` (`/\Abigint\b/.match?(sql_type)`),
 * which the abstract `schema_type` consults. A live column reflects a `bigint`
 * declaration as sqlType `"bigint"`/`"BIGINT"` with dsl type `"integer"`, so
 * detect it off sqlType; the `bigint` flag / `type === "bigint"` arms keep mock
 * sources that set them directly working.
 * @internal
 */
export function isBigint(this: SchemaDumperMixinHost, column: Column): boolean {
  return !!column.bigint || column.type === "bigint" || /^bigint\b/i.test(column.sqlType ?? "");
}

/** @internal */
export function schemaLimit(this: SchemaDumperMixinHost, column: Column): string | undefined {
  // Mirrors Rails `schema_limit`: `limit = column.limit unless column.bigint?` — same
  // predicate `schema_type` uses, so a column whose bigint-ness is only visible through
  // sqlType is limit-suppressed too.
  if (this.isBigint(column)) return undefined;
  // Rails suppresses the serial/bigserial limit because it matches the native
  // database type's default (int4 limit = 4, int8 limit = 8). We don't have
  // the native_database_types comparison available here, so we guard explicitly
  // on isSerial — functionally equivalent to the Rails approach.
  if (column.isSerial) return undefined;
  const limit = column.limit;
  if (limit == null) return undefined;
  return String(limit);
}

/** @internal */
export function schemaPrecision(this: SchemaDumperMixinHost, column: Column): string | undefined {
  if (column.type === "datetime") {
    // TS-DSL literal `null` (Rails dumps the Ruby `nil`); the value is emitted
    // verbatim by formatColspec, so it must already read as valid TS.
    if (column.precision == null) return "null";
    if (column.precision === DEFAULT_DATETIME_PRECISION) return undefined;
    return String(column.precision);
  }
  if (column.precision != null) return String(column.precision);
  return undefined;
}

/** @internal */
export function schemaScale(this: SchemaDumperMixinHost, column: Column): string | undefined {
  if (column.scale != null) return String(column.scale);
  return undefined;
}

// Rails `schema_default` / `schema_expression` live in
// `connection_adapters/abstract/schema_dumper.rb`, so the ports stay in this
// file (the api:compare-mapped location) — the sole definitions, consumed by
// the single `emitTable`/`columnSpec` dispatch. `_adapter` is a trails-only
// helper on the base (it reaches base-private `_source`).

/** @internal */
export function schemaDefault(this: SchemaDumperMixinHost, column: Column): string | undefined {
  if (!column.hasDefault && column.default === undefined) return undefined;
  if (column.default == null) return this.schemaExpression(column);
  const adapter = this._adapter();
  if (adapter?.lookupCastTypeFromColumn) {
    const type = adapter.lookupCastTypeFromColumn(column);
    if (type != null && typeof type.deserialize === "function") {
      const deserialized = type.deserialize(column.default);
      if (deserialized == null) {
        // column.default is already non-null (the `== null` guard above
        // returned early). It may be a pre-deserialized JS value (e.g. []
        // for a PG OID::Array column) that the scalar element type cannot
        // deserialize. Apply typeCastForSchema directly on the original.
        return type.typeCastForSchema(column.default);
      }
      return type.typeCastForSchema(deserialized);
    }
  }
  if (typeof column.default === "string") return JSON.stringify(column.default);
  return String(column.default);
}

/** @internal */
export function schemaExpression(this: SchemaDumperMixinHost, column: Column): string | undefined {
  // TS-DSL arrow form (Rails dumps the Ruby lambda `-> { … }`); emitted verbatim
  // by formatColspec and consumed by the DSL as `default: () => "fn()"`.
  if (column.defaultFunction) return `() => ${JSON.stringify(column.defaultFunction)}`;
  return undefined;
}

/** @internal */
export function schemaCollation(this: SchemaDumperMixinHost, column: Column): string | undefined {
  if (column.collation) return JSON.stringify(column.collation);
  return undefined;
}

/**
 * Mirrors `abstract_adapter.rb:262` `valid_type?` — `!native_database_types[type]`.
 * Delegates to the backing adapter's `isValidType`; raw/mock sources without an
 * adapter can't validate a type map, so they accept (the pre-raise behavior).
 * @internal
 */
export function validType(this: SchemaDumperMixinHost, type: string | null | undefined): boolean {
  const adapter = this._adapter();
  if (adapter && typeof adapter.isValidType === "function") {
    return adapter.isValidType(type);
  }
  return true;
}

/**
 * The single `emitTable`, routed through `columnSpec` so per-dialect
 * `prepareColumnOptions` overrides (schemaType, schemaLimit, schemaPrecision,
 * schemaDefault, etc.) take effect. Mirrors the column-emission half of Rails'
 * `SchemaDumper#table`, whose `@connection.column_spec` is the adapter's
 * mixed-in method. Every dump reaches it — the single dumper class assigns this
 * onto its prototype, including the in-memory MigrationContext and mock-source
 * paths.
 *
 * Builds into a local buffer so a raise mid-table discards the partial
 * `create_table` body (Rails writes into its own `tbl` StringIO and only prints
 * it on success — schema_dumper.rb:220-224). On any error we emit the "Could
 * not dump table" comment instead of the table.
 * @internal
 */
export function emitTable(
  this: SchemaDumperMixinHost,
  lines: string[],
  tableName: string,
  columns: ColumnInfo[],
  indexes: IndexInfo[],
  adapterTableOpts: Record<string, unknown> = {},
  inlineConstraints: string[] = [],
): void {
  const body: string[] = [];
  try {
    // Rails validates every column's type before emitting the body
    // (schema_dumper.rb:196), raising on an unmapped/composite type whose
    // DSL type is nil so `valid_type?` is false. This includes the PK column.
    for (const col of columns) {
      if (!this.validType(col.type)) {
        const err = new Error(`Unknown type '${col.sqlType ?? ""}' for column '${col.name}'`);
        // Rails raises a StandardError; surface that class in the comment.
        err.name = "StandardError";
        throw err;
      }
    }
    this.emitTableBody(body, tableName, columns, indexes, adapterTableOpts, inlineConstraints);
  } catch (e) {
    const cls = e instanceof Error ? e.name : "StandardError";
    const message = e instanceof Error ? e.message : String(e);
    lines.push(`# Could not dump table ${JSON.stringify(tableName)} because of following ${cls}`);
    lines.push(`#   ${message}`);
    return;
  }
  for (const line of body) lines.push(line);
}

/** @internal */
export function emitTableBody(
  this: SchemaDumperMixinHost,
  lines: string[],
  tableName: string,
  columns: ColumnInfo[],
  indexes: IndexInfo[],
  adapterTableOpts: Record<string, unknown> = {},
  inlineConstraints: string[] = [],
): void {
  const pkColumns = this.resolvePrimaryKeyColumns(tableName, columns);
  const hasCompositePk = pkColumns.length > 1;
  const pkColumn = pkColumns[0];
  // The single-PK column name Rails skips in the column loop (`next if column.name == pk`).
  // Composite PKs (Rails Array case) and PK-less tables never skip a column.
  const singlePkName = !hasCompositePk && pkColumn ? pkColumn.name : undefined;
  const stripped = this.removePrefixAndSuffix(tableName);

  // All values in tableOpts are pre-formatted TS-DSL text for formatColspec.
  const tableOpts: Record<string, unknown> = {};
  if (hasCompositePk) {
    // Rails (Array case) emits only `primary_key: [...]`; the TS DSL also needs
    // `id: false` so createTable doesn't auto-add an `id` column on round-trip.
    tableOpts["primaryKey"] = JSON.stringify(pkColumns.map((c) => c.name));
    tableOpts["id"] = "false";
  } else if (!pkColumn) {
    tableOpts["id"] = "false";
  } else {
    // Rails (String case): print `primary_key: <name>` for a non-"id" key, then the
    // column spec unless empty. Mirrors schema_dumper.rb:170-179.
    if (pkColumn.name !== "id") tableOpts["primaryKey"] = JSON.stringify(pkColumn.name);
    // columnSpecForPrimaryKey returns a FLAT spec (dialect overrides post-process it,
    // e.g. MySQL deletes auto_increment); wrap into `id: { ... }` here at the call site,
    // after those overrides, so the PK's own `comment:` doesn't collide with the
    // table-level `comment:`.
    const pkSpec = this.columnSpecForPrimaryKey(pkColumn);
    if (Object.keys(pkSpec).length > 0) {
      if (Object.keys(pkSpec).every((k) => k === "id" || k === "default")) {
        Object.assign(tableOpts, pkSpec);
      } else {
        const { id: idType, ...rest } = pkSpec as { id?: unknown } & Record<string, unknown>;
        tableOpts["id"] = { ...(idType != null ? { type: idType } : {}), ...rest };
      }
    }
  }
  if (typeof adapterTableOpts.charset === "string")
    tableOpts["charset"] = JSON.stringify(adapterTableOpts.charset);
  if (typeof adapterTableOpts.collation === "string")
    tableOpts["collation"] = JSON.stringify(adapterTableOpts.collation);
  if (typeof adapterTableOpts.options === "string")
    tableOpts["options"] = JSON.stringify(adapterTableOpts.options);
  if (typeof adapterTableOpts.comment === "string" && adapterTableOpts.comment.trim().length > 0)
    tableOpts["comment"] = JSON.stringify(adapterTableOpts.comment);
  tableOpts["force"] = '"cascade"';

  lines.push(
    `  await ctx.createTable(${JSON.stringify(stripped)}, { ${this.formatColspec(tableOpts)} }, (t) => {`,
  );

  for (const col of columns) {
    if (col.name === singlePkName) continue;

    const [dslType, spec] = this.columnSpec(col);
    const optStr = Object.keys(spec).length > 0 ? `, { ${this.formatColspec(spec)} }` : "";
    const typeName = String(dslType);

    if (this._isDslHelper(typeName)) {
      lines.push(`    t.${typeName}(${JSON.stringify(col.name)}${optStr});`);
    } else if ((col as any).isEnum && typeName === "enum") {
      lines.push(`    t.enum(${JSON.stringify(col.name)}${optStr});`);
    } else {
      // Generic fallback: pass arbitrary SQL type verbatim via t.column.
      const colType = typeName === "enum" ? ((col as any).sqlType ?? typeName) : typeName;
      lines.push(`    t.column(${JSON.stringify(col.name)}, ${JSON.stringify(colType)}${optStr});`);
    }
  }

  for (const line of inlineConstraints) lines.push(line);
  lines.push("  });");
  this.indexesInCreate(tableName, lines, indexes);
}
