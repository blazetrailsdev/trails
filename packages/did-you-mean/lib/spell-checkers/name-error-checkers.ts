import type { NameError } from "@blazetrails/ruby-compat/name-error";
import { ClassNameChecker } from "./name-error-checkers/class-name-checker.js";
import { NullChecker } from "./null-checker.js";

/** @noRailsEquivalent PERMANENT */
export class NameErrorCheckers {
  constructor(exception: NameError & { originalMessage(): string }) {
    const message = exception.originalMessage();
    let checker: new (exception: NameError & { originalMessage(): string }) => {
      readonly corrections: string[];
    };
    if (/uninitialized constant/.test(message)) {
      checker = ClassNameChecker;
    } else if (
      /undefined local variable or method/.test(message) ||
      /undefined method/.test(message) ||
      /uninitialized class variable/.test(message) ||
      /no member '.*' in struct/.test(message)
    ) {
      checker = NullChecker;
    } else {
      checker = NullChecker;
    }
    return new checker(exception);
  }
}
