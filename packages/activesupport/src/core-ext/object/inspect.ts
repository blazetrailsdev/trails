/**
 * Ruby's `Object#inspect` / `Object#to_s`, which trails has no other way to
 * spell: JS `String(x)` is `to_s` for a JS value, which for a nested Array is
 * the comma-joined form and for a plain object is `[object Object]`.
 *
 * These are core Ruby, not Rails, but every body that needs them lives in
 * ActiveSupport, and this file sits next to `blank.ts` — the same place the
 * `Object#blank?` dispatch went — so the next caller finds one implementation
 * rather than writing a third private copy.
 *
 * Ruby dispatches per class; TypeScript cannot reopen `Array`/`Hash`, so the
 * arms are a switch on the value class here, in the order Ruby's own overrides
 * matter: `Array#inspect`, `Hash#inspect`, `String#inspect`, `NilClass#inspect`
 * and `Object#inspect` (which is `to_s` for everything else).
 */

/**
 * A JS object literal is trails' Ruby `Hash`; a class instance is a plain Ruby
 * object, which renders through its own `to_s` rather than as a brace-wrapped
 * pair list. Mirrors the same distinction `blank.ts` draws.
 */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * A Ruby Symbol is a JS string carrying its leading colon (see CLAUDE.md), and
 * `:b.inspect` is `":b"` — the colon is already the rendering, so the string is
 * emitted bare rather than quoted.
 */
const SYMBOL_RE = /^:[A-Za-z_][A-Za-z0-9_]*[?!=]?$/;

/**
 * Ruby `Object#inspect` — `[1, [2, "a"], {:b=>3}, nil]` for
 * `[1, [2, "a"], {b: 3}, nil]`, verified against MRI 3.3.
 *
 * The default arm is `to_s`, not Ruby's `#<Foo:0x… @a=1>`: reproducing that
 * needs an object id JS does not expose. Both callers hand this plain data
 * structures only, so the arm is unreached today — a caller that does pass a
 * class instance gets its `to_s`.
 */
export function inspect(value: unknown): string {
  // Ruby `nil.inspect` is "nil"; `undefined` is trails' other spelling of nil.
  if (value == null) return "nil";
  if (typeof value === "string") return SYMBOL_RE.test(value) ? value : JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(inspect).join(", ")}]`;
  if (typeof value === "object" && isPlainObject(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    return `{${entries.map(([k, v]) => `${inspect(k)}=>${inspect(v)}`).join(", ")}}`;
  }
  return String(value);
}

/**
 * Ruby `Object#to_s`. `Array#to_s` and `Hash#to_s` are aliases of `inspect`
 * (array.c / hash.c), so those two classes render through `inspect`; every
 * other value — a String above all, which `to_s` returns unquoted — is its own
 * `to_s`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core, not Rails: `Object#to_s` is defined in object.c,
 * so no `.rb` in the vendored corpus declares it. JS `String(x)` is not the same
 * function — it gives the comma-joined form for a nested Array and
 * `[object Object]` for a Hash — so the Ruby one is spelled out here rather than
 * re-derived privately by each caller.
 */
export function toS(value: unknown): string {
  // Ruby `nil.to_s` is the empty string, not `String(null)`'s "null".
  if (value == null) return "";
  if (Array.isArray(value)) return inspect(value);
  if (value !== null && typeof value === "object" && isPlainObject(value)) return inspect(value);
  return String(value);
}
