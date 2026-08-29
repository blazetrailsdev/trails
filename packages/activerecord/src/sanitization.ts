import { Nodes, sql as arelSql } from "@blazetrails/arel";
import type { Quoting } from "./connection-adapters/abstract/quoting.js";
import { columnNameMatcher as abstractColumnNameMatcher } from "./connection-adapters/abstract/quoting.js";
import {
  ConnectionNotDefined,
  PreparedStatementInvalid,
  UnknownAttributeReference,
} from "./errors.js";

/** @internal */
export type Quoter = Pick<
  Quoting,
  "quote" | "quoteColumnName" | "quoteTableNameForAssignment" | "quoteString" | "castBoundValue"
>;

function _sanitizeSqlArray(
  withConnection: () => Quoter,
  template: string,
  binds: unknown[],
): string {
  const statement = template;
  const [first] = binds;

  if (isPlainHash(first) && /:\w+/.test(statement)) {
    return replaceNamedBindVariables(withConnection(), statement, first as Record<string, unknown>);
  }

  if (statement.includes("?")) {
    return replaceBindVariables(withConnection(), statement, binds);
  }

  if (statement === "") {
    raiseIfBindArityMismatch(statement, 0, binds.length);
    return statement;
  }

  const quoter = withConnection();
  const specifiers = statement.match(/%[sdi]/g) ?? [];
  if (specifiers.length > 0) {
    raiseIfBindArityMismatch(statement, specifiers.length, binds.length);
    const values = [...binds];
    return statement.replace(/%[sdi]/g, (spec) => {
      const value = values.shift();
      if (spec === "%s") return quoter.quoteString(String(value ?? ""));
      const text = String(value ?? "").trim();
      if (!/^[+-]?\d+$/.test(text)) {
        throw new PreparedStatementInvalid(
          `invalid value for %d bind variable (${String(value)}) in: ${statement}`,
        );
      }
      return String(parseInt(text, 10));
    });
  }

  raiseIfBindArityMismatch(statement, 0, binds.length);
  return statement;
}

/** @internal */
function _sanitizeSqlHashForAssignment(
  quoter: Quoter,
  attrs: Record<string, unknown>,
  table: string,
  typeForAttribute?: (
    name: string,
  ) => { cast?(v: unknown): unknown; serialize?(v: unknown): unknown } | undefined,
): string {
  return Object.entries(attrs)
    .map(([attr, value]) => {
      if (typeForAttribute) {
        const type = typeForAttribute(attr);
        if (type) {
          if (type.cast) value = type.cast(value);
          if (type.serialize) value = type.serialize(value);
        }
      }
      const col = table
        ? quoter.quoteTableNameForAssignment(table, attr)
        : quoter.quoteColumnName(attr);
      return `${col} = ${quoter.quote(value)}`;
    })
    .join(", ");
}

export function disallowRawSqlBang(
  this: { adapterClassSync(): unknown },
  args: (string | symbol | Nodes.Node)[],
  { permit }: { permit?: RegExp } = {},
): void {
  const columnMatcher =
    permit ??
    (this.adapterClassSync() as { columnNameMatcher(): RegExp } | null)?.columnNameMatcher() ??
    abstractColumnNameMatcher();
  const unexpected: string[] = [];
  for (const arg of args) {
    if (typeof arg === "symbol") continue;
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

export function sanitizeSqlLike(value: string, escapeChar: string = "\\"): string {
  if (escapeChar === "") return value;
  const escapedEsc = escapeChar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (escapeChar !== "%" && escapeChar !== "_") {
    return value.replace(new RegExp(`${escapedEsc}|[%_]`, "g"), (c) => escapeChar + c);
  }
  return value.replace(/[%_]/g, (c) => escapeChar + c);
}

export function sanitizeSql(
  this: { sanitizeSqlArray(template: string, ...binds: unknown[]): string },
  input: string | [string, ...unknown[]] | null | undefined,
): string | null {
  if (isBlankCondition(input)) return null;
  if (typeof input === "string") return input;
  const [template, ...binds] = input as [string, ...unknown[]];
  return this.sanitizeSqlArray(template, ...binds);
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
  connection?: unknown;
}

/** @internal */
function quoterFor(host: QuoterHost): Quoter {
  const conn = host.connection as Quoter | null | undefined;
  if (!conn || typeof conn.quote !== "function") throw new ConnectionNotDefined();
  return conn;
}

export function sanitizeSqlArray(this: QuoterHost, template: string, ...binds: unknown[]): string {
  return _sanitizeSqlArray(() => quoterFor(this), template, binds);
}

export function sanitizeSqlForConditions(
  this: QuoterHost & {
    sanitizeSql(input: string | [string, ...unknown[]] | null | undefined): string | null;
  },
  condition: string | [string, ...unknown[]] | null | undefined,
): string | null {
  if (isBlankCondition(condition)) return null;
  return this.sanitizeSql(condition);
}

export function sanitizeSqlForAssignment(
  this: QuoterHost & {
    tableName?: string;
    sanitizeSql(input: string | [string, ...unknown[]] | null | undefined): string | null;
    sanitizeSqlHashForAssignment(
      attrs: Record<string, unknown>,
      table: string,
      typeForAttribute?: (
        name: string,
      ) => { cast?(v: unknown): unknown; serialize?(v: unknown): unknown } | undefined,
    ): string;
  },
  assignments: string | [string, ...unknown[]] | Record<string, unknown>,
  defaultTableName: string = this.tableName ?? "",
): string {
  if (typeof assignments === "string") return assignments;
  if (Array.isArray(assignments)) return this.sanitizeSql(assignments) ?? "";
  return this.sanitizeSqlHashForAssignment(assignments, defaultTableName);
}

export function sanitizeSqlForOrder(
  this: QuoterHost & {
    adapterClassSync(): unknown;
    disallowRawSqlBang(args: (string | symbol | Nodes.Node)[], options?: { permit?: RegExp }): void;
    sanitizeSqlArray(template: string, ...binds: unknown[]): string;
  },
  condition: string | [string | Nodes.Node, ...unknown[]] | Nodes.Node,
): string | Nodes.Node | [string | Nodes.Node, ...unknown[]] {
  if (condition instanceof Nodes.Node) return condition;
  if (Array.isArray(condition)) {
    const first: unknown = condition[0];
    const firstText = first instanceof Nodes.SqlLiteral ? first.value : String(first);
    if (firstText.includes("?")) {
      const adapterClass = this.adapterClassSync() as {
        columnNameWithOrderMatcher(): RegExp;
      };
      this.disallowRawSqlBang([first as string | symbol | Nodes.Node], {
        permit: adapterClass.columnNameWithOrderMatcher(),
      });
      const sanitized = this.sanitizeSqlArray(firstText, ...condition.slice(1));
      return arelSql(sanitized);
    }
  }
  return condition;
}

export function sanitizeSqlHashForAssignment(
  this: QuoterHost,
  attrs: Record<string, unknown>,
  table: string,
  typeForAttribute?: (
    name: string,
  ) => { cast?(v: unknown): unknown; serialize?(v: unknown): unknown } | undefined,
): string {
  return _sanitizeSqlHashForAssignment(quoterFor(this), attrs, table, typeForAttribute);
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
function replaceBindVariables(connection: Quoter, statement: string, values: unknown[]): string {
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
function replaceNamedBindVariables(
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
  if (hasIdForDatabase(value)) {
    const cast = connection.castBoundValue(value.idForDatabase);
    return connection.quote(cast);
  }

  if (isEnumerable(value)) {
    const values = Array.from(value);
    if (values.length === 0) {
      const cast = connection.castBoundValue(null);
      return connection.quote(cast);
    }
    return values
      .map((v) => {
        const idVal = hasIdForDatabase(v) ? v.idForDatabase : v;
        const cast = connection.castBoundValue(idVal);
        return connection.quote(cast);
      })
      .join(",");
  }

  const cast = connection.castBoundValue(value);
  return connection.quote(cast);
}

function hasIdForDatabase(value: unknown): value is { idForDatabase: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Set) &&
    "idForDatabase" in value
  );
}

function isEnumerable(value: unknown): value is Iterable<unknown> {
  return Array.isArray(value) || value instanceof Set;
}

function isPlainHash(value: unknown): boolean {
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
