import { ArgumentError } from "./argument-error.js";
import { stringValue } from "./string/support.js";

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/pathname/pathname.c:1511` `rb_cPathname` */
export class Pathname {
  private readonly path: string;

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/pathname/pathname.c:97` `path_initialize`, whose `RB_TYPE_P(arg, T_STRING)` arm and `StringValue` (`:100-107`) take a binary String too */
  constructor(arg: string | Uint8Array | { toPath(): string }) {
    const str = stringValue(
      typeof arg === "string" || arg instanceof Uint8Array ? arg : arg.toPath(),
    );
    if (str.includes("\0")) throw new ArgumentError("pathname contains null byte");
    this.path = str;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/pathname/pathname.c:139` `path_eq` */
  equals(other: unknown): boolean {
    if (!(other instanceof Pathname)) return false;
    return this.path === other.path;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/pathname/pathname.c:215` `path_to_s`, aliased `to_path` */
  toString(): string {
    return this.path;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/pathname/pathname.c:215` `path_to_s` */
  toPath(): string {
    return this.path;
  }
}
