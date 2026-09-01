/**
 * Ruby's core `NameError` (`vendor/ruby/error.c:3348`), its constructor
 * (`vendor/ruby/error.c:3349` `name_err_initialize`) and its `name` reader
 * (`vendor/ruby/error.c:3350` `name_err_name`). Rails does not declare this
 * class — `active_support/core_ext/name_error.rb` only *reopens* it to add
 * `missing_name` / `missing_name?`, which stay in `@blazetrails/activesupport`
 * and are mixed onto this prototype there. `@blazetrails/activesupport`'s index
 * re-exports the class, so that package's public surface is unchanged.
 *
 * JS has no NameError, and trails uses `ReferenceError` as its analogue
 * throughout, so this extends it: `catch (e) { e instanceof ReferenceError }`
 * keeps working for hosts that spell the analogue directly, while
 * `rescue NameError` sites can name the class Rails names.
 *
 * `name` is not Ruby's `NameError#name`. In Ruby that attribute holds the
 * missing constant segment — `safe_constantize`'s
 * `camel_cased_word.split("::").include?(e.name.to_s)` guard only makes sense
 * because it is one segment, not the whole path — and `NameError.new(msg, name)`
 * sets it explicitly. JS reserves `Error#name` for the class name, so the Ruby
 * attribute lives on `constantName`. It is NOT `missing_name`, which prepends
 * the receiver.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `NameError`, which Rails reopens
 * rather than defines.
 */
export class NameError extends ReferenceError {
  /**
   * Ruby's `NameError#name` (`vendor/ruby/error.c:3350`): the missing constant
   * *segment*, not the path.
   *
   * @noRailsEquivalent PERMANENT — JS reserves `Error#name` for the class
   * name, so Ruby core's `NameError#name` reader is spelled `constantName`.
   */
  readonly constantName?: string;

  constructor(message: string, constantName?: string) {
    super(message);
    this.name = "NameError";
    this.constantName = constantName;
  }
}
