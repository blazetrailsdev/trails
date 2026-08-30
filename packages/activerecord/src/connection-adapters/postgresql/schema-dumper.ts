import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";
import type {
  ExclusionConstraintDefinition,
  UniqueConstraintDefinition,
} from "./schema-definitions.js";
import type { ColumnInfo } from "../../schema-dumper.js";

export class SchemaDumper extends AbstractSchemaDumper {
  /** @internal */
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
      if (this._isEnum(column)) spec["enum_type"] = JSON.stringify(column.sqlType);
      return { type: JSON.stringify(this.schemaType(column)), ...spec };
    }

    if (this._isEnum(column)) spec["enum_type"] = JSON.stringify(column.sqlType);

    return spec;
  }

  /** @internal */
  protected override isDefaultPrimaryKey(column: ColumnInfo): boolean {
    return this.schemaType(column) === "bigserial";
  }

  /** @internal */
  protected override schemaLimit(column: ColumnInfo): string | undefined {
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

  /** @internal */
  protected override schemaPrecision(column: ColumnInfo): string | undefined {
    const base = super.schemaPrecision(column);
    if (base !== undefined) return base;
    const sqlType = (column.sqlType ?? "").toLowerCase();
    const m = /^numeric\((\d+)/.exec(sqlType);
    return m ? m[1] : undefined;
  }

  /** @internal */
  protected override schemaScale(column: ColumnInfo): string | undefined {
    const base = super.schemaScale(column);
    if (base !== undefined) return base;
    const sqlType = (column.sqlType ?? "").toLowerCase();
    const m = /^numeric\(\d+,\s*(\d+)\)/.exec(sqlType);
    return m ? m[1] : undefined;
  }

  /** @internal */
  protected isExplicitPrimaryKeyDefault(column: ColumnInfo): boolean {
    return column.type === "uuid" || (column.type === "integer" && !this._isSerial(column));
  }

  /** @internal */
  protected override schemaType(column: ColumnInfo): string {
    const isBigSql = /^bigint\b/i.test(column.sqlType ?? "");
    if (this._isSerial(column)) return isBigSql ? "bigserial" : "serial";
    if (isBigSql || column.type === "bigint") return "bigint";
    const semantic = column.type ?? undefined;
    if (semantic === "big_integer") return "bigint";
    if (semantic === "bit_varying") return "bitVarying";
    return semantic ?? super.schemaType(column as any);
  }

  /** @internal */
  protected override schemaTypeWithVirtual(column: ColumnInfo): string {
    if (this.supportsVirtualColumns && this._isVirtual(column)) return "virtual";
    return this.schemaType(column);
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE schema-dumpers-take-columns-not-columninfo
   */
  private _isEnum(column: ColumnInfo): boolean {
    return typeof (column as any).isEnum === "function"
      ? (column as any).isEnum()
      : (column as any).isEnum === true;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE schema-dumpers-take-columns-not-columninfo
   */
  private _isSerial(column: ColumnInfo): boolean {
    return typeof (column as any).isSerial === "function"
      ? (column as any).isSerial()
      : (column as any).isSerial === true;
  }

  private _isVirtual(column: ColumnInfo): boolean {
    return typeof (column as any).isVirtual === "function"
      ? (column as any).isVirtual()
      : !!(column as any).virtual;
  }

  /** @internal */
  protected override schemaExpression(column: ColumnInfo): string | undefined {
    if (this._isSerial(column)) return undefined;
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

  /**
   * @internal
   * @missingRailsCall any? — PERMANENT
   */
  protected override async exclusionConstraintsInCreate(
    table: string,
    stream: string[],
  ): Promise<void> {
    const adapter = this.pgAdapter();
    const constraints: ExclusionConstraintDefinition[] = adapter?.exclusionConstraints
      ? await adapter.exclusionConstraints(table)
      : [];
    if (constraints.length === 0) return;
    const stmts = constraints.map((ec) => {
      const opts: string[] = [];
      if (ec.where) opts.push(`where: ${JSON.stringify(ec.where)}`);
      if (ec.using) opts.push(`using: ${JSON.stringify(ec.using)}`);
      if (ec.deferrable) opts.push(`deferrable: ${JSON.stringify(ec.deferrable)}`);
      if (ec.exportNameOnSchemaDump()) opts.push(`name: ${JSON.stringify(ec.name)}`);
      const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
      return `    t.exclusionConstraint(${JSON.stringify(ec.expression)}${optStr});`;
    });
    stream.push(stmts.sort().join("\n"));
  }

  /**
   * @internal
   * @missingRailsCall any? — PERMANENT
   */
  protected override async uniqueConstraintsInCreate(
    table: string,
    stream: string[],
  ): Promise<void> {
    const adapter = this.pgAdapter();
    const constraints: UniqueConstraintDefinition[] = adapter?.uniqueConstraints
      ? await adapter.uniqueConstraints(table)
      : [];
    if (constraints.length === 0) return;
    const stmts = constraints.map((uc) => {
      const opts: string[] = [];
      if (uc.nullsNotDistinct)
        opts.push(`nullsNotDistinct: ${JSON.stringify(uc.nullsNotDistinct)}`);
      if (uc.deferrable) opts.push(`deferrable: ${JSON.stringify(uc.deferrable)}`);
      if (uc.exportNameOnSchemaDump()) opts.push(`name: ${JSON.stringify(uc.name)}`);
      const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";
      return `    t.uniqueConstraint(${JSON.stringify(uc.column)}${optStr});`;
    });
    stream.push(stmts.sort().join("\n"));
  }

  /** @internal */
  protected override async tableOptions(tableName: string): Promise<Record<string, unknown>> {
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
