import ts from "typescript";
import { singularize } from "@blazetrails/activesupport";
import { getCrypto } from "@blazetrails/ruby-compat";
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

const DEFAULT_PK_TYPE = "bigint";

function isFalse(node: ts.Expression | undefined): boolean {
  return !!node && node.kind === ts.SyntaxKind.FalseKeyword;
}

/** @internal */
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

/** @internal */
function parseDeferrable(opts: ts.ObjectLiteralExpression): "immediate" | "deferred" | undefined {
  const str = strLiteral(objPropValue(opts, "deferrable"));
  return str === "immediate" || str === "deferred" ? str : undefined;
}

/** @internal */
function parseAddForeignKey(call: ts.CallExpression): ForeignKeyDefinition | undefined {
  const args = call.arguments;
  const fromTable = strLiteral(args[0]);
  const toTable = strLiteral(args[1]);
  if (!fromTable || !toTable) return undefined;

  const opts = args.length >= 3 && ts.isObjectLiteralExpression(args[2]) ? args[2] : undefined;

  const column = (opts && strLiteral(objPropValue(opts, "column"))) ?? `${singularize(toTable)}_id`;
  const primaryKey = (opts && strLiteral(objPropValue(opts, "primaryKey"))) ?? "id";
  const synthesizeName = (table: string, col: string): string => {
    const cols = col.split(",").map((c) => c.trim());
    const identifier = `${table}_${cols.join("_and_")}_fk`;
    const hex = getCrypto().createHash("sha256").update(identifier).digest("hex").slice(0, 10);
    return `fk_rails_${hex}`;
  };
  const name =
    (opts && strLiteral(objPropValue(opts, "name"))) ?? synthesizeName(fromTable, column);
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

export function parseSchemaForModels(source: string, filePath: string): IntrospectedTable[] {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const byTable = new Map<string, ForeignKeyDefinition[]>();
  visitForeignKeys(sourceFile, byTable);
  const tables: IntrospectedTable[] = [];
  visitTables(sourceFile, tables, byTable);
  return tables;
}
