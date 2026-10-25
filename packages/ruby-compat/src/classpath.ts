/**
 * The `classpath` seat `RCLASS_SET_CLASSPATH`
 * (`vendor/ruby/v3.3.11/internal/class.h:258`) writes: the path `const_set`
 * gave a class or module, and whether it is permanent.
 *
 * @noRailsEquivalent PERMANENT
 */
export const classpaths = new WeakMap<object, { path: string; permanent: boolean }>();

const moduleVisibility = Symbol.for("@blazetrails/ruby-compat:moduleVisibility");

/**
 * Whether a plain object stands for a Ruby Module, the `T_MODULE` type
 * (`vendor/ruby/v3.3.11/include/ruby/internal/value_type.h:117`): `const_set`
 * gave it a classpath, or `defineModule` stamped its visibility sections on it.
 *
 * @noRailsEquivalent PERMANENT
 */
export function isModuleObject(obj: object): boolean {
  return classpaths.has(obj) || Object.hasOwn(obj, moduleVisibility);
}
