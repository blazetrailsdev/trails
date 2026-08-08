/**
 * Rails' `core_ext/object/instance_variables.rb`, which reopens `Object`.
 *
 * TypeScript cannot reopen built-ins, so the body lives on a class of the same
 * name with `static` methods taking the receiver — the shape
 * `core-ext/object/blank.ts` and `core-ext/object/json.ts` both use.
 *
 * JavaScript has no instance variables; an object's own enumerable properties
 * are the analogue, so `Object.keys` stands in for Ruby's `instance_variables`.
 *
 * Ruby's two readers differ by the leading `@`: `instance_values` strips it
 * (`ivar[1..-1]`, :17) and `instance_variable_names` keeps it (`["@y", "@x"]`,
 * :23). JS property names never carry one, so the distinction collapses and
 * both return the bare name. Synthesizing an `@` would invent a sigil no JS
 * reader — `Object.keys`, `in`, a bracket access — would accept back.
 */
export class Object {
  /** `Object#instance_values` (instance_variables.rb:14-18). */
  static instanceValues(self: object): Record<string, unknown> {
    return globalThis.Object.fromEntries(
      globalThis.Object.keys(self).map((ivar) => [
        ivar,
        (self as globalThis.Record<string, unknown>)[ivar],
      ]),
    );
  }

  /**
   * `Object#instance_variable_names` (instance_variables.rb:24-26). Ruby's
   * `map(&:name)` turns each ivar Symbol into its String — `:@y` into `"@y"`.
   * `Object.keys` already yields strings, and there is no `@` on them, so the
   * map has nothing left to do.
   */
  static instanceVariableNames(self: object): string[] {
    return globalThis.Object.keys(self).map((ivar) => ivar);
  }
}
