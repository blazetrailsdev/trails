import ts from "typescript";
import type { DumpColumnSchema } from "@blazetrails/activerecord/schema-columns-dump";

export type { DumpColumnSchema };
export type SchemaColumnsByTable = Record<string, Record<string, DumpColumnSchema>>;

// Rails default PK is bigint (Rails 5.1+).
const DEFAULT_PK_TYPE = "bigint";

export function strLiteral(node: ts.Node | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return undefined;
}

export function objPropValue(
  obj: ts.ObjectLiteralExpression,
  key: string,
): ts.Expression | undefined {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = ts.isIdentifier(prop.name) ? prop.name.text : strLiteral(prop.name);
    if (name === key) return prop.initializer;
  }
  return undefined;
}

function isFalse(node: ts.Expression | undefined): boolean {
  return !!node && node.kind === ts.SyntaxKind.FalseKeyword;
}

function isArrayLiteral(node: ts.Expression | undefined): node is ts.ArrayLiteralExpression {
  return !!node && ts.isArrayLiteralExpression(node);
}

export function parseCreateTable(
  call: ts.CallExpression,
):
  | { name: string; opts: ts.ObjectLiteralExpression | undefined; arrowBody: ts.Block | undefined }
  | undefined {
  const args = call.arguments;
  const name = strLiteral(args[0]);
  if (!name) return undefined;

  let opts: ts.ObjectLiteralExpression | undefined;
  let arrowBody: ts.Block | undefined;

  if (args.length === 2) {
    const second = args[1];
    if (second && ts.isArrowFunction(second) && ts.isBlock(second.body)) {
      arrowBody = second.body;
    }
  } else if (args.length >= 3) {
    const second = args[1];
    if (second && ts.isObjectLiteralExpression(second)) opts = second;
    const third = args[2];
    if (third && ts.isArrowFunction(third) && ts.isBlock(third.body)) {
      arrowBody = third.body;
    }
  }

  return { name, opts, arrowBody };
}

function synthesizePk(
  opts: ts.ObjectLiteralExpression | undefined,
): DumpColumnSchema | null | "composite" {
  if (!opts) return { type: DEFAULT_PK_TYPE, null: false };

  const idVal = objPropValue(opts, "id");
  const pkVal = objPropValue(opts, "primaryKey");

  if (isArrayLiteral(pkVal)) return "composite";
  if (isFalse(idVal)) return null;
  if (strLiteral(idVal) === "uuid") return { type: "uuid", null: false };
  return { type: DEFAULT_PK_TYPE, null: false };
}

function parseColumnStatement(stmt: ts.Statement): { colName: string; col: DumpColumnSchema }[] {
  if (!ts.isExpressionStatement(stmt)) return [];
  const call = stmt.expression;
  if (!ts.isCallExpression(call)) return [];

  const access = call.expression;
  if (!ts.isPropertyAccessExpression(access)) return [];
  const method = access.name.text;

  const args = call.arguments;

  // checkConstraint is emitted inside the createTable block by SchemaDumper
  // (schema-dumper.ts:820) but is not a column — skip it explicitly.
  if (method === "checkConstraint") return [];

  if (method === "timestamps") {
    return [
      { colName: "created_at", col: { type: "datetime", null: false } },
      { colName: "updated_at", col: { type: "datetime", null: false } },
    ];
  }

  const colName = strLiteral(args[0]);
  if (!colName) return [];

  if (method === "column") {
    const sqlType = strLiteral(args[1]);
    if (!sqlType) return [];
    const optsNode =
      args.length >= 3 && ts.isObjectLiteralExpression(args[2])
        ? (args[2] as ts.ObjectLiteralExpression)
        : undefined;
    const nullFalse = !!(optsNode && isFalse(objPropValue(optsNode, "null")));
    const isArray = !!(
      optsNode && objPropValue(optsNode, "array")?.kind === ts.SyntaxKind.TrueKeyword
    );
    if (isArray) {
      return [{ colName, col: { type: "array", null: !nullFalse, arrayElementType: sqlType } }];
    }
    const col: DumpColumnSchema = { type: sqlType, null: !nullFalse };
    return [{ colName, col }];
  }

  const optsNode =
    args.length >= 2 && ts.isObjectLiteralExpression(args[1])
      ? (args[1] as ts.ObjectLiteralExpression)
      : undefined;
  const nullFalse = !!(optsNode && isFalse(objPropValue(optsNode, "null")));
  const isArray = !!(
    optsNode && objPropValue(optsNode, "array")?.kind === ts.SyntaxKind.TrueKeyword
  );

  if (isArray) {
    const col: DumpColumnSchema = {
      type: "array",
      null: !nullFalse,
      arrayElementType: method,
    };
    return [{ colName, col }];
  }

  const col: DumpColumnSchema = { type: method, null: !nullFalse };
  return [{ colName, col }];
}

export function walkBody(body: ts.Block, table: Record<string, DumpColumnSchema>): void {
  for (const stmt of body.statements) {
    for (const { colName, col } of parseColumnStatement(stmt)) {
      table[colName] = col;
    }
  }
}

function visitNode(node: ts.Node, result: SchemaColumnsByTable): void {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "createTable"
  ) {
    const parsed = parseCreateTable(node);
    if (parsed) {
      const { name, opts, arrowBody } = parsed;
      const table: Record<string, DumpColumnSchema> = Object.create(null);

      const pk = synthesizePk(opts);
      if (pk && pk !== "composite") {
        table["id"] = pk;
      }

      if (arrowBody) {
        walkBody(arrowBody, table);
      }

      result[name] = table;
    }
  }
  ts.forEachChild(node, (child) => visitNode(child, result));
}

export function parseSchemaTs(source: string, filePath: string): SchemaColumnsByTable {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const result: SchemaColumnsByTable = Object.create(null);
  visitNode(sourceFile, result);
  return result;
}
