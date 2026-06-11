/**
 * SQL sanitization utilities.
 *
 * Mirrors: ActiveRecord::Sanitization
 */

import { Nodes, sql as arelSql } from "@blazetrails/arel";
import {
  quote as abstractQuote,
  quoteIdentifier as abstractQuoteIdentifier,
  quoteTableNameForAssignment as abstractQuoteTableNameForAssignment,
  quoteString as abstractQuoteString,
  castBoundValue as abstractCastBoundValue,
} from "./connection-adapters/abstract/quoting.js";
import type { Quoting } from "./connection-adapters/abstract/quoting-interface.js";
import {
  ConnectionNotDefined,
  PreparedStatementInvalid,
  UnknownAttributeReference,
} from "./errors.js";

/** Subset of {@link Quoting} the sanitization helpers need. @internal */
export type Quoter = Pick<
  Quoting,
  "quote" | "quoteIdentifier" | "quoteTableNameForAssignment" | "quoteString" | "castBoundValue"
>;

/**
 * Guarded no-connection fallback, used only by {@link quoterFor} when a model
 * class has no resolvable adapter (e.g. `connection` raises
 * `ConnectionNotDefined`). Every connected caller quotes through the live
 * adapter's quoter; this pins SQL-92 rules purely so sanitization can still
 * run before a connection is established. @internal
 */
const ABSTRACT_QUOTER: Quoter = {
  quote: (v) => abstractQuote(v),
  quoteIdentifier: (n) => abstractQuoteIdentifier(n),
  quoteTableNameForAssignment: (t, a) => abstractQuoteTableNameForAssignment(t, a),
  quoteString: (s) => abstractQuoteString(s),
  castBoundValue: (v) => abstractCastBoundValue(v),
};

/** @internal */
function _sanitizeSqlArray(quoter: Quoter, template: string, binds: unknown[]): string {
  const statement = template;
  const [first] = binds;

  if (isPlainHash(first) && /:\w+/.test(statement)) {
    return replaceNamedBindVariables(quoter, statement, first as Record<string, unknown>);
  }

  if (statement.includes("?")) {
    return replaceBindVariables(quoter, statement, binds);
  }

  if (statement === "") {
    raiseIfBindArityMismatch(statement, 0, binds.length);
    return statement;
  }

  // %s format string support (e.g., "name='%s' and id='%s'") — Rails:
  //   statement % values.collect { |v| connection.quote_string(v.to_s) }
  const formatStringCount = (statement.match(/%s/g) ?? []).length;
  if (formatStringCount > 0) {
    raiseIfBindArityMismatch(statement, formatStringCount, binds.length);
    const values = [...binds];
    return statement.replace(/%s/g, () => quoter.quoteString(String(values.shift() ?? "")));
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
      // Rails: type = type_for_attribute(attr); value = type.serialize(type.cast(value))
      if (typeForAttribute) {
        const type = typeForAttribute(attr);
        if (type) {
          if (type.cast) value = type.cast(value);
          if (type.serialize) value = type.serialize(value);
        }
      }
      // Rails sanitization.rb:112 — PG/SQLite drop the table prefix.
      const col = table
        ? quoter.quoteTableNameForAssignment(table, attr)
        : quoter.quoteIdentifier(attr);
      return `${col} = ${quoter.quote(value)}`;
    })
    .join(", ");
}

/**
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#disallow_raw_sql!
 */
export function disallowRawSqlBang(args: (string | symbol | Nodes.Node)[], permit?: RegExp): void {
  const columnMatcher =
    permit ?? /^(?:"?\w+"?\.)?"?\w+"?(?:\s+(?:ASC|DESC))?(?:\s+NULLS\s+(?:FIRST|LAST))?$/i;
  const unexpected: string[] = [];
  for (const arg of args) {
    if (typeof arg === "symbol") continue;
    if (arg instanceof Nodes.Node) continue;
    if (!columnMatcher.test(arg.toString().trim())) {
      unexpected.push(arg.toString());
    }
  }
  if (unexpected.length > 0) {
    throw new UnknownAttributeReference(
      `Dangerous query method (method whose arguments are used as raw SQL) ` +
        `called with non-attribute argument(s): ${unexpected.map((a) => `"${a}"`).join(", ")}`,
    );
  }
}

/**
 * Sanitize a string for use in a SQL LIKE clause.
 * Escapes %, _, and the escape character itself.
 *
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#sanitize_sql_like
 */
export function sanitizeSqlLike(value: string, escapeChar: string = "\\"): string {
  // Empty escape character: Rails inserts "" before each wildcard — net no-op.
  if (escapeChar === "") return value;
  // Rails inserts the escape character before each % and _ in a single pass.
  // When escapeChar is not itself a wildcard, it also escapes occurrences of
  // escapeChar in the string first (via the same single pattern union).
  // Using a single pass avoids double-escaping the prefix inserted for one
  // wildcard when the escape character happens to be the other wildcard.
  const escapedEsc = escapeChar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (escapeChar !== "%" && escapeChar !== "_") {
    return value.replace(new RegExp(`${escapedEsc}|[%_]`, "g"), (c) => escapeChar + c);
  }
  return value.replace(/[%_]/g, (c) => escapeChar + c);
}

/**
 * Dispatches through `this.sanitizeSqlArray`, so subclass overrides of
 * `sanitizeSqlArray` take effect — matching Rails'
 * `Sanitization::ClassMethods#sanitize_sql`, which calls `sanitize_sql_array`
 * via `self`.
 *
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#sanitize_sql
 */
export function sanitizeSql(
  this: { sanitizeSqlArray(template: string, ...binds: unknown[]): string },
  input: string | [string, ...unknown[]],
): string {
  if (typeof input === "string") return input;
  const [template, ...binds] = input;
  return this.sanitizeSqlArray(template, ...binds);
}

/** @internal */
interface QuoterHost {
  connection?: unknown;
}

/**
 * Resolves quoting via `connection`. Only `ConnectionNotDefined` triggers
 * fallback to the abstract quoter; other errors propagate. @internal
 */
function quoterFor(host: QuoterHost): Quoter {
  let conn: Quoter | null | undefined;
  try {
    conn = host.connection as Quoter | null | undefined;
  } catch (err) {
    if (!(err instanceof ConnectionNotDefined)) throw err;
  }
  if (!conn || typeof conn.quote !== "function") return ABSTRACT_QUOTER;
  return conn;
}

/**
 * Threads the active adapter as the quoter, matching Rails'
 * `connection.quote` dispatch.
 *
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#sanitize_sql_array
 */
export function sanitizeSqlArray(this: QuoterHost, template: string, ...binds: unknown[]): string {
  return _sanitizeSqlArray(quoterFor(this), template, binds);
}

/**
 * Dispatches through `this.sanitizeSql` (and therefore `this.sanitizeSqlArray`),
 * matching Rails' Ruby `self` dispatch through `ClassMethods`.
 *
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#sanitize_sql_for_conditions
 */
export function sanitizeSqlForConditions(
  this: QuoterHost & { sanitizeSql(input: string | [string, ...unknown[]]): string },
  condition: string | [string, ...unknown[]] | null | undefined,
): string | null {
  if (!condition || (typeof condition === "string" && condition.trim() === "")) return null;
  return this.sanitizeSql(condition);
}

/**
 * Dispatches the `Array` case through `this.sanitizeSql` — matching Rails'
 * self dispatch from `sanitize_sql_for_assignment` → `sanitize_sql_array`.
 *
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#sanitize_sql_for_assignment
 */
export function sanitizeSqlForAssignment(
  this: QuoterHost & {
    tableName?: string;
    sanitizeSql(input: string | [string, ...unknown[]]): string;
    sanitizeSqlHashForAssignment(
      attrs: Record<string, unknown>,
      table: string,
      typeForAttribute?: (
        name: string,
      ) => { cast?(v: unknown): unknown; serialize?(v: unknown): unknown } | undefined,
    ): string;
  },
  // Rails defaults `default_table_name` to the model's `table_name`
  // (sanitization.rb:68); an explicitly-passed value still wins.
  assignments: string | [string, ...unknown[]] | Record<string, unknown>,
  defaultTableName: string = this.tableName ?? "",
): string {
  if (typeof assignments === "string") return assignments;
  if (Array.isArray(assignments)) return this.sanitizeSql(assignments);
  return this.sanitizeSqlHashForAssignment(assignments, defaultTableName);
}

/**
 * Dispatches `disallowRawSqlBang` and `sanitizeSqlArray` through `this` —
 * matching Rails' self dispatch.
 *
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#sanitize_sql_for_order
 */
export function sanitizeSqlForOrder(
  this: {
    disallowRawSqlBang(args: (string | symbol | Nodes.Node)[], permit?: RegExp): void;
    sanitizeSqlArray(template: string, ...binds: unknown[]): string;
  },
  condition: string | [string, ...unknown[]] | Nodes.Node,
): string | Nodes.Node {
  if (condition instanceof Nodes.Node) return condition;
  if (Array.isArray(condition) && condition[0]?.toString().includes("?")) {
    // Rails checks the *raw* first element (sanitization.rb:85-88), so Arel
    // nodes (`Arel.sql("field(id, ?)")`) are permitted — `disallowRawSqlBang`
    // skips Node instances — and only the bind-substituted result is returned.
    // Checking the post-substitution string here would reject those forms.
    this.disallowRawSqlBang([condition[0]]);
    const sanitized = this.sanitizeSqlArray(condition[0], ...condition.slice(1));
    return arelSql(sanitized);
  }
  return typeof condition === "string" ? condition : condition[0];
}

/**
 * Uses the active adapter as the quoter — so `Model.sanitizeSqlHashForAssignment`
 * emits dialect-correct identifiers (backticks on MySQL).
 *
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#sanitize_sql_hash_for_assignment
 */
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

/**
 * Module methods wired onto Base as static methods via `extend()` in base.ts.
 * Mirrors Rails' `ActiveRecord::Sanitization::ClassMethods`.
 */
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

/**
 * Replace `?` placeholders with quoted bind variable values.
 * Called by sanitizeSqlArray when positional binds are present.
 *
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#replace_bind_variables
 *
 * @internal
 */
function replaceBindVariables(quoter: Quoter, statement: string, values: unknown[]): string {
  raiseIfBindArityMismatch(statement, statement.match(/\?/g)?.length ?? 0, values.length);
  const bound = [...values];
  let result = statement;
  result = result.replace(/\?/g, () => replaceBindVariable(quoter, bound.shift()));
  return result;
}

/**
 * Quote a single bind variable value.
 * Handles Relation objects (converts to SQL) and complex values (arrays, etc).
 *
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#replace_bind_variable
 *
 * @internal
 */
function replaceBindVariable(quoter: Quoter, value: unknown): string {
  return quoteBoundValue(quoter, value);
}

/**
 * Replace named bind variables (`:name` syntax) with quoted values.
 * Handles PostgreSQL type casts (`::`) and escaped colons.
 *
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#replace_named_bind_variables
 *
 * @internal
 */
function replaceNamedBindVariables(
  quoter: Quoter,
  statement: string,
  bindVars: Record<string, unknown>,
): string {
  let result = statement;
  result = result.replace(
    /([:\\]?):([a-zA-Z]\w*)/g,
    (match: string, prefix: string, name: string) => {
      if (prefix === ":") {
        // PostgreSQL type cast like `::type` — return unchanged
        return match;
      } else if (prefix === "\\") {
        // Escaped literal colon — return without the backslash
        return match.slice(1);
      } else {
        // Named bind variable
        if (!Object.prototype.hasOwnProperty.call(bindVars, name)) {
          throw new PreparedStatementInvalid(`missing value for :${name} in ${statement}`);
        }
        return replaceBindVariable(quoter, bindVars[name]);
      }
    },
  );
  return result;
}

/**
 * Quote a single value for use in SQL.
 * Handles arrays and Sets (converts to comma-separated quoted values),
 * objects with `id_for_database` method, and primitive values.
 *
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#quote_bound_value
 *
 * @internal
 */
function quoteBoundValue(quoter: Quoter, value: unknown): string {
  if (hasIdForDatabase(value)) {
    const cast = quoter.castBoundValue(value.idForDatabase());
    return quoter.quote(cast);
  }

  // Handle collections recognized by isEnumerable (Array and Set only).
  // Rails uses respond_to?(:map) and !acts_like?(:string), but this
  // implementation intentionally limits support to those two collection
  // types and does not expand arbitrary iterables (Buffer/Map/etc).
  if (isEnumerable(value)) {
    const values = Array.from(value as Iterable<unknown>);
    if (values.length === 0) {
      const cast = quoter.castBoundValue(null);
      return quoter.quote(cast);
    }
    return values
      .map((v) => {
        const idVal = hasIdForDatabase(v) ? v.idForDatabase() : v;
        const cast = quoter.castBoundValue(idVal);
        return quoter.quote(cast);
      })
      .join(",");
  }

  const cast = quoter.castBoundValue(value);
  return quoter.quote(cast);
}

function hasIdForDatabase(value: unknown): value is { idForDatabase(): unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Set) &&
    typeof (value as { idForDatabase?: unknown }).idForDatabase === "function"
  );
}

/**
 * Check if a value is enumerable (Array or Set).
 * Rails uses respond_to?(:map) and !acts_like?(:string) which includes
 * Array, Range, Set, and other Enumerable types. JS approximation:
 * accepts only Array and Set so we don't accidentally expand strings,
 * Buffers, Maps, or arbitrary iterables that aren't collections of
 * scalar bind values.
 */
function isEnumerable(value: unknown): value is Iterable<unknown> {
  return Array.isArray(value) || value instanceof Set;
}

/** True for plain JS objects (Object.prototype or null proto), matching Ruby Hash semantics. */
function isPlainHash(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Validate that the number of bind variables matches the number of placeholders.
 *
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#raise_if_bind_arity_mismatch
 *
 * @internal
 */
function raiseIfBindArityMismatch(statement: string, expected: number, provided: number): void {
  if (expected !== provided) {
    throw new PreparedStatementInvalid(
      `wrong number of bind variables (${provided} for ${expected}) in: ${statement}`,
    );
  }
}
