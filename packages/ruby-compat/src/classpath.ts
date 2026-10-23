/**
 * The `classpath` seat `RCLASS_SET_CLASSPATH`
 * (`vendor/ruby/v3.3.11/internal/class.h:258`) writes: the path `const_set`
 * gave a class or module, and whether it is permanent.
 *
 * @noRailsEquivalent PERMANENT
 */
export const classpaths = new WeakMap<object, { path: string; permanent: boolean }>();
