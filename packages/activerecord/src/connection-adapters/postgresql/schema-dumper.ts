import { any } from "@blazetrails/activesupport";
import type { IO, StringIO } from "@blazetrails/ruby-compat";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";
import type {
  ExclusionConstraintDefinition,
  UniqueConstraintDefinition,
} from "./schema-definitions.js";
import type { Column } from "./column.js";
import type { PostgreSQLAdapter } from "../postgresql-adapter.js";

export class SchemaDumper extends AbstractSchemaDumper {
  declare protected connection: PostgreSQLAdapter;

  /** @internal */
  protected override async extensions(stream: IO | StringIO): Promise<null | undefined> {
    const extensions = await this.connection.extensions();
    if (any(extensions)) {
      stream.puts(
        "  // These are extensions that must be enabled in order to support this database",
      );
      for (const extension of extensions.sort()) {
        stream.puts(`  await ctx.enableExtension(${JSON.stringify(extension)});`);
      }
      return stream.puts("");
    }
  }

  /** @internal */
  protected override async types(stream: IO | StringIO): Promise<void> {
    const types = await this.connection.enumTypes();
    if (any(types)) {
      stream.puts("  // Custom types defined in this database.");
      stream.puts(
        "  // Note that some types may not work with other database engines. Be careful if changing database.",
      );
      for (const [name, values] of types.sort((a, b) => a[0].localeCompare(b[0]))) {
        stream.puts(`  await ctx.createEnum(${JSON.stringify(name)}, ${JSON.stringify(values)});`);
      }
      stream.puts("");
    }
  }

  /** @internal */
  protected override async schemas(stream: IO | StringIO): Promise<void> {
    const schemaNames = (await this.connection.schemaNames()).filter((name) => name !== "public");

    if (any(schemaNames)) {
      for (const name of schemaNames.sort()) {
        stream.puts(`  await ctx.createSchema(${JSON.stringify(name)});`);
      }
      stream.puts("");
    }
  }

  /**
   * @internal
   * @inventedArm if — PERMANENT
   */
  protected override async exclusionConstraintsInCreate(
    table: string,
    stream: IO | StringIO,
  ): Promise<void> {
    let exclusionConstraints: ExclusionConstraintDefinition[];
    if (any((exclusionConstraints = await this.connection.exclusionConstraints(table)))) {
      const addExclusionConstraintStatements = exclusionConstraints.map((exclusionConstraint) => {
        const parts: string[] = [];
        if (exclusionConstraint.where)
          parts.push(`where: ${JSON.stringify(exclusionConstraint.where)}`);
        if (exclusionConstraint.using)
          parts.push(`using: ${JSON.stringify(exclusionConstraint.using)}`);
        if (exclusionConstraint.deferrable)
          parts.push(`deferrable: ${JSON.stringify(exclusionConstraint.deferrable)}`);

        if (exclusionConstraint.exportNameOnSchemaDump()) {
          parts.push(`name: ${JSON.stringify(exclusionConstraint.name)}`);
        }

        const optStr = parts.length > 0 ? `, { ${parts.join(", ")} }` : "";
        return `    t.exclusionConstraint(${JSON.stringify(exclusionConstraint.expression)}${optStr});`;
      });

      stream.puts(addExclusionConstraintStatements.sort().join("\n"));
    }
  }

  /**
   * @internal
   * @inventedArm if — PERMANENT
   */
  protected override async uniqueConstraintsInCreate(
    table: string,
    stream: IO | StringIO,
  ): Promise<void> {
    let uniqueConstraints: UniqueConstraintDefinition[];
    if (any((uniqueConstraints = await this.connection.uniqueConstraints(table)))) {
      const addUniqueConstraintStatements = uniqueConstraints.map((uniqueConstraint) => {
        const parts: string[] = [];
        if (uniqueConstraint.nullsNotDistinct)
          parts.push(`nullsNotDistinct: ${JSON.stringify(uniqueConstraint.nullsNotDistinct)}`);
        if (uniqueConstraint.deferrable)
          parts.push(`deferrable: ${JSON.stringify(uniqueConstraint.deferrable)}`);

        if (uniqueConstraint.exportNameOnSchemaDump()) {
          parts.push(`name: ${JSON.stringify(uniqueConstraint.name)}`);
        }

        const optStr = parts.length > 0 ? `, { ${parts.join(", ")} }` : "";
        return `    t.uniqueConstraint(${JSON.stringify(uniqueConstraint.column)}${optStr});`;
      });

      stream.puts(addUniqueConstraintStatements.sort().join("\n"));
    }
  }

  /** @internal */
  protected override async prepareColumnOptions(column: Column): Promise<Record<string, unknown>> {
    let spec = await super.prepareColumnOptions(column);
    if (column.isArray()) spec["array"] = true;

    if ((await this.connection.supportsVirtualColumns()) && column.isVirtual()) {
      spec["as"] = this.extractExpressionForVirtualColumn(column);
      spec["stored"] = true;
      spec = { type: JSON.stringify(this.schemaType(column).replace(/^:/, "")), ...spec };
    }

    if (column.isEnum()) spec["enumType"] = JSON.stringify(column.sqlType);

    return spec;
  }

  /** @internal */
  protected override isDefaultPrimaryKey(column: Column): boolean {
    return this.schemaType(column) === ":bigserial";
  }

  /** @internal */
  protected isExplicitPrimaryKeyDefault(column: Column): boolean {
    return column.type === "uuid" || (column.type === "integer" && !column.isSerial());
  }

  /** @internal */
  protected override schemaType(column: Column): string {
    if (!column.isSerial()) return super.schemaType(column);

    if (column.isBigint()) {
      return ":bigserial";
    } else {
      return ":serial";
    }
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
}
