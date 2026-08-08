/**
 * Rails' `core_ext/object/instance_variables.rb`, which reopens `Object`.
 *
 * TypeScript cannot reopen built-ins, so the body lives on a class of the same
 * name with `static` methods taking the receiver — the shape
 * `core-ext/object/blank.ts` and `core-ext/object/json.ts` both use.
 *
 * JavaScript has no instance variables; an object's own enumerable properties
 * are the analogue, so `Object.keys` stands in for Ruby's `instance_variables`.
 * They carry no leading `@`, which is why `instanceValues` has no `[1..-1]` to
 * strip and `instanceVariableNames` returns the names as they are.
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
   * `map(&:name)` turns each ivar Symbol into its String; `Object.keys` already
   * yields strings, so the map is the identity.
   */
  static instanceVariableNames(self: object): string[] {
    return globalThis.Object.keys(self).map((ivar) => ivar);
  }
}
