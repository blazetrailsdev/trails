import { RuntimeError } from "../runtime-error.js";

/**
 * `Psych::Exception` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/exception.rb:3`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class Exception extends RuntimeError {}

Exception.prototype.name = "Psych::Exception";

/**
 * `Psych::BadAlias` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/exception.rb:6`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class BadAlias extends Exception {}

BadAlias.prototype.name = "Psych::BadAlias";

/**
 * `Psych::AliasesNotEnabled` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/exception.rb:10`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class AliasesNotEnabled extends BadAlias {
  /** @noRailsEquivalent PERMANENT */
  constructor() {
    super(
      "Alias parsing was not enabled. To enable it, pass `aliases: true` to `Psych::load` or `Psych::safe_load`.",
    );
  }
}

AliasesNotEnabled.prototype.name = "Psych::AliasesNotEnabled";

/**
 * `Psych::AnchorNotDefined` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/exception.rb:17`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class AnchorNotDefined extends BadAlias {
  /** @noRailsEquivalent PERMANENT */
  constructor(anchorName: string) {
    super(`An alias referenced an unknown anchor: ${anchorName}`);
  }
}

AnchorNotDefined.prototype.name = "Psych::AnchorNotDefined";

/**
 * `Psych::DisallowedClass` (`vendor/ruby/v3.3.11/ext/psych/lib/psych/exception.rb:23`).
 *
 * @noRailsEquivalent PERMANENT
 */
export class DisallowedClass extends Exception {
  /** @noRailsEquivalent PERMANENT */
  constructor(action: string, klassName: string) {
    super(`Tried to ${action} unspecified class: ${klassName}`);
  }
}

DisallowedClass.prototype.name = "Psych::DisallowedClass";
