/**
 * Marks a class whose prototype `include()` copies as a module's instance
 * methods, the T_MODULE that `rb_include_module` takes
 * (`vendor/ruby/v3.3.11/class.c:1179`).
 * @noRailsEquivalent PERMANENT
 */
export const classModule = Symbol.for("@blazetrails/ruby-compat:classModule");
