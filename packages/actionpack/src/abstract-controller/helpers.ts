/**
 * `AbstractController::Helpers` — class-level registry that exposes
 * controller methods (and external modules) to views. This PR ports
 * the runtime surface that operates on already-resolved modules:
 *
 *   - `applyHelpers(cls)` — seed the per-class `_helpers` module + `_helperMethods`.
 *   - `helperMethod(cls, ...names)` — proxy `name(...args)` → `controller[name](...args)`.
 *   - `helper(cls, ...mods)` — include resolved modules into `_helpers`.
 *   - `clearHelpers(cls)` — reset, then re-add previous `_helperMethods`.
 *   - `_helpersForModification(cls)` — copy-on-write clone for subclass mutation.
 *
 * String/symbol resolution (`AbstractController::Helpers::Resolution`)
 * and the `default_helper_module!` autoload-by-name path are deferred
 * to a follow-up PR; that's where `modules_for_helpers`,
 * `all_helpers_from_path`, and the constantize-by-name path live.
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
 * that does `this.controller[name](...args)`. Names are flattened (the
 * spread does it for us) and appended to `_helperMethods` so
 * `clearHelpers` can re-establish them after a wipe.
 */
export function helperMethod(cls: HelpersClassMethods, ...names: Array<string | string[]>): void {
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
  const mod = _helpersForModification(cls);
  for (const arg of args) {
    if (typeof arg === "function") {
      // `helper do ... end` — eval the block against the helpers module.
      arg(mod);
    } else if (arg && typeof arg === "object") {
      if (helpersInclude(cls._helpers, arg)) continue;
      Object.assign(mod, arg);
    }
  }
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

/**
 * Cheap stand-in for Ruby's `_helpers.include?(mod)`. Two modules are
 * "included" if every method on `mod` is the same function on
 * `helpers`. Suitable for the de-dup guard in `helper(...)`.
 */
function helpersInclude(
  helpers: HelperMethodsModule | undefined,
  mod: HelperMethodsModule,
): boolean {
  if (!helpers) return false;
  for (const k of Object.keys(mod)) {
    if (helpers[k] !== mod[k]) return false;
  }
  return Object.keys(mod).length > 0;
}
