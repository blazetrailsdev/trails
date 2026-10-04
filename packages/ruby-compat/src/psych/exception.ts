/**
 * `Psych::DisallowedClass` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/exception.rb:23`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class DisallowedClass extends globalThis.Error {
  /** @noRailsEquivalent PERMANENT */
  constructor(action: string, klassName: string) {
    super(`Tried to ${action} unspecified class: ${klassName}`);
    this.name = "Psych::DisallowedClass";
  }
}
