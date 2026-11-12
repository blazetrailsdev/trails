import { isModuleObject, rbClassPath } from "../classpath.js";
import { Gem } from "../gem.js";
import { format } from "../kernel-format.js";
import { warn } from "../kernel-warn.js";
import { rbModName } from "../object.js";

/**
 * `vendor/ruby/v3.3.11/lib/rubygems/deprecate.rb:73` — `Gem::Deprecate`.
 * `skip` (`:74-80`) is the module's own state, which `Gem::Version` reads.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Gem::Deprecate`.
 */
export const Deprecate = {
  skip: false,

  /**
   * `Gem::Deprecate#deprecate` (`vendor/ruby/v3.3.11/lib/rubygems/deprecate.rb:101-118`):
   * wraps the receiver's `name` so each call warns of `repl` (or of no
   * replacement for `"none"`, Ruby's `:none`) and the year and month it goes
   * away, unless `Gem::Deprecate.skip`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Gem::Deprecate#deprecate`.
   */
  deprecate(this: object, name: string, repl: string, year: number, month: number): void {
    const host = this as Record<string, (...args: unknown[]) => unknown>;
    const old = host[name];
    host[name] = function (this: object, ...args: unknown[]): unknown {
      const klass =
        typeof this === "function" || isModuleObject(this) || rbClassPath(this) !== undefined;
      const target = klass ? `${rbModName(this)}.` : `${rbModName(this.constructor)}#`;
      const msg = [
        `NOTE: ${target}${name} is deprecated`,
        repl === "none" ? " with no replacement" : `; use ${repl} instead`,
        format(". It will be removed on or after %4d-%02d.", year, month),
        `\n${target}${name} called from ${Gem.locationOfCaller().join(":")}`,
      ];
      if (!Deprecate.skip) warn(`${msg.join("")}.`);
      return old.apply(this, args);
    };
  },
};
