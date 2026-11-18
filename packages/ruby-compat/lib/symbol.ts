/**
 * Ruby's `Symbol` (`vendor/ruby/v3.3.11/symbol.c`) as trails spells it: a JS string
 * that KEEPS its leading colon (`":short"`). A JS `Symbol` is reserved for
 * private keys and brands, so the colon is what carries the discriminator Ruby
 * gets from the type — and it is how the value already renders through
 * `Symbol#inspect` (`vendor/ruby/v3.3.11/string.c:11692` `sym_inspect`, which writes
 * the colon back in front of the name).
 *
 * Three members, because three questions are asked of the convention across
 * the tree: is this value a Symbol, what is its name, and which Ruby method
 * name a trails member name spells.
 */

/**
 * Ruby `Symbol === x` — the type test a `case`/`when Symbol` makes
 * (`vendor/ruby/v3.3.11/symbol.c:954` `rb_sym2str` is what answers for one), spelled
 * against the colon convention above.
 *
 * Call sites: `i18n/lib/backend/base.ts`, `backend/fallbacks.ts`,
 * `backend/simple.ts`, `backend/key-value.ts`,
 * `activemodel/lib/validations/numericality.ts`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Symbol`, which Rails inherits
 * rather than defines.
 */
export function isSymbol(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(":");
}

/**
 * Ruby `Symbol#to_s` / `Symbol#name` — `vendor/ruby/v3.3.11/symbol.c:954` `rb_sym2str`,
 * the frozen string representation NOT including the leading colon.
 *
 * Call sites: `i18n/lib/backend/base.ts`'s `toS` and its `t()` key
 * interpolation.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Symbol#to_s`, which Rails inherits
 * rather than defines.
 */
export function symbolToS(sym: string): string {
  return sym.slice(1);
}

/**
 * `String#to_sym` (`vendor/ruby/v3.3.11/symbol.c:862` `rb_str_intern`): the
 * Symbol is the string with its leading colon.
 *
 * @noRailsEquivalent PERMANENT
 */
export function stringToSym(value: string): string {
  return value.startsWith(":") ? value : `:${value}`;
}

/** @noRailsEquivalent PERMANENT */
export const PLURAL_PREDICATE_ALIAS_ROWS: ReadonlyArray<readonly [string, string]> = [
  ["active_connections?", "hasActiveConnections"],
  ["active_workers?", "hasActiveWorkers"],
  ["any_changes?", "hasAnyChanges"],
  ["attachments?", "hasAttachments"],
  ["database_tasks?", "hasDatabaseTasks"],
  ["default_scopes?", "hasDefaultScopes"],
  ["duplicates?", "hasDuplicates"],
  ["eligible_waiters?", "hasEligibleWaiters"],
  ["grouped_choices?", "hasGroupedChoices"],
  ["many_workers?", "hasManyWorkers"],
  ["nested_attributes?", "hasNestedAttributes"],
  ["prepared_statements?", "hasPreparedStatements"],
  ["record_timestamps?", "hasRecordTimestamps"],
  ["resources?", "hasResources"],
  ["routes?", "hasRoutes"],
  ["saved_changes?", "hasSavedChanges"],
  ["scope_attributes?", "hasScopeAttributes"],
  ["seeds?", "hasSeeds"],
];

const PLURAL_PREDICATE_RUBY_NAMES = new Map(
  PLURAL_PREDICATE_ALIAS_ROWS.map(([ruby, ts]) => [ts, ruby] as const),
);

const OPERATOR_METHOD_NAMES: Record<string, string> = {
  compareTo: "<=>",
  equals: "==",
  caseEquals: "===",
  plus: "+",
  minus: "-",
  multiply: "*",
  divide: "/",
  matchOperator: "=~",
  notMatchOperator: "!~",
  append: "<<",
  uplus: "+@",
  uminus: "-@",
  negate: "-@",
  toString: "to_s",
  toJSON: "to_json",
};

/** @noRailsEquivalent PERMANENT */
export function rbMethodName(name: string): string {
  const operator = OPERATOR_METHOD_NAMES[name];
  if (operator !== undefined) return operator;
  const plural = PLURAL_PREDICATE_RUBY_NAMES.get(name);
  if (plural !== undefined) return plural;
  const snake = (camel: string): string =>
    camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).replace(/^_/, "");
  if (/^is[A-Z]/.test(name)) return `${snake(name.slice(2))}?`;
  if (/^(has|supports|can|should|needs|includes|responds|allows|uses)[A-Z]/.test(name)) {
    return `${snake(name)}?`;
  }
  if (/[a-z]Bang$/.test(name)) return `${snake(name.slice(0, -4))}!`;
  return snake(name);
}
