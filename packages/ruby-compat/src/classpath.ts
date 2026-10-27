/**
 * The `classpath` seat `RCLASS_SET_CLASSPATH`
 * (`vendor/ruby/v3.3.11/internal/class.h:258`) writes: the path `const_set`
 * gave a class or module, and whether it is permanent. Only ruby-compat writes
 * it, for a `const_set` a Rails body makes and for a module-eval namespace
 * seat; every other class's path comes from its package's generated table
 * ({@link registerClassPaths}).
 *
 * @noRailsEquivalent PERMANENT
 */
export const classpaths = new WeakMap<object, { path: string; permanent: boolean }>();

const pendingClassPaths: [() => unknown, string][] = [];
const generatedClassPaths = new WeakMap<object, string>();
const generatedClasses = new Map<string, () => unknown>();

/**
 * Seats a package's generated table of the paths `RCLASS_SET_CLASSPATH`
 * (`vendor/ruby/v3.3.11/internal/class.h:258`) would have written, built by
 * `pnpm parity:class-paths` from `rails-api.json` (RFC 0205). Each class is
 * read through a thunk, resolved on the first lookup after its module has been
 * evaluated.
 *
 * @noRailsEquivalent PERMANENT
 */
export function registerClassPaths(entries: readonly [() => unknown, string][]): void {
  for (const [klass, path] of entries) {
    pendingClassPaths.push([klass, path]);
    generatedClasses.set(path, klass);
  }
}

/**
 * The `classpath` `rb_mod_name` (`vendor/ruby/v3.3.11/variable.c:122`) reads,
 * from the class's generated table, or `undefined`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function generatedClassPath(klass: object): string | undefined {
  if (pendingClassPaths.length > 0) {
    let unresolved = 0;
    for (const entry of pendingClassPaths) {
      let value: unknown;
      try {
        value = entry[0]();
      } catch {
        pendingClassPaths[unresolved++] = entry;
        continue;
      }
      if (typeof value === "function" && !generatedClassPaths.has(value)) {
        generatedClassPaths.set(value, entry[1]);
      }
    }
    pendingClassPaths.length = unresolved;
  }
  return generatedClassPaths.get(klass);
}

/**
 * The class `rb_path_to_class` (`vendor/ruby/v3.3.11/variable.c:432`) resolves
 * a full path to, from a generated table, or `undefined`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function generatedClass(path: string): unknown {
  try {
    return generatedClasses.get(path)?.();
  } catch {
    return undefined;
  }
}

/**
 * Every generated path that disagrees with the classpath `rb_const_set`
 * (`vendor/ruby/v3.3.11/variable.c:3648`) wrote, as `[seated, generated]`
 * pairs: the `parity:class-paths` check.
 *
 * @noRailsEquivalent PERMANENT
 */
export function classPathMismatches(): [string, string][] {
  const mismatches: [string, string][] = [];
  for (const [path, thunk] of generatedClasses) {
    let klass: unknown;
    try {
      klass = thunk();
    } catch {
      continue;
    }
    const seated = typeof klass === "function" ? classpaths.get(klass)?.path : undefined;
    if (seated !== undefined && seated !== path) mismatches.push([seated, path]);
  }
  return mismatches;
}

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
