/**
 * PostgreSQL schema dumper — PostgreSQL-specific schema dump logic.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaDumper
 */

import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";
import type {
  ExclusionConstraintDefinition,
  UniqueConstraintDefinition,
} from "./schema-definitions.js";
import type { ColumnInfo, IndexInfo } from "../../schema-dumper.js";

export class SchemaDumper extends AbstractSchemaDumper {
  private _cachedExclConstraints: ExclusionConstraintDefinition[] | undefined;
  private _cachedUniqConstraints: UniqueConstraintDefinition[] | undefined;
  /**
   * Rails' PG dumper never reads a per-column `primary_key` flag — it asks
   * `@connection.primary_key(table)` (`postgresql/schema_statements.rb:15`), and
   * `column_definitions` (`postgresql_adapter.rb:1034`) selects ten fields, none
   * of them `indisprimary`. `primaryKeyOrderCache[tableName]` already holds that
   * authoritative list (populated by `table()` via `adapter.primaryKeys`), so
   * resolve from it rather than from a flag PG columns don't carry.
   * @internal
   */
  protected override resolvePrimaryKeyColumns(
    tableName: string,
    columns: ColumnInfo[],
  ): ColumnInfo[] {
    const order = this.primaryKeyOrderCache[tableName];
    if (order === undefined) return super.resolvePrimaryKeyColumns(tableName, columns);
    const byName = new Map(columns.map((c) => [c.name, c]));
    return order.map((name) => byName.get(name)).filter((c): c is ColumnInfo => c !== undefined);
  }

  /** @internal */
  protected override prepareColumnOptions(column: ColumnInfo): Record<string, unknown> {
    const spec = super.prepareColumnOptions(column as any);
    if (column.array) spec["array"] = true;

    if (this.supportsVirtualColumns && this._isVirtual(column)) {
      spec["as"] = this.extractExpressionForVirtualColumn(column);
      spec["stored"] = true;
      // enum_type must be set before the early return — Rails adds it after the virtual
      // block but doesn't early-return, so a virtual enum column gets both attributes.
      if (column.isEnum) spec["enum_type"] = JSON.stringify(column.sqlType);
      // Rails dumps the symbol `type: :bigserial`; the TS DSL takes a string
      // ColumnType, so emit `type: "bigserial"` (consumed verbatim by
      // formatColspec on the U3 columnSpec path).
      return { type: JSON.stringify(this.schemaType(column)), ...spec };
    }

    if (column.isEnum) spec["enum_type"] = JSON.stringify(column.sqlType);

    return spec;
  }

  /** @internal */
  protected override isDefaultPrimaryKey(column: ColumnInfo): boolean {
    // Mirrors Rails `schema_type(column) == :bigserial`. createTable now emits
    // BIGSERIAL for the default PK, so only bigserial is the default; a `serial`
    // PK is non-default and keeps its explicit `id: "serial"` option in dumps.
    return this.schemaType(column) === "bigserial";
  }

  /**
   * For PG array columns the OID::Array wrapper has no `limit` of its own;
   * the limit belongs to the element type and is encoded in the SQL type
   * string (e.g. `"character varying(255)"`, `"bit(8)"`). Parse it when
   * `column.limit` is absent.
   * @internal
   */
  protected override schemaLimit(column: ColumnInfo): string | undefined {
    // int4's limit (4) is the native default, so Rails `schema_limit` omits it
    // (`limit != native_database_types[:integer][:limit]`; typeToSql("integer", {limit: 4})
    // === "integer"). Without this an explicit `id: :integer` PK would dump
    // `id: { type: "integer", limit: 4 }` instead of the flat `id: "integer"`.
    // Mirrors the MySQL dumper's identical guard.
    if (column.type === "integer" && column.limit === 4) return undefined;
    const base = super.schemaLimit(column);
    if (base !== undefined) return base;
    const sqlType = (column.sqlType ?? "").toLowerCase();
    if (/^(?:character varying|varchar|char(?:acter)?|bpchar)\b/.test(sqlType)) {
      const m = /\((\d+)\)/.exec(sqlType);
      return m ? m[1] : undefined;
    }
    if (/^(?:bit|varbit|bit varying)\b/.test(sqlType)) {
      const m = /\((\d+)\)/.exec(sqlType);
      return m ? m[1] : undefined;
    }
    return undefined;
  }

  /**
   * For PG array columns where `column.precision` is absent, parse precision
   * from the element type's SQL type string (e.g. `"numeric(10,2)"`).
   * @internal
   */
  protected override schemaPrecision(column: ColumnInfo): string | undefined {
    const base = super.schemaPrecision(column);
    if (base !== undefined) return base;
    const sqlType = (column.sqlType ?? "").toLowerCase();
    const m = /^numeric\((\d+)/.exec(sqlType);
    return m ? m[1] : undefined;
  }

  /**
   * For PG array columns where `column.scale` is absent, parse scale from
   * the element type's SQL type string (e.g. `"numeric(10,2)"`).
   * @internal
   */
  protected override schemaScale(column: ColumnInfo): string | undefined {
    const base = super.schemaScale(column);
    if (base !== undefined) return base;
    const sqlType = (column.sqlType ?? "").toLowerCase();
    const m = /^numeric\(\d+,\s*(\d+)\)/.exec(sqlType);
    return m ? m[1] : undefined;
  }

  /** @internal */
  protected isExplicitPrimaryKeyDefault(column: ColumnInfo): boolean {
    return column.type === "uuid" || (column.type === "integer" && !column.isSerial);
  }

  /** @internal */
  protected override schemaType(column: ColumnInfo): string {
    const isBigSql = /^bigint\b/i.test(column.sqlType ?? "");
    if (column.isSerial) return isBigSql ? "bigserial" : "serial";
    if (isBigSql || column.type === "bigint") return "bigint";
    const semantic = column.type ?? undefined;
    if (semantic === "big_integer") return "bigint";
    // OID::BitVarying.type() returns Rails-style "bit_varying"; map to DSL "bitVarying".
    if (semantic === "bit_varying") return "bitVarying";
    return semantic ?? super.schemaType(column as any);
  }

  /** @internal */
  protected override schemaTypeWithVirtual(column: ColumnInfo): string {
    if (this.supportsVirtualColumns && this._isVirtual(column)) return "virtual";
    return this.schemaType(column);
  }

  /**
   * Handles both real PG Column objects (which expose `isVirtual()`) and plain
   * `ColumnInfo` objects from `AdapterSchemaSource` (which expose `virtual`).
   */
  private _isVirtual(column: ColumnInfo): boolean {
    return typeof (column as any).isVirtual === "function"
      ? (column as any).isVirtual()
      : !!(column as any).virtual;
  }

  /** @internal */
  protected override schemaExpression(column: ColumnInfo): string | undefined {
    if (column.isSerial) return undefined;
    return super.schemaExpression(column as any);
  }

  /** @internal */
  protected extractExpressionForVirtualColumn(column: ColumnInfo): string {
    return JSON.stringify(column.defaultFunction);
  }

  /** @internal */
  protected override async extensions(stream: string[]): Promise<void> {
    const adapter = this.pgAdapter();
    if (!adapter?.extensions) return;
    const exts: string[] = await adapter.extensions();
    if (exts.length === 0) return;
    stream.push("  // These are extensions that must be enabled in order to support this database");
    for (const ext of exts.sort()) {
      stream.push(`  await ctx.enableExtension(${JSON.stringify(ext)});`);
    }
    stream.push("");
  }

  /** @internal */
  protected override async types(stream: string[]): Promise<void> {
    const adapter = this.pgAdapter();
    if (!adapter?.enumTypes) return;
    const enumTypes: [string, string[]][] = await adapter.enumTypes();
    if (enumTypes.length === 0) return;
    stream.push("  // Custom types defined in this database.");
    stream.push(
      "  // Note that some types may not work with other database engines. Be careful if changing database.",
    );
    for (const [name, values] of enumTypes.sort((a, b) => a[0].localeCompare(b[0]))) {
      stream.push(`  await ctx.createEnum(${JSON.stringify(name)}, ${JSON.stringify(values)});`);
    }
    stream.push("");
  }

  /** @internal */
  protected override async schemas(stream: string[]): Promise<void> {
    const adapter = this.pgAdapter();
    if (!adapter?.schemaNames) return;
    const allNames: string[] = await adapter.schemaNames();
    const names = allNames.filter((n) => n !== "public").sort();
    if (names.length === 0) return;
    for (const name of names) {
      stream.push(`  await ctx.createSchema(${JSON.stringify(name)});`);
    }
    stream.push("");
  }

  /** @internal */
  protected override async filterIndexesForDump(
    tableName: string,
    indexes: IndexInfo[],
  ): Promise<IndexInfo[]> {
    const adapter = this.pgAdapter();
    const excl: ExclusionConstraintDefinition[] = adapter?.exclusionConstraints
      ? await adapter.exclusionConstraints(tableName)
      : [];
    const uniq: UniqueConstraintDefinition[] = adapter?.uniqueConstraints
      ? await adapter.uniqueConstraints(tableName)
      : [];
    this._cachedExclConstraints = excl;
    this._cachedUniqConstraints = uniq;

    const exclNames = new Set(excl.map((ec) => ec.name).filter(Boolean));
    const uniqNames = new Set(uniq.map((uc) => uc.name).filter(Boolean));
    if (exclNames.size === 0 && uniqNames.size === 0) return indexes;
    return indexes.filter(
      (idx) => (!idx.name || !exclNames.has(idx.name)) && (!idx.name || !uniqNames.has(idx.name)),
    );
  }

  /**
   * @internal
   *
   * @missingRailsCall any? — PERMANENT: Per-site verified (RFC 0106 wave 4b):
   *   postgresql/schema_dumper.rb:43 guards with `if (exclusion_constraints = @connection.exclusion_constraints(table)).any?`;
   *   trails guards with `.length === 0` on the JS array — `Enumerable#any?`
   *   without a block is not a ported method name.
   */
  protected override async exclusionConstraintsInCreate(
    table: string,
    stream: string[],
  ): Promise<void> {
    const adapter = this.pgAdapter();
    const constraints: ExclusionConstraintDefinition[] =
      this._cachedExclConstraints ??
      (adapter?.exclusionConstraints ? await adapter.exclusionConstraints(table) : []);
    this._cachedExclConstraints = undefined;
    if (constraints.length === 0) return;
    const stripped = this.removePrefixAndSuffix(table);
    const stmts = constraints.map((ec) => {
      const opts: string[] = [];
      if (ec.where) opts.push(`where: ${JSON.stringify(ec.where)}`);
      if (ec.using) opts.push(`using: ${JSON.stringify(ec.using)}`);
      if (ec.deferrable) opts.push(`deferrable: ${JSON.stringify(ec.deferrable)}`);
      if (ec.exportNameOnSchemaDump()) opts.push(`name: ${JSON.stringify(ec.name)}`);
      const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
      return `  await ctx.addExclusionConstraint(${JSON.stringify(stripped)}, ${JSON.stringify(ec.expression)}${optStr});`;
    });
    stream.push(stmts.sort().join("\n"));
  }

  /**
   * @internal
   *
   * @missingRailsCall any? — PERMANENT: Per-site verified (RFC 0106 wave 4b):
   *   the same guard at postgresql/schema_dumper.rb:65 — `Enumerable#any?`
   *   without a block is a `.length` check on the JS array.
   */
  protected override async uniqueConstraintsInCreate(
    table: string,
    stream: string[],
  ): Promise<void> {
    const adapter = this.pgAdapter();
    const constraints: UniqueConstraintDefinition[] =
      this._cachedUniqConstraints ??
      (adapter?.uniqueConstraints ? await adapter.uniqueConstraints(table) : []);
    this._cachedUniqConstraints = undefined;
    if (constraints.length === 0) return;
    const stripped = this.removePrefixAndSuffix(table);
    const stmts = constraints.map((uc) => {
      const opts: string[] = [];
      if (uc.nullsNotDistinct)
        opts.push(`nullsNotDistinct: ${JSON.stringify(uc.nullsNotDistinct)}`);
      if (uc.deferrable) opts.push(`deferrable: ${JSON.stringify(uc.deferrable)}`);
      if (uc.exportNameOnSchemaDump()) opts.push(`name: ${JSON.stringify(uc.name)}`);
      const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
      return `  await ctx.addUniqueConstraint(${JSON.stringify(stripped)}, ${JSON.stringify(uc.column)}${optStr});`;
    });
    stream.push(stmts.sort().join("\n"));
  }

  /** @internal */
  protected override async tableOptions(tableName: string): Promise<Record<string, unknown>> {
    const adapter = this.pgAdapter();
    if (!adapter?.tableOptions) return {};
    return adapter.tableOptions(tableName);
  }

  // Returns the Rails default ("bigserial"/BIGSERIAL); createTable emits
  // BIGSERIAL for the default PK to match.
  defaultPrimaryKeyType(): string {
    return "bigserial";
  }

  private pgAdapter(): any {
    return this._adapter();
  }
}
