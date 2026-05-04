/**
 * PostgreSQL schema dumper — PostgreSQL-specific schema dump logic.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaDumper
 */

import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";
import type { Column } from "./column.js";

export class SchemaDumper extends AbstractSchemaDumper {
  /** @internal */
  protected override prepareColumnOptions(column: Column): Record<string, unknown> {
    const spec = super.prepareColumnOptions(column as any);
    if (column.array) spec["array"] = "true";

    const adapter = this.pgAdapter();
    if (adapter?.supportsVirtualColumns?.() && column.isVirtual()) {
      spec["as"] = this.extractExpressionForVirtualColumn(column);
      spec["stored"] = true;
      return { type: JSON.stringify(this.schemaType(column)), ...spec };
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
    if (!column.isSerial) return super.schemaType(column as any);
    return column.isBigint() ? "bigserial" : "serial";
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
  protected override extensions(lines: string[]): void {
    const adapter = this.pgAdapter();
    const exts: string[] = (adapter as any)?.extensions?.() ?? [];
    if (exts.length === 0) return;
    lines.push("  # These are extensions that must be enabled in order to support this database");
    for (const ext of [...exts].sort()) {
      lines.push(`  enable_extension ${JSON.stringify(ext)}`);
    }
    lines.push("");
  }

  /** @internal */
  protected override types(lines: string[]): void {
    const adapter = this.pgAdapter();
    const enumTypes: [string, string][] = (adapter as any)?.enumTypes?.() ?? [];
    if (enumTypes.length === 0) return;
    lines.push("  # Custom types defined in this database.");
    lines.push(
      "  # Note that some types may not work with other database engines. Be careful if changing database.",
    );
    for (const [name, values] of [...enumTypes].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`  create_enum ${JSON.stringify(name)}, ${JSON.stringify(values)}`);
    }
    lines.push("");
  }

  /** @internal */
  protected override schemas(lines: string[]): void {
    const adapter = this.pgAdapter();
    const allNames: string[] = (adapter as any)?.schemaNames?.() ?? [];
    const names = allNames.filter((n) => n !== "public");
    if (names.length === 0) return;
    for (const name of [...names].sort()) {
      lines.push(`  create_schema ${JSON.stringify(name)}`);
    }
    lines.push("");
  }

  /** @internal */
  protected exclusionConstraintsInCreate(table: string, lines: string[]): void {
    const adapter = this.pgAdapter();
    const constraints: ExclusionConstraintDef[] =
      (adapter as any)?.exclusionConstraints?.(table) ?? [];
    if (constraints.length === 0) return;
    const stmts = constraints.map((c) => {
      const parts: string[] = [`t.exclusion_constraint ${JSON.stringify(c.expression)}`];
      if (c.where) parts.push(`where: ${JSON.stringify(c.where)}`);
      if (c.using) parts.push(`using: ${JSON.stringify(c.using)}`);
      if (c.deferrable != null) parts.push(`deferrable: ${JSON.stringify(c.deferrable)}`);
      if (c.exportNameOnSchemaDump?.()) parts.push(`name: ${JSON.stringify(c.name)}`);
      return `    ${parts.join(", ")}`;
    });
    lines.push([...stmts].sort().join("\n"));
  }

  /** @internal */
  protected uniqueConstraintsInCreate(table: string, lines: string[]): void {
    const adapter = this.pgAdapter();
    const constraints: UniqueConstraintDef[] = (adapter as any)?.uniqueConstraints?.(table) ?? [];
    if (constraints.length === 0) return;
    const stmts = constraints.map((c) => {
      const parts: string[] = [`t.unique_constraint ${JSON.stringify(c.column)}`];
      if (c.nullsNotDistinct)
        parts.push(`nulls_not_distinct: ${JSON.stringify(c.nullsNotDistinct)}`);
      if (c.deferrable != null) parts.push(`deferrable: ${JSON.stringify(c.deferrable)}`);
      if (c.exportNameOnSchemaDump?.()) parts.push(`name: ${JSON.stringify(c.name)}`);
      return `    ${parts.join(", ")}`;
    });
    lines.push([...stmts].sort().join("\n"));
  }

  defaultPrimaryKeyType(): string {
    return "bigserial";
  }

  private pgAdapter(): any {
    const src = (this as any)._source;
    return src?.adapter ?? undefined;
  }
}

interface ExclusionConstraintDef {
  expression: string;
  where?: string | null;
  using?: string | null;
  deferrable?: unknown;
  exportNameOnSchemaDump?(): boolean;
  name: string;
}

interface UniqueConstraintDef {
  column: string | string[];
  nullsNotDistinct?: boolean | null;
  deferrable?: unknown;
  exportNameOnSchemaDump?(): boolean;
  name: string;
}
