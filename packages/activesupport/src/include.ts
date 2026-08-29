/**
 * Ruby-style `include` for mixing module methods into a class.
 *
 * In Ruby, `include SomeModule` copies the module's instance methods
 * onto the including class's method lookup chain. This function does
 * the TypeScript equivalent: assigns each method from the module object
 * onto `klass.prototype`.
 *
 * Mirrors: Ruby's Module#include (core language feature)
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

type AnyClass = new (...args: any[]) => any;
type ModuleObject = Record<string, any>;

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
 * Mirrors: Ruby's Module.new (core language feature)
 */
export class Module {
  /** Mirrors: Ruby's Module#module_eval — yields the module's method table. */
  moduleEval<T>(block: (mod: Record<string, unknown>) => T): T {
    return block(carrierOf(this));
  }

  /**
   * Mirrors: Ruby's Module#include — mixes another module's instance methods
   * into this module, so a class that includes this one gets them too.
   */
  include(mod: ModuleObject): void {
    const carrier = carrierOf(this);
    for (const key of Object.keys(mod)) {
      if (typeof mod[key] !== "function" || /^[A-Z]/.test(key)) continue;
      Object.defineProperty(carrier, key, {
        value: mod[key],
        writable: true,
        configurable: true,
      });
    }
  }

  /** Mirrors: Ruby's Module#define_method. */
  defineMethod(name: string, body: (...args: any[]) => unknown): void {
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
   */
  instanceMethod(name: string): PropertyDescriptor | undefined {
    return Object.getOwnPropertyDescriptor(carrierOf(this), name);
  }

  /** Mirrors: Ruby's Module#instance_methods. */
  instanceMethods(): string[] {
    return Object.getOwnPropertyNames(carrierOf(this));
  }

  /** Mirrors: Ruby's Module#undef_method. */
  undefMethod(...names: string[]): void {
    const carrier = carrierOf(this);
    for (const name of names) delete carrier[name];
  }

  /** Mirrors: Ruby's Module#method_defined?. */
  isMethodDefined(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(carrierOf(this), name);
  }
}

/** The prototype-chain link holding a module's instance methods. */
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
 * Symbol keys for Ruby's Module#included and Module#extended callbacks.
 * Using symbols avoids collisions with real method names.
 */
export const included = Symbol.for("@blazetrails/activesupport:included");
export const extended = Symbol.for("@blazetrails/activesupport:extended");

/**
 * Per-prototype registry of method keys installed by a previous `include()`.
 *
 * Ruby's `include A; include B` places B higher in the ancestry than A, so a
 * method B defines wins over the same method in A — but neither wins over a
 * method defined directly in the class body. A raw `hasOwnProperty` check on
 * the prototype can't tell those two cases apart (both are own properties), so
 * we track which own keys arrived via `include()`. A collision on a tracked key
 * is an earlier mixin and gets replaced (last-included wins); a collision on an
 * untracked key is a class-body method and is preserved.
 */
const includedKeys = Symbol.for("@blazetrails/activesupport:includedKeys");

/**
 * The singleton-side twin of {@link includedKeys}: the static keys a previous
 * `extend()` installed on a class.
 *
 * Ruby's `include SomeModule` puts `SomeModule::ClassMethods` on the includer's
 * singleton ancestry BELOW the class body (concern.rb:135-138 — `base.extend
 * const_get(:ClassMethods)`), so a `def self.x` written in the class body wins
 * over the module's `x`, while a later `extend` wins over an earlier one.
 */
const extendedKeys = Symbol.for("@blazetrails/activesupport:extendedKeys");

/**
 * Per-prototype registry of the modules a prototype has been given by
 * `include()` — the ancestry Ruby's `Module#<` asks about.
 */
const includedModules = Symbol.for("@blazetrails/activesupport:includedModules");

const STATIC_CLASS_KEYS = new Set(["prototype", "length", "name"]);

function trackedKeys(proto: object, registry: symbol = includedKeys): Set<string> {
  let set = (proto as any)[registry] as Set<string> | undefined;
  if (!Object.prototype.hasOwnProperty.call(proto, registry)) {
    // Own the set per prototype so subclasses don't share a parent's registry.
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

/**
 * Record `mod` in the prototype's own included-module registry, so
 * {@link isModuleIncluded} can answer Ruby's `Module#<` for it.
 */
function trackIncludedModule(proto: object, mod: unknown): void {
  let set = (proto as any)[includedModules] as Set<unknown> | undefined;
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
 * @noRailsEquivalent PERMANENT — Ruby spells this `<`, an operator TypeScript
 * cannot define; the predicate carries the same question at a callable name.
 */
export function isModuleIncluded(
  klass: { prototype: object },
  mod: ModuleObject | AnyClass | Module,
): boolean {
  for (
    let proto: object | null = klass.prototype;
    proto;
    proto = Object.getPrototypeOf(proto) as object | null
  ) {
    if (!Object.prototype.hasOwnProperty.call(proto, includedModules)) continue;
    const mods = (proto as any)[includedModules] as Set<unknown>;
    if (mods.has(mod)) return true;
    const eq = (mod as { equals?: (other: unknown) => boolean }).equals;
    if (typeof eq === "function") {
      for (const m of mods) if (eq.call(mod, m)) return true;
    }
  }
  return false;
}

class ArgumentError extends Error {
  override name = "ArgumentError";
}

/**
 * Symbol key for the per-section visibility record `defineModule` stamps onto
 * the flat module object it returns. Symbol-keyed so it never collides with a
 * real method name, and so `Object.keys()` consumers see the module unchanged.
 */
export const moduleVisibility = Symbol.for("@blazetrails/activesupport:moduleVisibility");

/** The visibility record `defineModule` stamps under `moduleVisibility`. */
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
 * Mirrors: Ruby's Module#public_instance_methods — the module's public
 * instance methods, own-only when `includeSuper` is false.
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

/**
 * Shared between `Included<>` and `Extended<>`: filter `M` down to its
 * callable string-keyed properties and strip the `this` parameter from
 * each signature.
 *
 * Implementation note: `M` is constrained to `object` rather than the
 * runtime `Module = Record<string, any>`. The runtime shape forces
 * a string index signature into every result, which propagates into
 * any merging class — and every subclass — and demands every property
 * be assignable to `(...args: unknown[]) => unknown`. That breaks
 * classes mixing this type and also having non-method fields (e.g.
 * arel's `Attribute` with `relation`, `name`, `caster`). `object` is
 * wide enough to accept any module literal but carries no index
 * signature. Filtering callable keys via
 * `M[K] extends (this: any, ...args: any[]) => any` keeps the result
 * tight to the literal method keys of the passed module.
 */
type CallableMethods<M extends object> = {
  [K in keyof M as K extends string
    ? M[K] extends (this: any, ...args: any[]) => any
      ? K
      : never
    : never]: M[K] extends (this: any, ...args: infer A) => infer R ? (...args: A) => R : never;
};

/**
 * Derive instance method types from an included module object.
 * Strips the `this` parameter from each function signature.
 *
 * Usage:
 *   export interface Relation<T> extends Included<typeof QueryMethods> {}
 */
export type Included<M extends object> = CallableMethods<M>;

/**
 * Ruby's `include`/`prepend`/`extend` are defined in terms of the module's own
 * `append_features`/`prepend_features`/`extended` hooks, which a module may
 * override — `Deprecation::DeprecatedConstantProxy` overrides all three to warn
 * first (proxy_wrappers.rb:156-169). Only a `Module` instance can carry them.
 */
function featureHook(mod: unknown, name: string): ((base: unknown) => void) | undefined {
  if (!(mod instanceof Module)) return undefined;
  const hook = (mod as unknown as Record<string, unknown>)[name];
  return typeof hook === "function" ? (hook as (base: unknown) => void).bind(mod) : undefined;
}

export function include(klass: AnyClass, mod: ModuleObject | AnyClass | Module): void {
  const appendFeatures = featureHook(mod, "appendFeatures");
  if (appendFeatures) return appendFeatures(klass);
  trackIncludedModule(klass.prototype, mod);
  if (mod instanceof Module) {
    const proto = klass.prototype as object;
    const carrier = Object.create(Object.getPrototypeOf(proto)) as Record<string, unknown>;
    Object.defineProperties(carrier, Object.getOwnPropertyDescriptors(carrierOf(mod)));
    carriers.set(mod, carrier);
    Object.setPrototypeOf(proto, carrier);
    if (typeof (mod as any)[included] === "function") {
      (mod as any)[included](klass);
    }
    return;
  }
  const descriptors: PropertyDescriptorMap = {};
  const installed = trackedKeys(klass.prototype);

  // When `mod` is a class (has a prototype with own descriptors), read
  // descriptors directly — this preserves accessor properties (Ruby's
  // `def key=` / `def key` translate to getters/setters in TS) alongside
  // plain methods. Plain-object modules still work via Object.keys.
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
      // Accessor pairs: in TS `get`/`set` share one property name, but Ruby
      // treats a getter (`key`) and setter (`key=`) as two independent methods,
      // each resolved by ancestry on its own. So merge the pair, letting the
      // half from whichever descriptor is higher in the ancestry win and the
      // other fill in a half it doesn't define. An earlier-included mixin
      // (tracked) sits below the later `mod`; the class body (untracked) sits
      // above every mixin.
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
        // A half still owned by the class body keeps class-body precedence, so
        // only track the key when both halves are mixin-supplied.
        if (existingIsMixin) installed.add(key);
      } else if (existingIsMixin) {
        // Value (method) collision with an earlier-included mixin: Ruby puts the
        // later module higher in the ancestry, so the later include wins.
        descriptors[key] = modDesc;
      }
      // Otherwise the existing key is a class-body method — Ruby's include never
      // replaces it, so leave it untouched.
    }
  } else {
    for (const key of Object.keys(mod as ModuleObject)) {
      const value = (mod as ModuleObject)[key];
      // Ruby's include copies only instance methods — skip non-function values
      // and Ruby-style constants (uppercase first char mirrors Ruby constant naming).
      if (typeof value !== "function" || /^[A-Z]/.test(key)) continue;
      // A collision with a class-body method is never replaced (Ruby keeps the
      // class body); a collision with an earlier-included mixin is replaced
      // (Ruby's later include wins). Untracked own key === class body.
      if (Object.prototype.hasOwnProperty.call(klass.prototype, key) && !installed.has(key)) {
        continue;
      }
      installed.add(key);
      descriptors[key] = {
        value,
        writable: true,
        configurable: true,
        enumerable: false,
      };
    }
  }
  Object.defineProperties(klass.prototype, descriptors);

  // Ruby's Module#included(base) — fires after methods are copied
  if (typeof (mod as any)[included] === "function") {
    (mod as any)[included](klass);
  }
}

/**
 * Derive static method types from an extended module object.
 * Strips the `this` parameter from each function signature.
 *
 * Usage:
 *   interface BaseStatic extends Extended<typeof ConnectionHandlingMethods> {
 *     new (...args: any[]): Base;
 *   }
 *   extend(Base, ConnectionHandlingMethods);
 *   const TypedBase = Base as unknown as BaseStatic;
 */
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
 * Mirrors: Ruby's Module#prepend (core language feature)
 */
export function prepend(klass: AnyClass, mod: ModuleObject | AnyClass | Module): void {
  const prependFeatures = featureHook(mod, "prependFeatures");
  if (prependFeatures) return prependFeatures(klass);
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
 * Mirrors: Ruby's Object#extend (core language feature)
 *
 * Usage:
 *   extend(Base, ConnectionHandlingMethods);
 *   // Now Base.connectedTo(...) works
 */
export function extend(klass: AnyClass | object, mod: ModuleObject | AnyClass | Module): void {
  const extendedHook = featureHook(mod, "extended");
  if (extendedHook) return extendedHook(klass);
  // A class module carries its members as non-enumerable own statics, so read
  // its property names directly; a plain-object module keeps the Object.keys
  // (enumerable-only) semantics.
  const isClassModule = typeof mod === "function" && (mod as AnyClass).prototype;
  const keys = isClassModule
    ? Object.getOwnPropertyNames(mod).filter((k) => !STATIC_CLASS_KEYS.has(k))
    : Object.keys(mod);
  const installed = trackedKeys(klass, extendedKeys);

  for (const key of keys) {
    const modDesc = Object.getOwnPropertyDescriptor(mod, key);
    if (!modDesc || /^[A-Z]/.test(key)) continue;
    // Ruby's extend copies only methods — skip non-functions and constants.
    if (!modDesc.get && !modDesc.set && typeof modDesc.value !== "function") continue;
    const existing = Object.getOwnPropertyDescriptor(klass, key);
    // Ruby names the two accessor halves `key` and `key=` and resolves each on
    // its own, so each half is tracked under the name Ruby gives it.
    const writer = `${key}=`;
    const getterIsMixin = installed.has(key);
    const setterIsMixin = installed.has(writer);
    const modIsAccessor = modDesc.get != null || modDesc.set != null;
    // Copy accessors as accessors: reading `mod[key]` would invoke the getter
    // with the module as receiver instead of the extending class.
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

  // Ruby's Module#extended(base) — fires after methods are copied
  if (typeof (mod as any)[extended] === "function") {
    (mod as any)[extended](klass);
  }
}
