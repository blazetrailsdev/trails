import { wrap } from "../core-ext/array/wrap.js";
import { classModule } from "@blazetrails/ruby-compat";
import type { ThreadLocalVar } from "../thread-local-var.js";

/** @noRailsEquivalent PERMANENT */
export type AllowMatcher = string | RegExp;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Disallowed {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  get disallowedWarnings(): AllowMatcher[] | ":all" {
    return (this._disallowedWarnings ??= []);
  }

  set disallowedWarnings(disallowedWarnings: AllowMatcher[] | ":all") {
    this._disallowedWarnings = disallowedWarnings;
  }

  /** @internal */
  isDeprecationDisallowed(message: string | null | undefined): boolean {
    if (this.isExplicitlyAllowed(message)) return false;
    if (this.disallowedWarnings === ":all") return true;
    return (
      message != null &&
      this.disallowedWarnings.some((rule) =>
        rule instanceof RegExp
          ? rule.test(message)
          : message.includes(rule.startsWith(":") ? rule.slice(1) : rule),
      )
    );
  }

  /** @internal */
  isExplicitlyAllowed(message: string | null | undefined): boolean {
    const allowances = this._explicitlyAllowedWarnings.value;
    if (allowances == null) return false;
    if (allowances === ":all") return true;
    return (
      message != null &&
      wrap(allowances).some((rule) =>
        rule instanceof RegExp
          ? rule.test(message)
          : message.includes(rule.startsWith(":") ? rule.slice(1) : rule),
      )
    );
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Disallowed {
  /** @internal */
  _disallowedWarnings?: AllowMatcher[] | ":all";
  /** @internal */
  _explicitlyAllowedWarnings: ThreadLocalVar<AllowMatcher[] | ":all" | null>;
}
