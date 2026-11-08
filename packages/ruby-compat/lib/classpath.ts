/**
 * The `classpath` seat `RCLASS_SET_CLASSPATH`
 * (`vendor/ruby/v3.3.11/internal/class.h:258`) writes: the path `const_set`
 * gave a class or module, and whether it is permanent. Only ruby-compat writes
 * it, for a `const_set` a Rails body makes and for a module-eval namespace
 * seat; every other class's path comes from its package's generated table
 * ({@link defineConstants}). `rb_class_path`
 * (`vendor/ruby/v3.3.11/variable.c:364`) reads it.
 *
 * @noRailsEquivalent PERMANENT
 */
export const classpaths = new WeakMap<
  object,
  { path: string; permanent: boolean; under?: object; id?: string }
>();

const pendingClassPaths: [() => unknown, string][] = [];
let classPathsRegistered = false;
const tableClassPaths = new WeakMap<object, string>();
const tableClasses = new Map<string, () => unknown>();

/**
 * Seats a package's `constants.generated.ts`: each row gives the path
 * `RCLASS_SET_CLASSPATH` (`vendor/ruby/v3.3.11/internal/class.h:258`) would
 * have written, read class → path by `rb_mod_name` and path → class by
 * `constGet`, built by `pnpm parity:class-paths` (RFC 0213). Each class is
 * read through a thunk on the first lookup after a registration. A table is
 * imported last by its package entry, after every module it names has been
 * evaluated, so a thunk still in TDZ then is retried on the next registration,
 * or by a lookup of a class bearing the entry's last path segment, or of a
 * plain-object module, which bears no name.
 *
 * @noRailsEquivalent PERMANENT
 */
export function defineConstants(entries: readonly [() => unknown, string][]): void {
  for (const [klass, path] of entries) {
    pendingClassPaths.push([klass, path]);
    classPathsRegistered = true;
    tableClasses.set(path, klass);
  }
}

/**
 * `rb_class_path` (`vendor/ruby/v3.3.11/variable.c:364`): the `classpath` a
 * `const_set` seated, else the class's row in its package's generated table,
 * or `undefined`. A path `const_set` wrote under an owner whose own path was
 * still unresolved is re-derived from the owner once it resolves, as
 * `set_namespace_path` (`vendor/ruby/v3.3.11/variable.c:3582`) re-paths the
 * constants under a namespace when the namespace is named. One whose owner
 * never resolves keeps a temporary path, as `rb_const_set` gives a constant
 * under an unnamed owner (`vendor/ruby/v3.3.11/variable.c:3648-3654`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbClassPath(klass: object): string | undefined {
  const seated = classpaths.get(klass);
  if (seated !== undefined) {
    if (seated.under !== undefined) {
      const under = rbClassPath(seated.under);
      if (under !== undefined) {
        seated.path = `${under}::${seated.id}`;
        seated.under = undefined;
      } else if (pendingClassPaths.length === 0) {
        seated.under = undefined;
        seated.permanent = false;
      }
    }
    return seated.path;
  }
  if (classPathsRegistered) {
    classPathsRegistered = false;
    let unresolved = 0;
    for (const entry of pendingClassPaths) {
      let value: unknown;
      try {
        value = entry[0]();
      } catch {
        pendingClassPaths[unresolved++] = entry;
        continue;
      }
      if (value === undefined) {
        pendingClassPaths[unresolved++] = entry;
      } else if (
        (typeof value === "function" || (typeof value === "object" && value !== null)) &&
        !tableClassPaths.has(value)
      ) {
        tableClassPaths.set(value, entry[1]);
      }
    }
    pendingClassPaths.length = unresolved;
  }
  const path = tableClassPaths.get(klass);
  if (path !== undefined || pendingClassPaths.length === 0) return path;
  const { name } = klass as { name?: unknown };
  for (const entry of pendingClassPaths.filter(
    ([, path]) => typeof name !== "string" || name === path.slice(path.lastIndexOf(":") + 1),
  )) {
    let value: unknown;
    try {
      value = entry[0]();
    } catch {
      continue;
    }
    if (value === undefined) continue;
    pendingClassPaths.splice(pendingClassPaths.indexOf(entry), 1);
    if (
      (typeof value === "function" || (typeof value === "object" && value !== null)) &&
      !tableClassPaths.has(value)
    ) {
      tableClassPaths.set(value, entry[1]);
    }
  }
  return tableClassPaths.get(klass);
}

/**
 * Whether `rb_mod_name` (`vendor/ruby/v3.3.11/variable.c:122`) may yet miss
 * `klass`, a class whose generated path has not resolved.
 *
 * @noRailsEquivalent PERMANENT
 */
export function isClassPathPending(klass: object): boolean {
  const { name } = klass as { name?: unknown };
  return pendingClassPaths.some(([, path]) => name === path.slice(path.lastIndexOf(":") + 1));
}

/**
 * The class a package's generated table names under a full path, or
 * `undefined`: the row `rb_const_search` (`vendor/ruby/v3.3.11/variable.c:3190`)
 * would find in a namespace's constant table.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbConstTableGet(path: string): unknown {
  try {
    return tableClasses.get(path)?.();
  } catch {
    return undefined;
  }
}

/**
 * Every generated path that disagrees with the classpath `rb_const_set`
 * (`vendor/ruby/v3.3.11/variable.c:3648`) wrote, as `[seated, generated]`
 * pairs, and every path whose class is still unresolved after the entry has
 * loaded, as `["<unresolved>", generated]`, and every class two tables name
 * under different paths, as `["<also> first", generated]`: the
 * `parity:class-paths` check.
 *
 * @noRailsEquivalent PERMANENT
 */
export function classPathMismatches(): [string, string][] {
  const mismatches: [string, string][] = [];
  const named = new Map<unknown, string>();
  for (const [path, thunk] of tableClasses) {
    let klass: unknown;
    try {
      klass = thunk();
    } catch {
      mismatches.push(["<unresolved>", path]);
      continue;
    }
    const seated =
      typeof klass === "function" || (typeof klass === "object" && klass !== null)
        ? classpaths.get(klass)?.path
        : undefined;
    if (seated !== undefined && seated !== path) mismatches.push([seated, path]);
    const first = named.get(klass);
    if (first !== undefined && first !== path) mismatches.push([`<also> ${first}`, path]);
    else if (klass !== undefined) named.set(klass, path);
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
