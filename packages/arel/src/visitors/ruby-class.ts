import { temporalClassName, temporalTag } from "../temporal-tag.js";

/**
 * The Ruby class name `Visitor#visit` would dispatch a raw value on.
 *
 * Rails gets this for free: `dispatch[object.class]` (visitor.rb:29) reads the
 * runtime class off any object, and `dispatch_cache` (visitor.rb:17-21) turns
 * it into `:"visit_#{klass.name}"`. JS primitives have no such class, so this
 * function is the missing half of `object.class` — it names the Ruby class a
 * value would have had, and `Visitor#visit` turns that name into `visit<Name>`.
 *
 * Returns `null` for values that dispatch on their JS constructor instead
 * (every Arel node, ActiveModel::Attribute, and any other real class), which
 * is the dispatch path `Visitor#visit` tries first.
 */
export function rubyClassName(v: unknown): string | null {
  // Not a Node and not importable here (SelectManager → ToSql → SelectManager
  // is circular), so it is recognised by shape. Rails dispatches it on its
  // real class to `visit_Arel_SelectManager` (to_sql.rb:106).
  if (v !== null && typeof v === "object" && "ast" in v && "toSql" in v) {
    return "ArelSelectManager";
  }
  if (Array.isArray(v)) return "Array";
  if (typeof v === "number") {
    // Ruby splits Integer (renders, to_sql.rb:824) from Float (raises,
    // rb:839); `Number.isInteger` is that split. A non-finite number is never
    // integral, so it lands on Float and raises, as Rails' Float does.
    return Number.isInteger(v) ? "Integer" : "Float";
  }
  // Ruby has no fixnum/bignum distinction at this layer — both are Integer.
  if (typeof v === "bigint") return "Integer";
  if (v === null || v === undefined) return "NilClass";
  if (typeof v === "string") return "String";
  if (typeof v === "boolean") return v ? "TrueClass" : "FalseClass";
  if (typeof v === "symbol") return "Symbol";
  const dateTime = dateTimeClassName(v);
  if (dateTime !== null) return dateTime;
  if (isPlainObject(v)) return "Hash";
  return null;
}

// The analogue of Ruby's Hash — an object literal, i.e. one whose prototype is
// Object.prototype (or null). Anything else is an instance of some other class
// and dispatches on that class in Rails, not on Hash.
function isPlainObject(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

// The Ruby class Rails would dispatch a date/time value on, all three of which
// Rails aliases to `unsupported` (to_sql.rb:836-844). Temporal is the Time/Date
// analogue in this codebase and Temporal types expose no `toISOString`, so they
// match on their tag via the shared whitelist; a JS Date (or any toISOString
// duck-type) is an instant-in-time and maps to Time.
//
// Only the whitelisted tags answer: `Duration`, `PlainYearMonth` and
// `PlainMonthDay` have no Ruby analogue and so fall through to the same
// no-visitable-ancestor path an arbitrary object takes, rather than being
// mislabelled as a Time.
function dateTimeClassName(v: unknown): string | null {
  const temporalClass = temporalClassName(v);
  if (temporalClass !== null) return temporalClass;
  if (temporalTag(v) !== null) return null;
  const isInstantDuckType =
    typeof v === "object" &&
    v !== null &&
    "toISOString" in v &&
    typeof (v as { toISOString: unknown }).toISOString === "function";
  return isInstantDuckType ? "Time" : null;
}
