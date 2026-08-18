/**
 * NameError — the error Ruby raises for an unresolvable constant, and so what
 * `Inflector.constantize` raises.
 *
 * Mirrors: active_support/core_ext/name_error.rb (the class it reopens).
 *
 * JS has no NameError, and trails uses `ReferenceError` as its analogue
 * throughout, so this extends it: `catch (e) { e instanceof ReferenceError }`
 * keeps working for hosts that spell the analogue directly, while
 * `rescue NameError` sites can name the class Rails names.
 *
 * **`name` is not Ruby's `NameError#name`.** In Ruby that attribute holds the
 * *missing constant segment* — `safe_constantize`'s
 * `camel_cased_word.split("::").include?(e.name.to_s)` guard only makes sense
 * because it is one segment, not the whole path — and `NameError.new(msg, name)`
 * sets it explicitly (the shape `inheritance.rb:264` and `reflection.rb:501`
 * use). JS reserves `Error#name` for the class name, so the Ruby attribute
 * lives on {@link constantName}. It is NOT `missing_name`, which prepends the
 * receiver; use {@link missingName} for that.
 */
export class NameError extends ReferenceError {
  /** Ruby's `NameError#name`: the missing constant *segment*, not the path. */
  readonly constantName?: string;

  constructor(message: string, constantName?: string) {
    super(message);
    this.name = "NameError";
    this.constantName = constantName;
  }

  /**
   * Extract the name of the missing constant from the exception message.
   *
   * Mirrors: NameError#missing_name. Ruby's receiver-aware branches have no JS
   * analogue (an Error carries no receiver), so this always takes Ruby's final
   * branch — the message regex — which yields the same qualified path Ruby's
   * receiver branch builds. Deliberately not {@link constantName}, which is the
   * unqualified `name`.
   */
  missingName(): string | undefined {
    if (!this.message.startsWith("uninitialized constant ")) return undefined;
    const match = this.message.match(/((::)?([A-Z]\w*)(::[A-Z]\w*)*)$/);
    return match ? match[1] : undefined;
  }

  /**
   * Was this exception raised because the given name was missing?
   *
   * Mirrors: NameError#missing_name?. Ruby branches on the argument's type —
   * a Symbol compares against `name`, anything else against `missing_name` —
   * so this branches the same way, treating a JS symbol as Ruby's Symbol and
   * its `description` as the symbol's text.
   */
  isMissingName(name: string | symbol): boolean {
    // Ruby's `self.name == name` is false whenever `name` is nil, so a
    // NameError carrying no constant never matches a Symbol.
    if (typeof name === "symbol") {
      return this.constantName !== undefined && this.constantName === name.description;
    }
    return this.missingName() === name;
  }
}
