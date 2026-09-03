import type { AdapterName } from "../connection-adapters/abstract-adapter.js";
import { getEnv, getOsAsync } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
import type { Schema, ColumnSpec, TableSchema, IndexSpec, ForeignKeySpec } from "./schema-types.js";

const SCHEMA_TO_AR: Record<string, string> = { big_integer: "bigint" };

function toArType(primitive: string): string {
  return SCHEMA_TO_AR[primitive] ?? primitive;
}

function isWrapped(t: TableSchema): t is {
  columns: Record<string, ColumnSpec>;
  primaryKey?: string[] | false;
  indexes?: IndexSpec[];
  foreignKeys?: ForeignKeySpec[];
} {
  if (!t || typeof t !== "object") return false;
  if (!("columns" in t)) return false;
  if ("primaryKey" in t) {
    const pk = (t as { primaryKey?: unknown }).primaryKey;
    if (pk !== false && !Array.isArray(pk)) return false;
    return true;
  }
  if (Array.isArray((t as { foreignKeys?: unknown }).foreignKeys)) return true;
  return Array.isArray((t as { indexes?: unknown }).indexes);
}

function columnsOf(t: TableSchema): Record<string, ColumnSpec> {
  return isWrapped(t) ? (t as { columns: Record<string, ColumnSpec> }).columns : t;
}

function primaryKeyOf(t: TableSchema): string[] | false | undefined {
  return isWrapped(t) ? (t as { primaryKey?: string[] | false }).primaryKey : undefined;
}

function indexesOf(t: TableSchema): IndexSpec[] {
  return isWrapped(t) ? ((t as { indexes?: IndexSpec[] }).indexes ?? []) : [];
}

function foreignKeysOf(t: TableSchema): ForeignKeySpec[] {
  return isWrapped(t) ? ((t as { foreignKeys?: ForeignKeySpec[] }).foreignKeys ?? []) : [];
}

function isIntegerSpec(spec: ColumnSpec | undefined): boolean {
  if (spec === undefined) return false;
  const type = typeof spec === "string" ? spec : spec.type;
  return type === "integer" || type === "big_integer";
}

function serialIdType(spec: ColumnSpec | undefined, typeRegistryKey?: AdapterName): string {
  const type = typeof spec === "string" ? spec : spec?.type;
  const isBig = type === "big_integer";
  if (typeRegistryKey === "postgresql") return isBig ? "bigserial" : "serial";
  if (typeRegistryKey === "sqlite3") return "integer";
  return isBig ? "bigint" : "integer";
}

function colOpts(spec: ColumnSpec, primitive: string, typeRegistryKey?: AdapterName): string {
  const parts: string[] = [];
  const hasPrecision = typeof spec === "object" && spec.precision !== undefined;
  if (typeof spec === "object") {
    if (spec.limit !== undefined) parts.push(`limit: ${JSON.stringify(spec.limit)}`);
    if (hasPrecision) parts.push(`precision: ${JSON.stringify(spec.precision)}`);
    if (spec.scale !== undefined) parts.push(`scale: ${JSON.stringify(spec.scale)}`);
    if (spec.null !== undefined) parts.push(`null: ${JSON.stringify(spec.null)}`);
    if (spec.defaultFunction !== undefined) {
      parts.push(`default: () => ${JSON.stringify(spec.defaultFunction)}`);
    } else if (spec.default !== undefined) {
      parts.push(`default: ${JSON.stringify(spec.default)}`);
    }
    if (spec.array) parts.push(`array: true`);
    if (spec.primary) parts.push(`primaryKey: true`);
  }
  if (typeRegistryKey === "mysql2" && primitive === "datetime" && !hasPrecision) {
    parts.push(`precision: 6`);
  }
  return parts.length === 0 ? "{}" : `{ ${parts.join(", ")} }`;
}

function schemaChecksum(code: string): string {
  let h = 5381;
  for (let i = 0; i < code.length; i++) h = ((h << 5) + h + code.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function generateCode(
  schema: Schema,
  typeRegistryKey?: AdapterName,
  supportsExpressionIndex?: boolean,
): string {
  const lines: string[] = [
    `import type { DatabaseAdapter } from "@blazetrails/activerecord";`,
    ``,
    `export default async function defineSchema(ctx: DatabaseAdapter): Promise<void> {`,
  ];

  const needsForce = typeRegistryKey === "postgresql" || typeRegistryKey === "mysql2";

  if (needsForce) {
    for (const [tableName, tableSpec] of Object.entries(schema)) {
      if (foreignKeysOf(tableSpec).length === 0) continue;
      lines.push(`  await ctx.dropTable(${JSON.stringify(tableName)}, { ifExists: true });`);
    }
  }

  for (const [tableName, tableSpec] of Object.entries(schema)) {
    const cols = columnsOf(tableSpec);
    const pk = primaryKeyOf(tableSpec);
    const serialPkName =
      Array.isArray(pk) && pk.length === 1 && isIntegerSpec(cols[pk[0]]) ? pk[0] : null;

    const tOptsEntries: string[] = [];
    if (pk === false) tOptsEntries.push(`id: false`);
    else if (serialPkName !== null) {
      tOptsEntries.push(`id: false`);
    } else if (Array.isArray(pk)) tOptsEntries.push(`primaryKey: ${JSON.stringify(pk)}`);
    if (needsForce) tOptsEntries.push(`force: "cascade"`);
    const tOpts = tOptsEntries.length === 0 ? `{}` : `{ ${tOptsEntries.join(", ")} }`;

    const fks = foreignKeysOf(tableSpec);
    const fkLines = fks.map(
      (fk) =>
        `    t.foreignKey(${JSON.stringify(fk.toTable)}, ${JSON.stringify({
          column: fk.column,
          ...(fk.primaryKey === undefined ? {} : { primaryKey: fk.primaryKey }),
          ...(fk.name === undefined ? {} : { name: fk.name }),
          ...(fk.onDelete === undefined ? {} : { onDelete: fk.onDelete }),
          ...(fk.deferrable === undefined ? {} : { deferrable: fk.deferrable }),
        })});`,
    );

    const colEntries = Object.entries(cols);
    if (colEntries.length === 0 && fkLines.length === 0) {
      lines.push(`  await ctx.createTable(${JSON.stringify(tableName)}, ${tOpts});`);
    } else {
      lines.push(`  await ctx.createTable(${JSON.stringify(tableName)}, ${tOpts}, (t) => {`);
      for (const [colName, colSpec] of colEntries) {
        if (colName === serialPkName) {
          lines.push(
            `    t.column(${JSON.stringify(colName)}, ${JSON.stringify(serialIdType(colSpec, typeRegistryKey))}, { primaryKey: true });`,
          );
          continue;
        }
        const primitive = typeof colSpec === "string" ? colSpec : colSpec.type;
        lines.push(
          `    t.column(${JSON.stringify(colName)}, ${JSON.stringify(toArType(primitive))}, ${colOpts(colSpec, primitive, typeRegistryKey)});`,
        );
      }
      lines.push(...fkLines);
      lines.push(`  });`);
    }

    for (const index of indexesOf(tableSpec)) {
      const isExpression = typeof index.columns === "string" && /\W/.test(index.columns);
      const dropExpression =
        supportsExpressionIndex !== undefined
          ? !supportsExpressionIndex
          : typeRegistryKey === "mysql2";
      if (isExpression && dropExpression) continue;
      if (
        index.adapters &&
        typeRegistryKey !== undefined &&
        !index.adapters.includes(typeRegistryKey)
      )
        continue;
      const optEntries: string[] = [];
      if (index.unique) optEntries.push(`unique: true`);
      if (index.where !== undefined) optEntries.push(`where: ${JSON.stringify(index.where)}`);
      if (index.name !== undefined) optEntries.push(`name: ${JSON.stringify(index.name)}`);
      if (index.order !== undefined) optEntries.push(`order: ${JSON.stringify(index.order)}`);
      if (index.length !== undefined) optEntries.push(`length: ${JSON.stringify(index.length)}`);
      if (index.nullsNotDistinct) optEntries.push(`nullsNotDistinct: true`);
      if (index.using !== undefined) optEntries.push(`using: ${JSON.stringify(index.using)}`);
      if (index.type !== undefined) optEntries.push(`type: ${JSON.stringify(index.type)}`);
      const opts = optEntries.length === 0 ? `{}` : `{ ${optEntries.join(", ")} }`;
      lines.push(
        `  await ctx.addIndex(${JSON.stringify(tableName)}, ${JSON.stringify(index.columns)}, ${opts});`,
      );
    }
  }

  lines.push(`}`);
  return lines.join("\n") + "\n";
}

export async function generateSchemaFile(
  schema: Schema,
  typeRegistryKey?: AdapterName,
  supportsExpressionIndex?: boolean,
): Promise<string> {
  const os = await getOsAsync();
  const poolId = getEnv("VITEST_POOL_ID") ?? "0";
  const code = generateCode(schema, typeRegistryKey, supportsExpressionIndex);
  const filePath = File.join(os.tmpdir(), `trails-schema-${poolId}-${schemaChecksum(code)}.ts`);
  File.write(filePath, code);
  return filePath;
}
