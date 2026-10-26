/**
 * The `classpath` seat `RCLASS_SET_CLASSPATH`
 * (`vendor/ruby/v3.3.11/internal/class.h:258`) writes: the path `const_set`
 * gave a class or module, and whether it is permanent.
 *
 * @noRailsEquivalent PERMANENT
 */
export const classpaths = new WeakMap<object, { path: string; permanent: boolean }>();

const moduleVisibility = Symbol.for("@blazetrails/ruby-compat:moduleVisibility");
const moduleIncludes = Symbol.for("@blazetrails/ruby-compat:moduleIncludes");
const moduleObjects = new WeakSet<object>();

/**
 * Marks a plain object as a Module, the `T_MODULE` type
 * (`vendor/ruby/v3.3.11/include/ruby/internal/value_type.h:117`) that
 * `rb_define_module_id` (`vendor/ruby/v3.3.11/class.c:1054`) allocates:
 * `include`, `prepend` and `extend` call it for the module they install, and
 * `include` / `prepend` for the receiver that includes it.
 *
 * @noRailsEquivalent PERMANENT
 */
export function markModuleObject(obj: unknown): void {
  if (typeof obj === "object" && obj !== null) moduleObjects.add(obj);
}

/**
 * Whether a plain object stands for a Ruby Module, the `T_MODULE` type
 * (`vendor/ruby/v3.3.11/include/ruby/internal/value_type.h:117`): `const_set`
 * gave it a classpath, `defineModule` stamped its visibility sections on it,
 * it recorded a module it includes, or {@link markModuleObject} marked it.
 *
 * @noRailsEquivalent PERMANENT
 */
export function isModuleObject(obj: object): boolean {
  return (
    moduleObjects.has(obj) ||
    classpaths.has(obj) ||
    Object.hasOwn(obj, moduleVisibility) ||
    Object.hasOwn(obj, moduleIncludes)
  );
}
