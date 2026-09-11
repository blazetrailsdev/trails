import type { IO, StringIO } from "@blazetrails/ruby-compat";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";
import type {
  ExclusionConstraintDefinition,
  UniqueConstraintDefinition,
} from "./schema-definitions.js";
import type { Column } from "./column.js";

export class SchemaDumper extends AbstractSchemaDumper {
  /** @internal */
  protected override prepareColumnOptions(column: Column): Record<string, unknown> {
    const spec = super.prepareColumnOptions(column);
    if (column.isArray()) spec["array"] = true;

    if (this.supportsVirtualColumns && column.isVirtual()) {
      spec["as"] = this.extractExpressionForVirtualColumn(column);
      spec["stored"] = true;
      if (column.isEnum()) spec["enumType"] = JSON.stringify(column.sqlType);
      return { type: JSON.stringify(this.schemaType(column).replace(/^:/, "")), ...spec };
    }

    if (column.isEnum()) spec["enumType"] = JSON.stringify(column.sqlType);

    return spec;
  }

  /** @internal */
  protected override isDefaultPrimaryKey(column: Column): boolean {
    return this.schemaType(column) === ":bigserial";
  }

  /** @internal */
  protected override schemaLimit(column: Column): string | undefined {
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
  protected override schemaPrecision(column: Column): string | undefined {
    const base = super.schemaPrecision(column);
    if (base !== undefined) return base;
    const sqlType = (column.sqlType ?? "").toLowerCase();
    const m = /^numeric\((\d+)/.exec(sqlType);
    return m ? m[1] : undefined;
  }

  /** @internal */
  protected override schemaScale(column: Column): string | undefined {
    const base = super.schemaScale(column);
    if (base !== undefined) return base;
    const sqlType = (column.sqlType ?? "").toLowerCase();
    const m = /^numeric\(\d+,\s*(\d+)\)/.exec(sqlType);
    return m ? m[1] : undefined;
  }

  /** @internal */
  protected isExplicitPrimaryKeyDefault(column: Column): boolean {
    return column.type === "uuid" || (column.type === "integer" && !column.isSerial());
  }

  /** @internal */
  protected override schemaType(column: Column): string {
    const isBigSql = /^bigint\b/i.test(column.sqlType ?? "");
    if (column.isSerial()) return isBigSql ? ":bigserial" : ":serial";
    if (isBigSql || column.type === "bigint") return ":bigint";
    const semantic = column.type ?? undefined;
    if (semantic === "big_integer") return ":bigint";
    if (semantic === "bit_varying") return ":bitVarying";
    return semantic != null ? `:${semantic}` : super.schemaType(column as any);
  }

  /** @internal */
  protected override schemaTypeWithVirtual(column: Column): string {
    if (this.supportsVirtualColumns && column.isVirtual()) return ":virtual";
    return this.schemaType(column);
  }

  /** @internal */
  protected override schemaExpression(column: Column): string | undefined {
    if (column.isSerial()) return undefined;
    return super.schemaExpression(column);
  }

  /** @internal */
  protected extractExpressionForVirtualColumn(column: Column): string {
    return JSON.stringify(column.defaultFunction);
  }

  /** @internal */
  protected override async extensions(stream: IO | StringIO): Promise<void> {
    const adapter = this.pgAdapter();
    if (!adapter?.extensions) return;
    const exts: string[] = await adapter.extensions();
    if (exts.length === 0) return;
    stream.puts("  // These are extensions that must be enabled in order to support this database");
    for (const ext of exts.sort()) {
      stream.puts(`  await ctx.enableExtension(${JSON.stringify(ext)});`);
    }
    stream.puts("");
  }

  /** @internal */
  protected override async types(stream: IO | StringIO): Promise<void> {
    const adapter = this.pgAdapter();
    if (!adapter?.enumTypes) return;
    const enumTypes: [string, string[]][] = await adapter.enumTypes();
    if (enumTypes.length === 0) return;
    stream.puts("  // Custom types defined in this database.");
    stream.puts(
      "  // Note that some types may not work with other database engines. Be careful if changing database.",
    );
    for (const [name, values] of enumTypes.sort((a, b) => a[0].localeCompare(b[0]))) {
      stream.puts(`  await ctx.createEnum(${JSON.stringify(name)}, ${JSON.stringify(values)});`);
    }
    stream.puts("");
  }

  /** @internal */
  protected override async schemas(stream: IO | StringIO): Promise<void> {
    const adapter = this.pgAdapter();
    if (!adapter?.schemaNames) return;
    const allNames: string[] = await adapter.schemaNames();
    const names = allNames.filter((n) => n !== "public").sort();
    if (names.length === 0) return;
    for (const name of names) {
      stream.puts(`  await ctx.createSchema(${JSON.stringify(name)});`);
    }
    stream.puts("");
  }

  /**
   * @internal
   * @missingRailsCall any? — PERMANENT
   */
  protected override async exclusionConstraintsInCreate(
    table: string,
    stream: IO | StringIO,
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
    stream.puts(stmts.sort().join("\n"));
  }

  /**
   * @internal
   * @missingRailsCall any? — PERMANENT
   */
  protected override async uniqueConstraintsInCreate(
    table: string,
    stream: IO | StringIO,
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
    stream.puts(stmts.sort().join("\n"));
  }

  /** @internal */
  protected override async tableOptions(tableName: string): Promise<Record<string, unknown>> {
    const adapter = this.pgAdapter();
    if (!adapter?.tableOptions) return {};
    return adapter.tableOptions(tableName);
  }

  /** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
  defaultPrimaryKeyType(): string {
    return "bigserial";
  }

  private pgAdapter(): any {
    return this._adapter();
  }
}
