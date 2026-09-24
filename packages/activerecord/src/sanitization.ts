import { Nodes, sql as arelSql } from "@blazetrails/arel";
import { ActsLikeObject, isBlank } from "@blazetrails/activesupport";
import { format, rbObjAsString, rbObjRespondTo } from "@blazetrails/ruby-compat";
import type { Quoting } from "./connection-adapters/abstract/quoting.js";
import { PreparedStatementInvalid, UnknownAttributeReference } from "./errors.js";

/** @internal */
export type Quoter = Pick<
  Quoting,
  "quote" | "quoteColumnName" | "quoteTableNameForAssignment" | "quoteString" | "castBoundValue"
>;

export function disallowRawSqlBang(
  this: { adapterClass(): unknown },
  args: (string | symbol | Nodes.Node)[],
  { permit }: { permit?: RegExp } = {},
): void {
  const columnMatcher =
    permit ?? (this.adapterClass() as { columnNameMatcher(): RegExp }).columnNameMatcher();
  const unexpected: string[] = [];
  for (const arg of args) {
    if (typeof arg === "symbol" || (typeof arg === "string" && arg.startsWith(":"))) continue;
    if (arg instanceof Nodes.Node) continue;
    const str = arg == null ? "" : arg.toString();
    if (!columnMatcher.test(str.trim())) {
      unexpected.push(str);
    }
  }
  if (unexpected.length > 0) {
    throw new UnknownAttributeReference(
      `Dangerous query method (method whose arguments are used as raw SQL) ` +
        `called with non-attribute argument(s): ${unexpected.map((a) => `"${a}"`).join(", ")}`,
    );
  }
}

export function sanitizeSqlLike(string: string, escapeCharacter: string = "\\"): string {
  if (escapeCharacter === "") return string;
  const escapedEsc = escapeCharacter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (escapeCharacter !== "%" && escapeCharacter !== "_") {
    return string.replace(new RegExp(`${escapedEsc}|[%_]`, "g"), (c) => escapeCharacter + c);
  }
  return string.replace(/[%_]/g, (c) => escapeCharacter + c);
}

export function sanitizeSql(
  this: { sanitizeSqlArray(ary: [string, ...unknown[]]): string },
  condition: string | [string, ...unknown[]] | null | undefined,
): string | null {
  if (isBlankCondition(condition)) return null;
  if (Array.isArray(condition)) {
    return this.sanitizeSqlArray(condition);
  } else {
    return condition as string;
  }
}

/** @internal */
function isBlankCondition(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** @internal */
interface QuoterHost {
  connectionPool(): { withConnectionSync<T>(block: (connection: Quoter) => T): T };
}

export function sanitizeSqlArray(this: QuoterHost, ary: [string, ...unknown[]]): string {
  const [statement, ...values] = ary;
  if (isPlainHash(values[0]) && statement.match(/:\w+/) != null) {
    return this.connectionPool().withConnectionSync((c) =>
      replaceNamedBindVariables(c, statement, values[0] as Record<string, unknown>),
    );
  } else if (statement.includes("?")) {
    return this.connectionPool().withConnectionSync((c) =>
      replaceBindVariables(c, statement, values),
    );
  } else if (isBlank(statement)) {
    return statement;
  } else {
    return this.connectionPool().withConnectionSync((c) =>
      format(statement, ...values.map((value) => c.quoteString(rbObjAsString(value)))),
    );
  }
}

export function sanitizeSqlForConditions(
  this: QuoterHost & {
    sanitizeSql(condition: string | [string, ...unknown[]] | null | undefined): string | null;
  },
  condition: string | [string, ...unknown[]] | null | undefined,
): string | null {
  if (isBlankCondition(condition)) return null;
  return this.sanitizeSql(condition);
}

export function sanitizeSqlForAssignment(
  this: QuoterHost & {
    tableName?: string;
    sanitizeSqlArray(ary: [string, ...unknown[]]): string;
    sanitizeSqlHashForAssignment(attrs: Record<string, unknown>, table: string): string;
  },
  assignments: string | [string, ...unknown[]] | Record<string, unknown>,
  defaultTableName: string = this.tableName ?? "",
): string {
  if (Array.isArray(assignments)) {
    return this.sanitizeSqlArray(assignments);
  } else if (isPlainHash(assignments)) {
    return this.sanitizeSqlHashForAssignment(assignments, defaultTableName);
  } else {
    return assignments;
  }
}

export function sanitizeSqlForOrder(
  this: QuoterHost & {
    adapterClass(): unknown;
    disallowRawSqlBang(args: (string | symbol | Nodes.Node)[], options?: { permit?: RegExp }): void;
    sanitizeSqlArray(ary: [string, ...unknown[]]): string;
  },
  condition: string | [string | Nodes.Node, ...unknown[]] | Nodes.Node,
): string | Nodes.Node | [string | Nodes.Node, ...unknown[]] {
  if (condition instanceof Nodes.Node) return condition;
  if (Array.isArray(condition)) {
    const first: unknown = condition[0];
    const firstText = first instanceof Nodes.SqlLiteral ? first.value : String(first);
    if (firstText.includes("?")) {
      const adapterClass = this.adapterClass() as {
        columnNameWithOrderMatcher(): RegExp;
      };
      this.disallowRawSqlBang([first as string | symbol | Nodes.Node], {
        permit: adapterClass.columnNameWithOrderMatcher(),
      });
      const sanitized = this.sanitizeSqlArray([firstText, ...condition.slice(1)]);
      return arelSql(sanitized);
    }
  }
  return condition;
}

export function sanitizeSqlHashForAssignment(
  this: QuoterHost & {
    typeForAttribute(
      name: string,
    ): { cast(v: unknown): unknown; serialize(v: unknown): unknown } | null;
  },
  attrs: Record<string, unknown>,
  table: string,
): string {
  return this.connectionPool().withConnectionSync((c) =>
    Object.entries(attrs)
      .map(([attr, value]) => {
        const type = this.typeForAttribute(attr)!;
        value = type.serialize(type.cast(value));
        return `${c.quoteTableNameForAssignment(table, attr)} = ${c.quote(value)}`;
      })
      .join(", "),
  );
}

export const ClassMethods = {
  sanitizeSql,
  sanitizeSqlArray,
  sanitizeSqlLike,
  sanitizeSqlForConditions,
  sanitizeSqlForAssignment,
  sanitizeSqlForOrder,
  sanitizeSqlHashForAssignment,
  disallowRawSqlBang,
};

/** @internal */
export function replaceBindVariables(
  connection: Quoter,
  statement: string,
  values: unknown[],
): string {
  raiseIfBindArityMismatch(statement, statement.match(/\?/g)?.length ?? 0, values.length);
  const bound = [...values];
  let result = statement;
  result = result.replace(/\?/g, () => replaceBindVariable(connection, bound.shift()));
  return result;
}

/** @internal */
function replaceBindVariable(connection: Quoter, value: unknown): string {
  if (isRelationLike(value)) {
    return (value as { toSql(): string }).toSql();
  }
  return quoteBoundValue(connection, value);
}

function isRelationLike(value: unknown): value is { toSql(): string } {
  return (
    value != null &&
    typeof (value as { toSql?: unknown }).toSql === "function" &&
    typeof (value as { toArray?: unknown }).toArray === "function"
  );
}

/** @internal */
export function replaceNamedBindVariables(
  connection: Quoter,
  statement: string,
  bindVars: Record<string, unknown>,
): string {
  let result = statement;
  result = result.replace(
    /([:\\]?):([a-zA-Z]\w*)/g,
    (match: string, prefix: string, name: string) => {
      if (prefix === ":") {
        return match;
      } else if (prefix === "\\") {
        return match.slice(1);
      } else {
        if (!Object.prototype.hasOwnProperty.call(bindVars, name)) {
          throw new PreparedStatementInvalid(`missing value for :${name} in ${statement}`);
        }
        return replaceBindVariable(connection, bindVars[name]);
      }
    },
  );
  return result;
}

/** @internal */
function quoteBoundValue(connection: Quoter, value: unknown): string {
  if (rbObjRespondTo(value, "map") && !ActsLikeObject.actsLike(value, "string")) {
    const values = (value as { map<R>(b: (v: unknown) => R): R[] }).map((v) =>
      rbObjRespondTo(v, "idForDatabase") ? (v as { idForDatabase: unknown }).idForDatabase : v,
    );
    if (values.length === 0) {
      return connection.quote(connection.castBoundValue(null));
    } else {
      return values.map((v) => connection.quote(connection.castBoundValue(v))).join(",");
    }
  } else {
    if (rbObjRespondTo(value, "idForDatabase")) {
      value = (value as { idForDatabase: unknown }).idForDatabase;
    }
    return connection.quote(connection.castBoundValue(value));
  }
}

function isPlainHash(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** @internal */
function raiseIfBindArityMismatch(statement: string, expected: number, provided: number): void {
  if (expected !== provided) {
    throw new PreparedStatementInvalid(
      `wrong number of bind variables (${provided} for ${expected}) in: ${statement}`,
    );
  }
}
