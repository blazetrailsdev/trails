/**
 * Ruby constants whose hand-ported trails export carries a `Type` suffix, keyed
 * by the fully qualified Ruby name, so generated code imports the name the hand
 * port exports. The bare names collide in JS: `String`, `Boolean`, `Date`,
 * `Float`, `Integer` and `Time` shadow globals or core classes every type file
 * also needs, and PostgreSQL's `OID::Range` shares its file with the bounds value
 * `Range`.
 */
export const TS_CONSTANT_RENAMES: Record<string, string> = {
  "ActiveModel::Type::Value": "ValueType",
  "ActiveModel::Type::BigInteger": "BigIntegerType",
  "ActiveModel::Type::Binary": "BinaryType",
  "ActiveModel::Type::Boolean": "BooleanType",
  "ActiveModel::Type::Date": "DateType",
  "ActiveModel::Type::DateTime": "DateTimeType",
  "ActiveModel::Type::Decimal": "DecimalType",
  "ActiveModel::Type::Float": "FloatType",
  "ActiveModel::Type::ImmutableString": "ImmutableStringType",
  "ActiveModel::Type::Integer": "IntegerType",
  "ActiveModel::Type::String": "StringType",
  "ActiveModel::Type::Time": "TimeType",
  "ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Range": "RangeType",
};

/**
 * The {@link TS_CONSTANT_RENAMES} key a Ruby constant reference resolves to, or
 * undefined. `ref` is resolved the way Ruby resolves a constant: against each
 * lexical scope of `nesting` (innermost first), then as written. A qualified
 * reference no scope resolves (`Type::Value` inside `ActiveRecord::Type`, which
 * aliases ActiveModel's) falls back to the one key it is a `::`-suffix of; a bare
 * name that no scope resolves is a top-level constant and never does.
 */
export function tsConstantRenameKey(ref: string, nesting = ""): string | undefined {
  const bare = ref.replace(/^::/, "");
  if (ref.startsWith("::")) return bare in TS_CONSTANT_RENAMES ? bare : undefined;
  const scopes = nesting.split("::").filter(Boolean);
  for (let i = scopes.length; i >= 0; i--) {
    const key = [...scopes.slice(0, i), bare].join("::");
    if (key in TS_CONSTANT_RENAMES) return key;
  }
  if (!bare.includes("::")) return undefined;
  const suffixed = Object.keys(TS_CONSTANT_RENAMES).filter((k) => k.endsWith(`::${bare}`));
  return suffixed.length === 1 ? suffixed[0] : undefined;
}
