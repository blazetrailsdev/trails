import { classpaths } from "./classpath.js";

type Klass = abstract new (...args: never) => unknown;

/**
 * `rb_define_class` (`vendor/ruby/v3.3.11/class.c:972`) for a core class no JS constructor seats.
 * @noRailsEquivalent PERMANENT
 */
export function rbDefineClass(name: string, superclass: Klass = Object): new () => object {
  const klass = class extends (superclass as new () => object) {};
  classpaths.set(klass, { path: name, permanent: true });
  return klass;
}

/**
 * `rb_cNumeric` (`vendor/ruby/v3.3.11/numeric.c:6156`). `Rational`
 * (`vendor/ruby/v3.3.11/rational.c:2759`), `Complex`
 * (`vendor/ruby/v3.3.11/complex.c:2529`) and `BigDecimal`
 * (`vendor/ruby/v3.3.11/ext/bigdecimal/bigdecimal.c:4407`) `extends` it,
 * as `rb_define_class(name, rb_cNumeric)` makes it their superclass. This
 * module imports nothing that reaches back into them, so it has run before
 * any of their class bodies, whichever module is entered first.
 * @noRailsEquivalent PERMANENT
 */
export const rbCNumeric = rbDefineClass("Numeric");
/** `Numeric#integer?` (`vendor/ruby/v3.3.11/numeric.rb:29`). */
Object.defineProperty(rbCNumeric.prototype, "isInteger", {
  value: function isInteger(): boolean {
    return false;
  },
  writable: true,
  configurable: true,
});

/**
 * `rb_cInteger` (`vendor/ruby/v3.3.11/numeric.c:6190`).
 * @noRailsEquivalent PERMANENT
 */
export const rbCInteger = rbDefineClass("Integer", rbCNumeric);

/**
 * `rb_cFloat` (`vendor/ruby/v3.3.11/numeric.c:6259`).
 * @noRailsEquivalent PERMANENT
 */
export const rbCFloat = rbDefineClass("Float", rbCNumeric);
