/**
 * Parses a committed `db/schema.ts` into `IntrospectedTable[]` for the
 * `ar models:dump` codegen path.
 *
 * Why a sibling file (not `schema-ts-parser.ts`): that file is on the
 * `trails-tsc` typecheck barrel and must stay free of any
 * `@blazetrails/activerecord` value import. This file needs the real
 * `ForeignKeyDefinition` class (object literals are not assignable to the
 * class type), so the AR-runtime coupling is confined here.
 */

import ts from "typescript";
import { singularize } from "@blazetrails/activesupport";
import {
  ForeignKeyDefinition,
  type IntrospectedTable,
  type ReferentialAction,
} from "@blazetrails/activerecord";
import {
  type DumpColumnSchema,
  strLiteral,
  objPropValue,
  parseCreateTable,
  walkBody,
} from "./schema-ts-parser.js";

// Rails default PK is bigint (Rails 5.1+).
const DEFAULT_PK_TYPE = "bigint";

function isFalse(node: ts.Expression | undefined): boolean {
  return !!node && node.kind === ts.SyntaxKind.FalseKeyword;
}

/**
 * Recover the primary-key column name(s) and any synthesized `id` column
 * from a `createTable` options literal. The dumper emits no option for a
 * default/uuid PK (synthesized here) and `primaryKey: [...]` for composite
 * PKs — whose member columns appear as ordinary column lines in the block.
 * @internal
 */
function synthesizePk(opts: ts.ObjectLiteralExpression | undefined): {
  primaryKey: string | string[] | null;
  idColumn: { name: string; type: string } | null;
} {
  if (!opts) {
    return { primaryKey: "id", idColumn: { name: "id", type: DEFAULT_PK_TYPE } };
  }

  const idVal = objPropValue(opts, "id");
  const pkVal = objPropValue(opts, "primaryKey");

  if (pkVal && ts.isArrayLiteralExpression(pkVal)) {
    const names = pkVal.elements
      .map((el) => strLiteral(el))
      .filter((n): n is string => n !== undefined);
    return { primaryKey: names, idColumn: null };
  }
  if (isFalse(idVal)) return { primaryKey: null, idColumn: null };
  if (strLiteral(idVal) === "uuid") {
    return { primaryKey: "id", idColumn: { name: "id", type: "uuid" } };
  }
  return { primaryKey: "id", idColumn: { name: "id", type: DEFAULT_PK_TYPE } };
}

/** @internal */
function buildColumns(
  idColumn: { name: string; type: string } | null,
  arrowBody: ts.Block | undefined,
): { name: string; type: string }[] {
  const columns: { name: string; type: string }[] = [];
  if (idColumn) columns.push(idColumn);
  if (arrowBody) {
    const table: Record<string, DumpColumnSchema> = Object.create(null);
    walkBody(arrowBody, table);
    for (const [name, col] of Object.entries(table)) {
      columns.push({ name, type: col.type });
    }
  }
  return columns;
}

/**
 * The dumper writes `deferrable: ${JSON.stringify(fk.deferrable)}` only when
 * the value is neither `false` nor `undefined` (schema-dumper.ts:1172), and by
 * then it has been normalised to `"immediate"` / `"deferred"` — never a bare
 * boolean — across every adapter that emits FKs: PG's `assertValidDeferrable`
 * rejects bare `true` (postgresql-adapter.ts:3591) and SQLite's
 * `_parseFkDeferrable` is typed `Map<string, "immediate" | "deferred">`
 * (sqlite3-adapter.ts:1151). So only the two string forms can appear in a
 * dumped schema.ts.
 * @internal
 */
function parseDeferrable(opts: ts.ObjectLiteralExpression): "immediate" | "deferred" | undefined {
  const str = strLiteral(objPropValue(opts, "deferrable"));
  return str === "immediate" || str === "deferred" ? str : undefined;
}

/**
 * Build a `ForeignKeyDefinition` from one `addForeignKey(from, to, opts?)`
 * call. The `column` option is conditionally emitted by the dumper, so it
 * defaults to the Rails convention `${singularize(toTable)}_id`; `primaryKey`
 * defaults to `"id"`; an absent `name` is synthesized (codegen-only — it does
 * not round-trip through the dumper, see plan §Risks).
 * @internal
 */
function parseAddForeignKey(call: ts.CallExpression): ForeignKeyDefinition | undefined {
  const args = call.arguments;
  const fromTable = strLiteral(args[0]);
  const toTable = strLiteral(args[1]);
  if (!fromTable || !toTable) return undefined;

  const opts =
    args.length >= 3 && ts.isObjectLiteralExpression(args[2])
      ? (args[2] as ts.ObjectLiteralExpression)
      : undefined;

  // Rails' foreign_key_column_for strips the configured table_name_prefix/suffix
  // before singularizing (schema_statements.rb:1241,1246); the offline parser has
  // no access to that config, so the inference can diverge under a non-empty
  // prefix/suffix. Near-dead in practice: the dumper always emits an explicit
  // `column:` for introspected FKs (schema-dumper.ts:1161), so this default only
  // fires on a hand-written schema.ts.
  const column = (opts && strLiteral(objPropValue(opts, "column"))) ?? `${singularize(toTable)}_id`;
  const primaryKey = (opts && strLiteral(objPropValue(opts, "primaryKey"))) ?? "id";
  // For a composite FK `column` is the comma-joined string (e.g. "a_id,b_id"),
  // so the synthesized name can contain a comma. Harmless: it surfaces only in
  // generateModels' composite-FK `// TODO composite FK ...` comment
  // (model-codegen.ts:241) and never round-trips through the dumper.
  const name =
    (opts && strLiteral(objPropValue(opts, "name"))) ?? `fk_rails_${fromTable}_${column}`;
  const onDelete = opts
    ? (strLiteral(objPropValue(opts, "onDelete")) as ReferentialAction | undefined)
    : undefined;
  const onUpdate = opts
    ? (strLiteral(objPropValue(opts, "onUpdate")) as ReferentialAction | undefined)
    : undefined;
  const deferrable = opts ? parseDeferrable(opts) : undefined;
  const validate = !(opts && isFalse(objPropValue(opts, "validate")));

  return new ForeignKeyDefinition(
    fromTable,
    toTable,
    column,
    primaryKey,
    name,
    onDelete,
    onUpdate,
    deferrable,
    validate,
  );
}

/** @internal */
function visitForeignKeys(node: ts.Node, byTable: Map<string, ForeignKeyDefinition[]>): void {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "addForeignKey"
  ) {
    const fk = parseAddForeignKey(node);
    if (fk) {
      const list = byTable.get(fk.fromTable);
      if (list) list.push(fk);
      else byTable.set(fk.fromTable, [fk]);
    }
  }
  ts.forEachChild(node, (child) => visitForeignKeys(child, byTable));
}

/** @internal */
function visitTables(
  node: ts.Node,
  tables: IntrospectedTable[],
  byTable: Map<string, ForeignKeyDefinition[]>,
): void {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "createTable"
  ) {
    const parsed = parseCreateTable(node);
    if (parsed) {
      const { name, opts, arrowBody } = parsed;
      const { primaryKey, idColumn } = synthesizePk(opts);
      tables.push({
        name,
        primaryKey,
        foreignKeys: byTable.get(name) ?? [],
        columns: buildColumns(idColumn, arrowBody),
      });
    }
  }
  ts.forEachChild(node, (child) => visitTables(child, tables, byTable));
}

/**
 * Parse a `db/schema.ts` source into the `IntrospectedTable[]` shape consumed
 * by `generateModels`, without touching a database. One entry per
 * `createTable` call, annotated with the FK constraints recovered from
 * top-level `addForeignKey` calls.
 */
export function parseSchemaForModels(source: string, filePath: string): IntrospectedTable[] {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const byTable = new Map<string, ForeignKeyDefinition[]>();
  visitForeignKeys(sourceFile, byTable);
  const tables: IntrospectedTable[] = [];
  visitTables(sourceFile, tables, byTable);
  return tables;
}
