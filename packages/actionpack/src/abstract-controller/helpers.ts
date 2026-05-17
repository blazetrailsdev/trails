import { camelize } from "@blazetrails/activesupport";

/**
 * `AbstractController::Helpers` — class-level registry that exposes
 * controller methods (and external modules) to views. This PR ports
 * the runtime surface that operates on already-resolved modules:
 *
 *   - `applyHelpers(cls)` — no-op slot-contract marker (mirrors `applyAssetPaths` / `applyFragments`).
 *   - `helperMethod(cls, ...names)` — proxy `name(...args)` → `controller[name](...args)`.
 *   - `helper(cls, ...mods)` — include resolved modules into `_helpers`.
 *   - `clearHelpers(cls)` — reset, then re-add previous `_helperMethods`.
 *   - `_helpersForModification(cls)` — copy-on-write clone for subclass mutation.
 *   - `modulesForHelpers(args, opts)` — Rails `Resolution#modules_for_helpers`.
 *   - `allHelpersFromPath(paths)` — Rails `Resolution#all_helpers_from_path`.
 *   - `helperModulesFromPaths(paths, opts)` — Rails `Resolution#helper_modules_from_paths`.
 *   - `defaultHelperModule(cls, opts)` — Rails `default_helper_module!`.
 *
 * Ported from `vendor/rails/actionpack/lib/abstract_controller/helpers.rb`.
 *
 * @internal
 */

/**
 * A helper "module" — a bag of methods that, when called from a view,
 * forward to the controller via `this.controller`. Rails uses a real
 * Ruby module; here we use a plain object indexed by method name.
 */
export type HelperMethodsModule = Record<string, (...args: unknown[]) => unknown>;

/**
 * The shape of a host class. `_helpers` and `_helperMethods` are
 * class-level slots; absence on the class itself causes JS prototype
 * lookup to walk up to the parent class — matching Rails' redefined
 * `_helpers` singleton method that delegates to `superclass._helpers`.
 */
export interface HelpersClassMethods {
  _helpers?: HelperMethodsModule;
  _helperMethods?: string[];
  name?: string;
}

/**
 * A nested-array list of helper method names. Mirrors Ruby's
 * `helper_method(*methods)` + `methods.flatten!`: callers may pass
 * varargs, a single array, or arbitrarily nested arrays.
 */
export type HelperMethodNameList = string | HelperMethodNameList[];

/**
 * Identity set of helper modules included into a given helpers module.
 * Keyed by the helpers module itself, walked along the module's
 * prototype chain so `clearHelpers` (which severs the chain) correctly
 * forgets included modules and Rails' `_helpers.include?(mod)`
 * ancestor-chain semantics are preserved.
 */
const includedHelperModules = new WeakMap<HelperMethodsModule, WeakSet<object>>();

export interface HelpersHost {
  constructor: HelpersClassMethods;
}

/**
 * Marks a host class as conforming to the helpers slot contract.
 * No-op at runtime — mirrors `applyAssetPaths` / `applyFragments`.
 * Seeding `_helpers = {}` on a subclass would shadow the parent's
 * module; instead reads fall back to an empty module, and
 * `_helpersForModification` does Rails' `class_attribute`-style
 * copy-on-write clone the first time a subclass mutates.
 */
export function applyHelpers<T extends new (...args: never[]) => unknown>(
  _cls: T & Partial<HelpersClassMethods>,
): void {
  // Intentionally empty.
}

/** Instance-side `_helpers`: returns `this.class._helpers`. */
export function _helpersInstance(this: HelpersHost): HelperMethodsModule {
  return this.constructor._helpers ?? (Object.create(null) as HelperMethodsModule);
}

/**
 * `ClassMethods#helper_method(*methods)` — register controller method
 * names as view helpers. Each name gets a proxy on the helpers module
 * that does `this.controller[name](...args)`. Nested-array inputs are
 * flattened via `Array.prototype.flat(Infinity)` (matching Ruby's
 * `methods.flatten!`) and appended to `_helperMethods` so
 * `clearHelpers` can re-establish them after a wipe.
 */
export function helperMethod(cls: HelpersClassMethods, ...names: HelperMethodNameList[]): void {
  // Rails: `methods.flatten!` — flattens recursively (default depth nil).
  const flat = (names as readonly unknown[]).flat(Infinity) as string[];
  if (flat.length === 0) return;
  cls._helperMethods = [...(cls._helperMethods ?? []), ...flat];
  const mod = _helpersForModification(cls);
  for (const name of flat) {
    mod[name] = function (this: { controller: Record<string, unknown> }, ...args: unknown[]) {
      const fn = this.controller[name];
      if (typeof fn !== "function") {
        throw new TypeError(`helper_method: controller does not respond to '${name}'`);
      }
      return (fn as (...a: unknown[]) => unknown).apply(this.controller, args);
    };
  }
}

/**
 * `ClassMethods#helper(*args, &block)` — include the given modules into
 * the helpers module. Rails accepts modules, strings, symbols, and a
 * block; this PR handles modules only (the string/symbol form requires
 * the Resolution mixin, deferred to PR B). A trailing function arg is
 * treated as the `module_eval` block.
 */
export function helper(
  cls: HelpersClassMethods,
  ...args: Array<HelperMethodsModule | ((mod: HelperMethodsModule) => void)>
): void {
  // Rails only triggers copy-on-write when actually mutating; a no-op
  // duplicate include must leave the subclass still delegating to the
  // parent via the prototype chain.
  for (const arg of args) {
    if (typeof arg === "function") {
      arg(_helpersForModification(cls));
    } else if (arg && typeof arg === "object") {
      if (isHelperIncluded(cls._helpers, arg)) continue;
      const head = _helpersForModification(cls);
      // Rails' `Module#include` inserts the module *behind* the
      // includer in the ancestor chain and keeps a live reference to
      // the included module. We mirror both: splice a Proxy node
      // between `head` (own methods from helperMethod / block) and
      // its current tail (previously-included modules, parent
      // helpers). The Proxy forwards lookups to `arg`, so methods
      // added to `arg` after the include call remain visible. Falling
      // through to the proxy target preserves chain walking for keys
      // not in `arg`.
      const currentTail = Object.getPrototypeOf(head) as object | null;
      const link = makeIncludeLink(arg, currentTail);
      Object.setPrototypeOf(head, link);
      recordHelperIncluded(head, arg);
    }
  }
}

/**
 * Walks the helpers module's prototype chain — each link is a module
 * that included a (possibly different) set of helper modules. Mirrors
 * Rails' `_helpers.include?(mod)`: only ancestors reachable via the
 * actual helpers module chain count.
 */
function isHelperIncluded(helpers: HelperMethodsModule | undefined, mod: object): boolean {
  let current: object | null = helpers ?? null;
  while (current) {
    if (includedHelperModules.get(current as HelperMethodsModule)?.has(mod)) {
      return true;
    }
    current = Object.getPrototypeOf(current);
  }
  return false;
}

/**
 * Build a proto-chain link that forwards lookups to the included
 * module. The target's prototype is the prior chain tail, so keys not
 * present on `mod` still walk through to earlier includes / parent
 * helpers. Using a Proxy (rather than `Object.assign`) keeps reads
 * live: methods added to `mod` after include are still visible.
 */
function makeIncludeLink(
  mod: HelperMethodsModule,
  currentTail: object | null,
): HelperMethodsModule {
  const target = Object.create(currentTail) as HelperMethodsModule;
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (Object.prototype.hasOwnProperty.call(mod, prop)) {
        return (mod as Record<PropertyKey, unknown>)[prop as PropertyKey];
      }
      return Reflect.get(t, prop, receiver);
    },
    has(t, prop) {
      return Object.prototype.hasOwnProperty.call(mod, prop) || Reflect.has(t, prop);
    },
  }) as HelperMethodsModule;
}

function recordHelperIncluded(helpers: HelperMethodsModule, mod: object): void {
  let set = includedHelperModules.get(helpers);
  if (!set) {
    set = new WeakSet<object>();
    includedHelperModules.set(helpers, set);
  }
  set.add(mod);
}

/**
 * `ClassMethods#clear_helpers` — drop all helpers, then re-attach the
 * controller's own `_helperMethods` so it can still expose them to its
 * views. Rails also calls `default_helper_module!` here for non-anonymous
 * classes; that path lives in PR B.
 */
export function clearHelpers(cls: HelpersClassMethods): void {
  const inherited = [...(cls._helperMethods ?? [])];
  cls._helpers = Object.create(null) as HelperMethodsModule;
  cls._helperMethods = [];
  helperMethod(cls, ...inherited);
}

/**
 * `ClassMethods#_helpers_for_modification` — lazily clone the inherited
 * `_helpers` module onto this class so subsequent mutations don't leak
 * into the parent. Returns the cloned (or already-owned) module.
 */
export function _helpersForModification(cls: HelpersClassMethods): HelperMethodsModule {
  if (Object.prototype.hasOwnProperty.call(cls, "_helpers") && cls._helpers) {
    return cls._helpers;
  }
  // Rails builds the new module with the parent's helpers module as an
  // ancestor (`mod.include(helpers) if helpers`), so methods added to
  // the parent *after* the subclass clones remain visible. Match that
  // by setting the parent's module as the new module's prototype rather
  // than `Object.assign`-snapshotting at clone time.
  const inherited = cls._helpers ?? null;
  const child = Object.create(inherited) as HelperMethodsModule;
  cls._helpers = child;
  return child;
}

// ---------------------------------------------------------------------------
// `AbstractController::Helpers::Resolution`
// ---------------------------------------------------------------------------

/**
 * Resolves a helper-module name (e.g. `"users"`, `"Foo::Bar"`) into a
 * `HelperMethodsModule`. Returns `undefined` when no module exists for
 * the name — `modulesForHelpers` raises in that case to mirror Ruby's
 * `NameError`.
 *
 * trails has no global constant table, so the resolver is host-supplied:
 * typically a registry built at boot from configured helper paths or
 * static imports.
 */
export type HelperResolver = (name: string) => HelperMethodsModule | undefined;

export interface ResolutionOptions {
  resolve: HelperResolver;
}

/**
 * `Resolution#modules_for_helpers(modules_or_helper_prefixes)` — accepts
 * a mixed array of resolved modules and prefix names (string | symbol).
 * Names that don't start with an upper-case letter are camelized; a
 * `"Helper"` suffix is appended; the resolver is asked to turn the
 * resulting name into a module. Throws `TypeError` / a `NameError`-shaped
 * `Error` on bad inputs / unknown names, matching Rails' two failure
 * modes.
 */
export function modulesForHelpers(
  args: ReadonlyArray<HelperMethodsModule | string | symbol | Array<unknown>>,
  options: ResolutionOptions,
): HelperMethodsModule[] {
  const flat = (args as readonly unknown[]).flat(Infinity);
  return flat.map((arg) => {
    if (arg && typeof arg === "object") {
      // Rails' `when Module` is identity-strict; JS has no `Module`
      // type so we approximate with a "method bag" shape check: every
      // own enumerable value must be a function. Rejects `Date`,
      // `{ a: 1 }`, etc. so the failure surfaces here rather than
      // deep inside `helper(cls, ...)`.
      for (const v of Object.values(arg)) {
        if (typeof v !== "function") {
          throw new TypeError("helper must be a String, Symbol, or Module");
        }
      }
      return arg as HelperMethodsModule;
    }
    if (typeof arg === "string" || typeof arg === "symbol") {
      const raw = typeof arg === "symbol" ? (arg.description ?? "") : arg;
      const name = `${/^[A-Z]/.test(raw) ? raw : camelizeHelperPrefix(raw)}Helper`;
      const mod = options.resolve(name);
      if (!mod) throw new Error(`uninitialized constant ${name}`);
      return mod;
    }
    throw new TypeError("helper must be a String, Symbol, or Module");
  });
}

/**
 * `Resolution#all_helpers_from_path(path)` — glob `*_helper.{ts,js}`
 * (and `.rb` so callers porting from Rails can point at a real Rails
 * app path) under each given root and return the de-duplicated, sorted
 * basename list (without the `_helper` suffix or extension).
 */
export async function allHelpersFromPath(paths: string | readonly string[]): Promise<string[]> {
  // Built path + `@vite-ignore` so bundlers (the website SW bundle in
  // particular) don't statically resolve the Node-only glob dep
  // (`tinyglobby` → `fdir` uses `createRequire`). Callers in non-Node
  // environments must not invoke this function.
  const modName = ["@blazetrails", "activesupport", "glob"].join("/");
  const { glob } = (await import(
    /* @vite-ignore */ modName
  )) as typeof import("@blazetrails/activesupport/glob");
  const roots = typeof paths === "string" ? [paths] : paths;
  // Rails: per-path `sort!` then concat across paths, then `uniq!`
  // preserving first-occurrence order. We do NOT globally re-sort.
  const out: string[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    const matches = await glob("**/*_helper.{ts,js,rb}", { cwd: root });
    const names = matches.map((f) => f.replace(/\.(ts|js|rb)$/, "").replace(/_helper$/, "")).sort();
    for (const name of names) {
      if (!seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
  }
  return out;
}

/**
 * `Resolution#helper_modules_from_paths(paths)` — chains
 * `allHelpersFromPath` and `modulesForHelpers`.
 */
export async function helperModulesFromPaths(
  paths: string | readonly string[],
  options: ResolutionOptions,
): Promise<HelperMethodsModule[]> {
  const names = await allHelpersFromPath(paths);
  return modulesForHelpers(names, options);
}

/**
 * `ClassMethods#default_helper_module!` — strip the `Controller` suffix
 * from `cls.name` and call `helper(cls, <Name>)`. Rails rescues a
 * `NameError` for the specific missing constant; we swallow only the
 * matching `uninitialized constant` error raised by
 * `modulesForHelpers`, so unrelated resolver failures still propagate.
 */
export function defaultHelperModule(cls: HelpersClassMethods, options: ResolutionOptions): void {
  const className = cls.name;
  if (!className) return; // anonymous — Rails' inherited hook also skips
  const helperPrefix = className.replace(/Controller$/, "");
  const expectedName = `${/^[A-Z]/.test(helperPrefix) ? helperPrefix : camelize(helperPrefix)}Helper`;
  try {
    const [mod] = modulesForHelpers([helperPrefix], options);
    helper(cls, mod);
  } catch (err) {
    // Rails: `rescue NameError => e; raise unless e.missing_name?("#{helper_prefix}Helper")`.
    // Only swallow the missing-constant error for *this* specific helper
    // name. Errors from elsewhere (e.g. the helper module's own body
    // referencing some other missing constant) must propagate.
    if (err instanceof Error && err.message === `uninitialized constant ${expectedName}`) return;
    throw err;
  }
}

function camelizeHelperPrefix(raw: string): string {
  // Ruby `helper_prefix.camelize` — activesupport's `camelize` already
  // translates `/` to `::`, so `"foo/bar"` → `"Foo::Bar"`.
  return camelize(raw);
}
