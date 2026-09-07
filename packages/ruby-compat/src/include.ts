/**
 * Ruby-style `include` for mixing module methods into a class.
 *
 * In Ruby, `include SomeModule` copies the module's instance methods
 * onto the including class's method lookup chain. This function does
 * the TypeScript equivalent: assigns each method from the module object
 * onto `klass.prototype`.
 *
 * Mirrors: Ruby's Module#include — vendor/ruby/eval.c:1139 `rb_mod_include`,
 * backed by vendor/ruby/class.c:1179 `rb_include_module`.
 *
 * Usage:
 *   // Define a module as a plain object of this-typed functions
 *   const QueryMethods = {
 *     whereBang(this: Relation, opts: any) { ... },
 *     orderBang(this: Relation, ...args: any[]) { ... },
 *   };
 *
 *   // Include it into a class
 *   include(Relation, QueryMethods);
 */

import { ArgumentError } from "./argument-error.js";

type AnyClass = new (...args: never[]) => unknown;
type ModuleObject = object;
type AnyFunction = (...args: never) => unknown;
type ModuleHooks = {
  [included]?: (klass: unknown) => void;
  [extended]?: (klass: unknown) => void;
  [initialize]?: (this: object) => void;
};

/**
 * Ruby's `Module.new` — an anonymous module built at runtime and populated
 * after the fact (`mod.module_eval { define_method … }`), then mixed into a
 * class with `include`.
 *
 * Unlike a plain-object module, whose methods `include()` copies onto the
 * class prototype once, a `Module` instance is *live*: `include()` splices a
 * carrier object into the prototype chain directly below the including class's
 * prototype, and every method the module defines afterwards is found by
 * instances from then on. That is Ruby's actual include semantics — including
 * that a method defined in the class body outranks the module's.
 *
 * The carrier is a separate object from the module because a JS object cannot
 * be both: everything reachable from a link in an instance's prototype chain is
 * an instance method, whereas Ruby's module object carries its own methods
 * (`Module#inspect`, `#name`) outside the ancestry it contributes. So the
 * module's methods are reached through the Ruby-named Module API below, which
 * operates on the carrier.
 *
 * Mirrors: Ruby's Module.new — vendor/ruby/object.c:1950 `rb_mod_initialize`.
 *
 * @noRailsEquivalent PERMANENT — a Ruby core class, not a Rails one.
 */
export class Module {
  /**
   * Mirrors: Ruby's Module#module_eval — vendor/ruby/vm_eval.c:2128
   * `rb_mod_module_eval` — yields the module's method table.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  moduleEval<T>(block: (mod: Record<string, unknown>) => T): T {
    return block(carrierOf(this));
  }

  include(mod: ModuleObject): void {
    const carrier = carrierOf(this);
    const members = mod as Record<string, unknown>;
    for (const key of Object.keys(members)) {
      if (typeof members[key] !== "function" || /^[A-Z]/.test(key)) continue;
      Object.defineProperty(carrier, key, {
        value: members[key],
        writable: true,
        configurable: true,
      });
    }
  }

  /**
   * Mirrors: Ruby's Module#define_method — vendor/ruby/proc.c:2325
   * `rb_mod_define_method`.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  defineMethod(name: string, body: (...args: never[]) => unknown): void {
    Object.defineProperty(carrierOf(this), name, {
      value: body,
      writable: true,
      configurable: true,
    });
  }

  /**
   * Mirrors: Ruby's Module#instance_method — the named method, detached from
   * this module. Ruby returns an `UnboundMethod`, which `define_method` binds
   * into another module; the TS carrier of that is the property descriptor,
   * which `Object.defineProperty` re-installs and which — unlike a bare
   * function — also carries an accessor pair.
   *
   * vendor/ruby/proc.c:2190 `rb_mod_instance_method`.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  instanceMethod(name: string): PropertyDescriptor | undefined {
    return Object.getOwnPropertyDescriptor(carrierOf(this), name);
  }

  /**
   * Mirrors: Ruby's Module#instance_methods — vendor/ruby/class.c:1889
   * `rb_class_instance_methods`.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  instanceMethods(): string[] {
    return Object.getOwnPropertyNames(carrierOf(this));
  }

  /**
   * Mirrors: Ruby's Module#undef_method — vendor/ruby/vm_method.c:1973
   * `rb_mod_undef_method`.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  undefMethod(...names: string[]): void {
    const carrier = carrierOf(this);
    for (const name of names) delete carrier[name];
  }

  /**
   * Mirrors: Ruby's Module#method_defined? — vendor/ruby/vm_method.c:2055
   * `rb_mod_method_defined`.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  isMethodDefined(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(carrierOf(this), name);
  }
}

const carriers = new WeakMap<Module, Record<string, unknown>>();

function carrierOf(mod: Module): Record<string, unknown> {
  let carrier = carriers.get(mod);
  if (!carrier) {
    carrier = Object.create(null) as Record<string, unknown>;
    carriers.set(mod, carrier);
  }
  return carrier;
}

/**
 * Symbol key for Ruby's Module#included callback, which `rb_mod_include` fires
 * on the module once `append_features` has spliced it into the ancestry
 * (vendor/ruby/eval.c:1160). Using a symbol avoids collisions with real method
 * names.
 *
 * @noRailsEquivalent PERMANENT — Ruby names the hook with an ordinary method
 * definition on the module; TypeScript has no such lifecycle hook, so the key
 * carries the name instead.
 */
export const included = Symbol.for("@blazetrails/ruby-compat:included");

/**
 * Symbol key for Ruby's Module#extended callback, which `rb_obj_extend` fires
 * on the module after `extend_object` has copied its methods onto the object
 * (vendor/ruby/eval.c:1795).
 *
 * @noRailsEquivalent PERMANENT — the TypeScript spelling of a Ruby lifecycle
 * hook, which the language has no equivalent of.
 */
export const extended = Symbol.for("@blazetrails/ruby-compat:extended");

/**
 * Symbol key for a module's `initialize`, the per-instance half of Ruby's
 * `include`. `rb_include_module` (vendor/ruby/class.c:1179) splices the module
 * into the lookup chain, so a module that defines `initialize` and calls
 * `super` runs against every new instance of the including class — which is
 * how `ActiveRecord::Railties::ControllerRuntime#initialize`
 * (activerecord/lib/active_record/railties/controller_runtime.rb:26-29) seats
 * `db_runtime` on each controller.
 *
 * JavaScript has no construction hook a mixin can splice into, so the class at
 * the bottom of the chain calls `initializeIncludedModules(this)` where Ruby's
 * `initialize` calls `super` — `ActionController::Metal`'s constructor, the
 * port of `metal.rb:210-217`.
 *
 * Symbol-keyed for the same reason `included` is: `initialize` is a Ruby
 * lifecycle name, and a string-named TS method spelled that way is drift.
 *
 * @noRailsEquivalent PERMANENT — the TypeScript spelling of a Ruby lifecycle
 * hook, which the language has no equivalent of.
 */
export const initialize = Symbol.for("@blazetrails/ruby-compat:initialize");

const instanceInitializers = Symbol.for("@blazetrails/ruby-compat:instanceInitializers");

const prependedInstanceInitializers = Symbol.for(
  "@blazetrails/ruby-compat:prependedInstanceInitializers",
);

/**
 * Run the `initialize` of every module included into `instance`'s class, in
 * include order — the order Ruby unwinds the `super` chain in, since a module
 * included later sits higher in the ancestry and so completes last. A module
 * already in the ancestry contributes one initializer, not two, because
 * `include_modules_at` skips a module whose method table it finds in the
 * superclass chain (vendor/ruby/class.c:1281,1291,1296).
 *
 * Mirrors: the `super` call in a class whose ancestry carries module
 * `initialize` definitions — vendor/ruby/class.c:1179 `rb_include_module`.
 *
 * @noRailsEquivalent PERMANENT — Ruby reaches these through `super`;
 * JavaScript has no construction hook a mixin can splice into.
 */
export function initializeIncludedModules(instance: object): void {
  const chain: Array<Array<(this: object) => void>> = [];
  for (
    let proto: object | null = Object.getPrototypeOf(instance) as object | null;
    proto;
    proto = Object.getPrototypeOf(proto) as object | null
  ) {
    const level: Array<(this: object) => void> = [];
    for (const registry of [instanceInitializers, prependedInstanceInitializers]) {
      if (!Object.prototype.hasOwnProperty.call(proto, registry)) continue;
      level.push(
        ...((proto as Record<symbol, unknown>)[registry] as Array<(this: object) => void>),
      );
    }
    if (level.length !== 0) chain.unshift(level);
  }
  for (const initializers of chain) {
    for (const initializer of initializers) initializer.call(instance);
  }
}

function trackInstanceInitializer(
  proto: object,
  initializer: (this: object) => void,
  registry: symbol = instanceInitializers,
): void {
  let list = (proto as Record<symbol, unknown>)[registry] as
    | Array<(this: object) => void>
    | undefined;
  if (!Object.prototype.hasOwnProperty.call(proto, registry)) {
    list = [];
    Object.defineProperty(proto, registry, {
      value: list,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  list!.push(initializer);
}

const includedKeys = Symbol.for("@blazetrails/ruby-compat:includedKeys");

const extendedKeys = Symbol.for("@blazetrails/ruby-compat:extendedKeys");

const includedModules = Symbol.for("@blazetrails/ruby-compat:includedModules");

const STATIC_CLASS_KEYS = new Set(["prototype", "length", "name"]);

function trackedKeys(proto: object, registry: symbol = includedKeys): Set<string> {
  let set = (proto as Record<symbol, unknown>)[registry] as Set<string> | undefined;
  if (!Object.prototype.hasOwnProperty.call(proto, registry)) {
    set = new Set<string>();
    Object.defineProperty(proto, registry, {
      value: set,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  return set!;
}

function trackIncludedModule(proto: object, mod: unknown): void {
  let set = (proto as Record<symbol, unknown>)[includedModules] as Set<unknown> | undefined;
  if (!Object.prototype.hasOwnProperty.call(proto, includedModules)) {
    set = new Set<unknown>();
    Object.defineProperty(proto, includedModules, {
      value: set,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
  set!.add(mod);
}

function isModuleMethodTablePresent(klass: { prototype: object }, mod: unknown): boolean {
  for (
    let proto: object | null = klass.prototype;
    proto;
    proto = Object.getPrototypeOf(proto) as object | null
  ) {
    if (!Object.prototype.hasOwnProperty.call(proto, includedModules)) continue;
    if (((proto as Record<symbol, unknown>)[includedModules] as Set<unknown>).has(mod)) return true;
  }
  return false;
}

/**
 * Ruby's `Module#<` — is `mod` in `klass`'s ancestry?
 *
 * `ActiveRecord::AttributeMethods::Dirty`'s `included do` block asks exactly
 * this (`activerecord/lib/active_record/attribute_methods/dirty.rb:44-47`,
 * `if self < ::ActiveRecord::Timestamp`), and there is no other way to ask it
 * here: JavaScript keeps no ancestry record of a mixin, since `include()`
 * copies a module's members onto the prototype rather than splicing a link for
 * it. The registry `include()` keeps is that record.
 *
 * Ruby asks it through `included_modules.include?`, and `Array#include?`
 * compares with `==`, which a module may define by value
 * (`AcceptanceValidator::LazilyDefineAttributes#==`, acceptance.rb:71-73), so a
 * module carrying an `equals` is asked that too and not identity alone.
 *
 * Mirrors: Ruby's Module#include? — vendor/ruby/class.c:1538
 * `rb_mod_include_p`.
 *
 * @noRailsEquivalent PERMANENT — Ruby spells this `<`, an operator TypeScript
 * cannot define; the predicate carries the same question at a callable name.
 */
export function isModuleIncluded(
  klass: { prototype: object },
  mod: ModuleObject | AnyClass | Module,
): boolean {
  if (isModuleMethodTablePresent(klass, mod)) return true;
  const eq = (mod as { equals?: (other: unknown) => boolean }).equals;
  if (typeof eq !== "function") return false;
  for (
    let proto: object | null = klass.prototype;
    proto;
    proto = Object.getPrototypeOf(proto) as object | null
  ) {
    if (!Object.prototype.hasOwnProperty.call(proto, includedModules)) continue;
    const mods = (proto as Record<symbol, unknown>)[includedModules] as Set<unknown>;
    for (const m of mods) if (eq.call(mod, m)) return true;
  }
  return false;
}

/**
 * Symbol key for the per-section visibility record `defineModule` stamps onto
 * the flat module object it returns. Symbol-keyed so it never collides with a
 * real method name, and so `Object.keys()` consumers see the module unchanged.
 *
 * The sections it records are the ones Ruby reads back through
 * `Module#private_instance_methods` — vendor/ruby/class.c:1927
 * `rb_class_private_instance_methods`.
 *
 * @noRailsEquivalent PERMANENT — Ruby carries visibility on the method entry
 * itself; a TS object literal has nowhere to put it but a side table.
 */
export const moduleVisibility = Symbol.for("@blazetrails/ruby-compat:moduleVisibility");

export interface ModuleVisibility {
  public: string[];
  protected: string[];
  private: string[];
}

/**
 * Compose a module from its visibility sections, the way a Ruby module body
 * separates them with statement-position `private` / `protected` keywords.
 *
 * Returns the flat composition in section order — public, then protected, then
 * private — so `include()` and `Included<typeof ...>` consumers see exactly the
 * object a hand-written spread produced. The section membership is additionally
 * stamped under `moduleVisibility` for `publicInstanceMethods` to read.
 *
 * The sections must be pairwise disjoint. A name in two sections is silently
 * won by the last spread, which aliases like `buildHavingClause: buildWhereClause`
 * (query_methods.rb:1654) make plausible, so it is asserted rather than trusted.
 *
 * Mirrors: Ruby's Module.new body — vendor/ruby/object.c:1950
 * `rb_mod_initialize`.
 *
 * @noRailsEquivalent PERMANENT — Ruby declares member visibility with
 * statement-position `private` / `protected` inside the module body; a TS
 * object literal has no statement position, so the sections must be named
 * values and composed explicitly.
 */
export function defineModule<
  Pub extends ModuleObject,
  Prot extends ModuleObject = Record<never, never>,
  Priv extends ModuleObject = Record<never, never>,
>(publicSection: Pub, protectedSection?: Prot, privateSection?: Priv): Pub & Prot & Priv {
  const sections: ModuleVisibility = {
    public: Object.keys(publicSection),
    protected: protectedSection ? Object.keys(protectedSection) : [],
    private: privateSection ? Object.keys(privateSection) : [],
  };
  assertSectionsDisjoint(sections);
  const mod = {
    ...publicSection,
    ...protectedSection,
    ...privateSection,
  } as Pub & Prot & Priv;
  Object.defineProperty(mod, moduleVisibility, { value: sections });
  return mod;
}

function assertSectionsDisjoint(sections: ModuleVisibility): void {
  const seen = new Map<string, keyof ModuleVisibility>();
  for (const kind of ["public", "protected", "private"] as const) {
    for (const name of sections[kind]) {
      const first = seen.get(name);
      if (first) {
        throw new ArgumentError(
          `defineModule: ${name} appears in both the ${first} and ${kind} sections`,
        );
      }
      seen.set(name, kind);
    }
  }
}

/**
 * Mirrors: Ruby's Module#public_instance_methods — vendor/ruby/class.c:1942
 * `rb_class_public_instance_methods` — the module's public instance methods,
 * own-only when `includeSuper` is false.
 *
 * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
 *
 * Known limitation: TypeScript's `private` / `protected` are erased at runtime,
 * so the class form cannot see them and reports every prototype member. Only a
 * `#`-private field and a `defineModule` section are visible here; enforcement
 * of the rest is a compare-time gate rather than this runtime walk.
 *
 * `includeSuper` is inert on a `Module`, whose carrier `include()` copies into
 * rather than links behind, so its own and inherited methods are one flat table.
 */
export function publicInstanceMethods(
  mod: ModuleObject | AnyClass | Module,
  includeSuper = true,
): string[] {
  if (mod instanceof Module) return Object.getOwnPropertyNames(carrierOf(mod));
  if (typeof mod === "function") {
    const names = new Set<string>();
    let proto: object | null = (mod as AnyClass).prototype as object;
    while (proto && proto !== Object.prototype) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name !== "constructor") names.add(name);
      }
      if (!includeSuper) break;
      proto = Object.getPrototypeOf(proto) as object | null;
    }
    return [...names];
  }
  const sections = (mod as Record<symbol, unknown>)[moduleVisibility] as
    | ModuleVisibility
    | undefined;
  return sections ? [...sections.public] : Object.keys(mod);
}

type CallableMethods<M extends object> = {
  [K in keyof M as K extends string
    ? M[K] extends AnyFunction
      ? K
      : never
    : never]: M[K] extends (this: never, ...args: infer A) => infer R ? (...args: A) => R : never;
};

export type Included<M extends object> = CallableMethods<M>;

function featureHook(mod: unknown, name: string): ((base: unknown) => void) | undefined {
  if (!(mod instanceof Module)) return undefined;
  const hook = (mod as unknown as Record<string, unknown>)[name];
  return typeof hook === "function" ? (hook as (base: unknown) => void).bind(mod) : undefined;
}

/**
 * Mirrors: Ruby's Module#include — vendor/ruby/eval.c:1139 `rb_mod_include`,
 * backed by vendor/ruby/class.c:1179 `rb_include_module`.
 *
 * @noRailsEquivalent PERMANENT — a Ruby core-language primitive, which Rails
 * uses but does not define.
 */
export function include(klass: AnyClass, mod: ModuleObject | AnyClass | Module): void {
  const appendFeatures = featureHook(mod, "appendFeatures");
  if (appendFeatures) return appendFeatures(klass);
  if (isModuleMethodTablePresent(klass, mod)) {
    if (typeof (mod as ModuleHooks)[included] === "function") {
      (mod as ModuleHooks)[included]!(klass);
    }
    return;
  }
  trackIncludedModule(klass.prototype, mod);
  const instanceInitializer = (mod as ModuleHooks)[initialize];
  if (typeof instanceInitializer === "function") {
    trackInstanceInitializer(klass.prototype, instanceInitializer);
  }
  if (mod instanceof Module) {
    const proto = klass.prototype as object;
    const carrier = Object.create(Object.getPrototypeOf(proto)) as Record<string, unknown>;
    Object.defineProperties(carrier, Object.getOwnPropertyDescriptors(carrierOf(mod)));
    carriers.set(mod, carrier);
    Object.setPrototypeOf(proto, carrier);
    if (typeof (mod as ModuleHooks)[included] === "function") {
      (mod as ModuleHooks)[included]!(klass);
    }
    return;
  }
  const descriptors: PropertyDescriptorMap = {};
  const installed = trackedKeys(klass.prototype);

  const isClassModule = typeof mod === "function" && (mod as AnyClass).prototype;
  if (isClassModule) {
    const proto = (mod as AnyClass).prototype;
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === "constructor") continue;
      const modDesc = Object.getOwnPropertyDescriptor(proto, key);
      if (!modDesc) continue;
      const existing = Object.getOwnPropertyDescriptor(klass.prototype, key);
      if (!existing) {
        descriptors[key] = modDesc;
        installed.add(key);
        continue;
      }
      const existingIsMixin = installed.has(key);
      const isAccessorPair =
        ("get" in modDesc || "set" in modDesc) && ("get" in existing || "set" in existing);
      if (isAccessorPair) {
        const higher = existingIsMixin ? modDesc : existing;
        const lower = existingIsMixin ? existing : modDesc;
        descriptors[key] = {
          get: higher.get ?? lower.get,
          set: higher.set ?? lower.set,
          configurable: true,
          enumerable: higher.enumerable ?? lower.enumerable ?? false,
        };
        if (existingIsMixin) installed.add(key);
      } else if (existingIsMixin) {
        descriptors[key] = modDesc;
      }
    }
  } else {
    for (
      let ancestor: object | null = mod as ModuleObject;
      ancestor && ancestor !== Object.prototype;
    ) {
      for (const [key, modDesc] of Object.entries(Object.getOwnPropertyDescriptors(ancestor))) {
        if (key === "constructor" || /^[A-Z]/.test(key)) continue;
        if ("value" in modDesc && typeof modDesc.value !== "function") continue;
        if (Object.prototype.hasOwnProperty.call(descriptors, key)) continue;
        if (Object.prototype.hasOwnProperty.call(klass.prototype, key) && !installed.has(key)) {
          continue;
        }
        installed.add(key);
        descriptors[key] = { ...modDesc, configurable: true, enumerable: false };
      }
      ancestor = Object.getPrototypeOf(ancestor) as object | null;
    }
  }
  Object.defineProperties(klass.prototype, descriptors);

  if (typeof (mod as ModuleHooks)[included] === "function") {
    (mod as ModuleHooks)[included]!(klass);
  }
}

export type Extended<M extends object> = CallableMethods<M>;

/**
 * Ruby-style `prepend` for mixing module methods into a class *above* it.
 *
 * Ruby's `prepend` inserts the module ahead of the class in the ancestry, so a
 * method the module defines wins over the same method in the class body — the
 * one behavioural difference from `include`, which loses to it. Here that is a
 * plain assignment onto the class prototype.
 *
 * Distinct from `prepend.ts`'s same-named helper, which wraps existing methods
 * so the module's version receives the original as an explicit `super_`. This
 * one is the ancestry splice that pairs with `include()` and is what a module's
 * `prepend_features` hook installs; it is not re-exported from the package
 * index, where `prepend.ts`'s helper owns the name.
 *
 * A prepended module carries the same per-instance `initialize` an included one
 * does, since Ruby reaches both through the same `super` chain — but it sits
 * ABOVE the class, so its post-`super` body completes after every included
 * module's. A module whose method table is already in the ancestry is skipped
 * whole, the way `include_modules_at` skips one
 * (vendor/ruby/class.c:1281,1291,1296).
 *
 * Mirrors: Ruby's Module#prepend — vendor/ruby/eval.c:1196 `rb_mod_prepend`,
 * backed by vendor/ruby/class.c:1430 `rb_prepend_module`.
 *
 * @noRailsEquivalent PERMANENT — a Ruby core-language primitive, which Rails
 * uses but does not define.
 */
export function prepend(klass: AnyClass, mod: ModuleObject | AnyClass | Module): void {
  const prependFeatures = featureHook(mod, "prependFeatures");
  if (prependFeatures) return prependFeatures(klass);
  if (isModuleMethodTablePresent(klass, mod)) return;
  trackIncludedModule(klass.prototype, mod);
  const instanceInitializer = (mod as ModuleHooks)[initialize];
  if (typeof instanceInitializer === "function") {
    trackInstanceInitializer(klass.prototype, instanceInitializer, prependedInstanceInitializers);
  }
  const source =
    mod instanceof Module
      ? carrierOf(mod)
      : typeof mod === "function"
        ? (mod as AnyClass).prototype
        : mod;
  for (const key of Object.getOwnPropertyNames(source)) {
    if (key === "constructor") continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor) Object.defineProperty(klass.prototype, key, descriptor);
  }
}

/**
 * Ruby-style `extend` for mixing module methods onto a class as static methods.
 *
 * In Ruby, `extend SomeModule` copies the module's methods onto the
 * object itself (not its prototype). When used on a class, this makes
 * the methods available as class-level (static) methods.
 *
 * Precedence follows Ruby's singleton ancestry, the way `include()`'s does on
 * the instance side: `include SomeModule` puts `SomeModule::ClassMethods`
 * BELOW the class body (concern.rb:135-138), so a class-body `static` wins over
 * the module's member of that name, while a later `extend()` wins over an
 * earlier one. Accessor halves are resolved independently, since Ruby reads a
 * getter (`key`) and a setter (`key=`) as two methods where TypeScript shares
 * one property name between them.
 *
 * Mirrors: Ruby's Object#extend — vendor/ruby/eval.c:1778 `rb_obj_extend`.
 *
 * @noRailsEquivalent PERMANENT — a Ruby core-language primitive, which Rails
 * uses but does not define.
 *
 * Usage:
 *   extend(Base, ConnectionHandlingMethods);
 *   // Now Base.connectedTo(...) works
 */
export function extend(klass: AnyClass | object, mod: ModuleObject | AnyClass | Module): void {
  const extendedHook = featureHook(mod, "extended");
  if (extendedHook) return extendedHook(klass);
  const isClassModule = typeof mod === "function" && (mod as AnyClass).prototype;
  const keys = isClassModule
    ? Object.getOwnPropertyNames(mod).filter((k) => !STATIC_CLASS_KEYS.has(k))
    : Object.keys(mod);
  const installed = trackedKeys(klass, extendedKeys);

  for (const key of keys) {
    const modDesc = Object.getOwnPropertyDescriptor(mod, key);
    if (!modDesc || /^[A-Z]/.test(key)) continue;
    if (!modDesc.get && !modDesc.set && typeof modDesc.value !== "function") continue;
    const existing = Object.getOwnPropertyDescriptor(klass, key);
    const writer = `${key}=`;
    const getterIsMixin = installed.has(key);
    const setterIsMixin = installed.has(writer);
    const modIsAccessor = modDesc.get != null || modDesc.set != null;
    const descriptor: PropertyDescriptor = modIsAccessor
      ? { get: modDesc.get, set: modDesc.set, configurable: true, enumerable: false }
      : { value: modDesc.value, writable: true, configurable: true, enumerable: false };
    if (!existing) {
      Object.defineProperty(klass, key, descriptor);
      if (!modIsAccessor || modDesc.get != null) installed.add(key);
      if (modDesc.set != null) installed.add(writer);
      continue;
    }
    const existingIsAccessor = existing.get != null || existing.set != null;
    if (modIsAccessor && existingIsAccessor) {
      const takeGetter = modDesc.get != null && (existing.get == null || getterIsMixin);
      const takeSetter = modDesc.set != null && (existing.set == null || setterIsMixin);
      Object.defineProperty(klass, key, {
        get: takeGetter ? modDesc.get : existing.get,
        set: takeSetter ? modDesc.set : existing.set,
        configurable: true,
        enumerable: false,
      });
      if (takeGetter) installed.add(key);
      if (takeSetter) installed.add(writer);
    } else if (getterIsMixin && (!existingIsAccessor || existing.set == null || setterIsMixin)) {
      Object.defineProperty(klass, key, descriptor);
      if (modDesc.set != null) installed.add(writer);
    }
  }

  if (typeof (mod as ModuleHooks)[extended] === "function") {
    (mod as ModuleHooks)[extended]!(klass);
  }
}
