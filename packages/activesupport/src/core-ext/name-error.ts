import { NameError } from "@blazetrails/ruby-compat/name-error";

/**
 * Mirrors: active_support/core_ext/name_error.rb — `class NameError` reopened.
 *
 * The class itself, its constructor and Ruby's `NameError#name` (trails'
 * `constantName`) are Ruby core, so they live in `@blazetrails/ruby-compat`;
 * Rails adds only the two members below, which are mixed onto that one class
 * identity here — the shape `core-ext/range/compare-range.ts:19` uses for
 * `ActiveSupport::CompareWithRange`. It is re-exported so every `rescue
 * NameError` site in the workspace keeps naming the class Rails names.
 */
declare module "@blazetrails/ruby-compat/name-error" {
  interface NameError {
    missingName(): string | undefined;
    isMissingName(name: string | symbol): boolean;
  }
}

/**
 * Extract the name of the missing constant from the exception message.
 *
 * Mirrors: NameError#missing_name. Ruby's receiver-aware branches have no JS analogue (an Error carries no
 * receiver), so this always takes Ruby's final branch — the message regex —
 * which yields the same qualified path Ruby's receiver branch builds.
 * Deliberately not `constantName`, which is the unqualified `name`.
 */
export function missingName(this: NameError): string | undefined {
  if (!this.message.startsWith("uninitialized constant ")) return undefined;
  const match = this.message.match(/((::)?([A-Z]\w*)(::[A-Z]\w*)*)$/);
  return match ? match[1] : undefined;
}

/**
 * Was this exception raised because the given name was missing?
 *
 * Mirrors: NameError#missing_name?. Ruby branches on the argument's type — a Symbol compares against `name`,
 * anything else against `missing_name` — so this branches the same way,
 * treating a JS symbol as Ruby's Symbol and its `description` as the symbol's
 * text.
 */
export function isMissingName(this: NameError, name: string | symbol): boolean {
  // Ruby's `self.name == name` is false whenever `name` is nil, so a
  // NameError carrying no constant never matches a Symbol.
  if (typeof name === "symbol") {
    return this.constantName !== undefined && this.constantName === name.description;
  }
  return this.missingName() === name;
}

NameError.prototype.missingName = missingName;
NameError.prototype.isMissingName = isMissingName;

export { NameError };
