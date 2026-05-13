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
import type { Column } from "./column.js";
import type { IndexInfo } from "../../schema-dumper.js";

export class SchemaDumper extends AbstractSchemaDumper {
  // Per-table constraint cache populated by filterIndexesForDump and consumed
  // by exclusionConstraintsInCreate / uniqueConstraintsInCreate to avoid
  // fetching the same constraint lists twice per table.
  private _cachedExclConstraints: ExclusionConstraintDefinition[] | undefined;
  private _cachedUniqConstraints: UniqueConstraintDefinition[] | undefined;
  /** @internal */
  protected override prepareColumnOptions(column: Column): Record<string, unknown> {
    const spec = super.prepareColumnOptions(column as any);
    if (column.array) spec["array"] = true;

    const adapter = this.pgAdapter();
    if (adapter?.supportsVirtualColumns?.() && column.isVirtual()) {
      spec["as"] = this.extractExpressionForVirtualColumn(column);
      spec["stored"] = true;
      // enum_type must be set before the early return — Rails adds it after the virtual
      // block but doesn't early-return, so a virtual enum column gets both attributes.
      if (column.isEnum) spec["enum_type"] = JSON.stringify(column.sqlType);
      // Rails: { type: schema_type(column).inspect } — symbol inspect gives ":bigserial"
      return { type: `:${this.schemaType(column)}`, ...spec };
    }

    if (column.isEnum) spec["enum_type"] = JSON.stringify(column.sqlType);

    return spec;
  }

  /** @internal */
  protected override isDefaultPrimaryKey(column: Column): boolean {
    return this.schemaType(column) === "bigserial";
  }

  /** @internal */
  protected isExplicitPrimaryKeyDefault(column: Column): boolean {
    return column.type === "uuid" || (column.type === "integer" && !column.isSerial);
  }

  /** @internal */
  protected override schemaType(column: Column): string {
    if (column.isSerial) return column.isBigint() ? "bigserial" : "serial";
    if (column.isBigint()) return "bigint";
    const semantic = column.type ?? undefined;
    // BigIntegerType.name is "big_integer" — normalize to "bigint" for schema output
    if (semantic === "big_integer") return "bigint";
    return semantic ?? super.schemaType(column as any);
  }

  /** @internal */
  protected override schemaTypeWithVirtual(column: Column): string {
    // Abstract base checks column.virtual (property); PG Column exposes isVirtual() instead
    if (column.isVirtual()) return "virtual";
    return this.schemaType(column);
  }

  /** @internal */
  protected override schemaExpression(column: Column): string | undefined {
    if (column.isSerial) return undefined;
    return super.schemaExpression(column as any);
  }

  /** @internal */
  protected extractExpressionForVirtualColumn(column: Column): string {
    return JSON.stringify(column.defaultFunction);
  }

  /** @internal */
  protected override async extensions(lines: string[]): Promise<void> {
    const adapter = this.pgAdapter();
    if (!adapter?.extensions) return;
    const exts: string[] = await adapter.extensions();
    if (exts.length === 0) return;
    lines.push("  # These are extensions that must be enabled in order to support this database");
    for (const ext of exts.sort()) {
      lines.push(`  enable_extension ${JSON.stringify(ext)}`);
    }
    lines.push("");
  }

  /** @internal */
  protected override async types(lines: string[]): Promise<void> {
    const adapter = this.pgAdapter();
    if (!adapter?.enumTypes) return;
    const enumTypes: [string, string[]][] = await adapter.enumTypes();
    if (enumTypes.length === 0) return;
    lines.push("  # Custom types defined in this database.");
    lines.push(
      "  # Note that some types may not work with other database engines. Be careful if changing database.",
    );
    for (const [name, values] of enumTypes.sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`  create_enum ${JSON.stringify(name)}, ${JSON.stringify(values)}`);
    }
    lines.push("");
  }

  /** @internal */
  protected override async schemas(lines: string[]): Promise<void> {
    const adapter = this.pgAdapter();
    if (!adapter?.schemaNames) return;
    const allNames: string[] = await adapter.schemaNames();
    const names = allNames.filter((n) => n !== "public").sort();
    if (names.length === 0) return;
    for (const name of names) {
      lines.push(`  create_schema ${JSON.stringify(name)}`);
    }
    lines.push("");
  }

  /** @internal */
  protected override async filterIndexesForDump(
    tableName: string,
    indexes: IndexInfo[],
  ): Promise<IndexInfo[]> {
    const adapter = this.pgAdapter();
    // Fetch and cache both constraint lists so gatherInlineConstraints can
    // reuse them without a second DB round-trip.
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
   * Emit PG exclusion/unique constraints as post-block ctx.add*Constraint()
   * calls — these methods are PG-specific and not on the abstract TableDefinition
   * passed to the createTable callback, so they cannot be inlined as t.* calls.
   * @internal
   */
  override async table(tableName: string, lines: string[]): Promise<void> {
    await super.table(tableName, lines);
    // Remove the trailing blank pushed by super.table so constraints land before it.
    if (lines[lines.length - 1] === "") lines.pop();
    await this._emitExclusionConstraints(tableName, lines);
    await this._emitUniqueConstraints(tableName, lines);
    lines.push("");
  }

  /** @internal */
  private async _emitExclusionConstraints(tableName: string, lines: string[]): Promise<void> {
    const adapter = this.pgAdapter();
    const constraints: ExclusionConstraintDefinition[] =
      this._cachedExclConstraints ??
      (adapter?.exclusionConstraints ? await adapter.exclusionConstraints(tableName) : []);
    this._cachedExclConstraints = undefined;
    if (constraints.length === 0) return;
    const stripped = this.removePrefixAndSuffix(tableName);
    const stmts = constraints.map((ec) => {
      const opts: string[] = [];
      if (ec.where) opts.push(`where: ${JSON.stringify(ec.where)}`);
      if (ec.using) opts.push(`using: ${JSON.stringify(ec.using)}`);
      if (ec.deferrable !== undefined) opts.push(`deferrable: ${JSON.stringify(ec.deferrable)}`);
      if (ec.exportNameOnSchemaDump()) opts.push(`name: ${JSON.stringify(ec.name)}`);
      const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
      return `  await ctx.addExclusionConstraint(${JSON.stringify(stripped)}, ${JSON.stringify(ec.expression)}${optStr});`;
    });
    lines.push(...stmts.sort());
  }

  /** @internal */
  private async _emitUniqueConstraints(tableName: string, lines: string[]): Promise<void> {
    const adapter = this.pgAdapter();
    const constraints: UniqueConstraintDefinition[] =
      this._cachedUniqConstraints ??
      (adapter?.uniqueConstraints ? await adapter.uniqueConstraints(tableName) : []);
    this._cachedUniqConstraints = undefined;
    if (constraints.length === 0) return;
    const stripped = this.removePrefixAndSuffix(tableName);
    const stmts = constraints.map((uc) => {
      const opts: string[] = [];
      if (uc.nullsNotDistinct)
        opts.push(`nullsNotDistinct: ${JSON.stringify(uc.nullsNotDistinct)}`);
      if (uc.deferrable !== undefined) opts.push(`deferrable: ${JSON.stringify(uc.deferrable)}`);
      if (uc.exportNameOnSchemaDump()) opts.push(`name: ${JSON.stringify(uc.name)}`);
      const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
      return `  await ctx.addUniqueConstraint(${JSON.stringify(stripped)}, ${JSON.stringify(uc.column)}${optStr});`;
    });
    lines.push(...stmts.sort());
  }

  /** @internal */
  protected override async fetchTableOptions(tableName: string): Promise<Record<string, unknown>> {
    const adapter = this.pgAdapter();
    if (!adapter?.tableOptions) return {};
    return adapter.tableOptions(tableName);
  }

  defaultPrimaryKeyType(): string {
    return "bigserial";
  }

  private pgAdapter(): any {
    return this._adapter();
  }
}
