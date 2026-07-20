import type { ArelConnection } from "./visitors/connection.js";
import { rubyClassName } from "./visitors/ruby-class.js";
import { BinaryData } from "@blazetrails/activemodel";
import { BigDecimal } from "@blazetrails/activesupport";

/** The slice of the connection an array element's `type_cast` needs. */
export type ArrayElementQuoter = Pick<ArelConnection, "unquotedTrue" | "unquotedFalse">;

/**
 * Type-casts an element to the text `PG::TextEncoder::Array` would be handed,
 * i.e. the BARE content — the encoder decides `"..."` quoting from that text.
 * Returning `undefined` falls through to the default handling. Offered every
 * element except nested arrays (which recurse first), mirroring how Rails'
 * `type_cast_array` dispatches all non-array elements into `type_cast`
 * (`postgresql/quoting.rb:221-226`). Lets a caller that owns a dialect's
 * formatting give array elements what the same value gets on the scalar path.
 */
export type FormatArrayElement = (value: unknown) => string | undefined;

// `PG::TextEncoder::Array` quotes on content, never on type: an element is
// wrapped only when leaving it bare would be ambiguous — empty, `NULL`
// (case-insensitively), or carrying the `,` delimiter, whitespace, quote or
// backslash. Anything else is emitted bare, so `["a"]` encodes to `{a}`.
// Whitespace is spelled out rather than `\s` because pg tests bytes with
// `isspace()`, which excludes the non-ASCII spaces `\s` would match.
//
// ruby-pg reads the delimiter from `this->delimiter`, which Rails threads in
// via `OID::Array#initialize(subtype, delimiter = ",")` (`oid/array.rb:15`).
// It is hardcoded here because there is nothing to thread: Rails' PG `quote`
// only encodes an `OID::Array::Data` (`postgresql/quoting.rb:117`) and sends a
// bare `::Array` to `super`, which raises TypeError — whereas this function is
// reached with a bare JS array, carrying no subtype and so no delimiter. `,`
// is the default and the only reachable value on this path, not a
// simplification of a parameter we could honour.
const ELEMENT_NEEDS_QUOTING = /[{},"\\ \t\n\r\v\f]/;
// `/i` on a non-unicode pattern folds ASCII only, mirroring pg's
// `pg_strcasecmp(ptr, "NULL")`; `toUpperCase()` would be a Unicode-aware fold,
// a wider net than pg casts. The difference is unobservable by construction —
// no codepoint in all of Unicode uppercases to `N`, `U` or `L`, so no input
// can tell the two apart, and no test can guard this. It stays a regex because
// it's the exact mirror, not because a collision is reachable.
const NULL_LITERAL = /^null$/i;

function encodeArrayElement(text: string | null): string {
  // Rendering nil as the bare `NULL` token is the encoder's job, not
  // `type_cast`'s — the latter returns nil unchanged (`when nil, Numeric,
  // String then value`, `abstract/quoting.rb:101`). Keeping the split here is
  // what makes the `"NULL"` string quotable while real nil stays bare.
  if (text === null) return "NULL";
  if (text === "" || NULL_LITERAL.test(text) || ELEMENT_NEEDS_QUOTING.test(text)) {
    return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return text;
}

function typeCastArrayElement(
  value: unknown,
  connection: ArrayElementQuoter,
  formatElement?: FormatArrayElement,
): string | null {
  const formatted = formatElement?.(value);
  if (formatted !== undefined) return formatted;
  // boundary: JS has no nil/undefined distinction to port — Rails' type_cast
  // takes nil through `when nil` and raises TypeError on anything unmapped.
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return String(value);
  // `when true then unquoted_true` / `when false then unquoted_false`
  // (`abstract/quoting.rb:94-107`) — NOT the `quoted_true`/`quoted_false` pair
  // `quote` uses (`:166-180`). PG inherits Ruby true/false, so this yields the
  // bare `true` encodeArrayElement then leaves unquoted; MySQL and SQLite
  // override the pair to 1/0.
  if (typeof value === "boolean")
    return String(value ? connection.unquotedTrue() : connection.unquotedFalse());
  // Ruby has no fixnum/bignum split at this layer — a bigint is Numeric too.
  if (typeof value === "bigint") return String(value);
  if (typeof value === "string") return value;
  // `when Symbol, ActiveSupport::Multibyte::Chars, Type::Binary::Data then
  // value.to_s` (`abstract/quoting.rb:95-96`). `Multibyte::Chars` has no trails
  // analogue — JS strings are already the wrapped form — so the arm is the
  // other two. `String(data)` is `Data#to_s`: its `toString()` decodes bytes.
  if (value instanceof BinaryData) return String(value);
  // Same arm: Ruby's `Symbol#to_s` is the bare name, which `description` is
  // the analogue of. Ruby has no descriptionless Symbol, so the `?? ""` is
  // unreachable by construction (only `Symbol()` produces it here) rather than
  // a port of an empty-name arm.
  if (typeof value === "symbol") return value.description ?? "";
  // `when BigDecimal then value.to_s("F")` (`abstract/quoting.rb:99`) — the
  // non-normalized fixed form, not the default `to_s`. Same arm as the sibling
  // port in
  // packages/activerecord/src/connection-adapters/abstract/quoting.ts:194.
  if (value instanceof BigDecimal) return value.toString("F");
  // `else raise TypeError, "can't cast #{value.class.name}"`
  // (`abstract/quoting.rb:105`). Everything Rails' closed set does not name
  // raises here rather than being JSON- or String-encoded.
  //
  // That includes the two remaining arms, `when Type::Time::Value then
  // quoted_time` and `when Date, Time then quoted_date` (`:102-103`), which are
  // self-dispatches onto the connection. `ArelConnection` (visitors/
  // connection.ts) carries no `quotedDate`/`quotedTime` to dispatch onto —
  // Rails' Arel does no value formatting, so those live on the adapter — which
  // is exactly what `formatElement` exists to supply: the only caller,
  // `postgresqlDefaultQuoter.quote` (visitors/default-quoter.ts:231), routes
  // date-likes through its `quotedDate` before the value reaches here. A
  // Temporal value (trails' `Type::Time::Value` analogue) has no `toISOString`
  // and so is NOT covered by that hook; it raises here rather than silently
  // encoding, which is what the pre-convergence fallback did to it (an object
  // with no `toISOString` fell to `JSON.stringify`, i.e. `{}`). Giving the
  // connection-less quoter a real `quotedTime` is adapter work, not this
  // function's.
  throw new TypeError(`can't cast ${rubyClassName(value) ?? classNameOf(value)}`);
}

// Rails is unconditionally `value.class.name`. `constructor.name` is the
// analogue; the `"Object"` last resort is for a null-prototype object, which
// has no constructor — and is unreachable here because `rubyClassName` already
// claims those as `Hash`. It exists so the template can never read `undefined`.
function classNameOf(value: unknown): string {
  const named = (value as { constructor?: { name?: unknown } })?.constructor?.name;
  return typeof named === "string" && named !== "" ? named : "Object";
}

/**
 * Formats a JS array as a PostgreSQL array literal string (without outer single quotes).
 * e.g. ["a", "b"] => {a,b}
 *
 * Shared between the Arel PostgreSQL visitor and ActiveRecord's inline SQL quoting.
 */
export function quoteArrayLiteral(
  arr: unknown[],
  connection: ArrayElementQuoter,
  formatElement?: FormatArrayElement,
): string {
  const elements = arr.map((v) => {
    // Nested arrays recurse before the hook, per `type_cast_array`'s
    // `when ::Array` arm; every other element is offered to it uniformly,
    // as Rails dispatches all non-array elements into `type_cast`.
    if (Array.isArray(v)) return quoteArrayLiteral(v, connection, formatElement);
    return encodeArrayElement(typeCastArrayElement(v, connection, formatElement));
  });
  return `{${elements.join(",")}}`;
}
