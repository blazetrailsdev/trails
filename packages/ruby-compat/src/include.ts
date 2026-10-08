/**
 * Ruby-style `include` for mixing module methods into a class.
 *
 * In Ruby, `include SomeModule` copies the module's instance methods
 * onto the including class's method lookup chain. This function does
 * the TypeScript equivalent: assigns each method from the module object
 * onto `klass.prototype`.
 *
 * Mirrors: Ruby's Module#include — vendor/ruby/v3.3.11/eval.c:1139 `rb_mod_include`,
 * backed by vendor/ruby/v3.3.11/class.c:1179 `rb_include_module`.
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
import { NameError } from "./name-error.js";
import { isRegisteredConstant, registeredConstant } from "./variable.js";
import { temporalTag } from "./temporal-tag.js";
import { Enumerable } from "./enumerable.js";
import { Hash } from "./hash.js";
import { TypeError } from "./type-error.js";
import { BigDecimal } from "./big-decimal.js";
import { Complex } from "./complex.js";
import { Rational } from "./rational.js";
import {
  FL_SINGLETON,
  T_ICLASS,
  classpaths,
  rbSetClassPathString,
  rbAnyToS,
  rbCBasicObject,
  rbCClass,
  rbClassSuperclass,
  rbCDate,
  rbCNumeric,
  rbObjClass,
  rbCString,
  rbCTime,
  rbModAttrReader,
  rbModAttrWriter,
  rbModName,
  rbModToS,
  UNDEF_METHOD_TABLES,
} from "./object.js";

type AnyClass = new (...args: never[]) => unknown;
type ModuleObject = object;
type AnyFunction = (...args: never) => unknown;
type ModuleHooks = {
  [included]?: (klass: unknown) => void;
  [extended]?: (klass: unknown) => void;
  [initialize]?: (this: object, ...args: never[]) => void | Generator;
};

/**
 * Mirrors: Ruby's Module#const_set — vendor/ruby/v3.3.11/object.c:2545
 * `rb_mod_const_set`, which raises `NameError` for a name that is not a
 * constant name (`id_for_var`, object.c:2220-2240): an uppercase or titlecase
 * letter (`rb_sym_constant_char_p`, vendor/ruby/v3.3.11/symbol.c:218-250), then
 * identifier characters (`is_identchar`, symbol.c:54). It then calls `const_set`
 * (vendor/ruby/v3.3.11/variable.c:3607). Binding a module names it after the
 * owner (variable.c:3648-3668), as it does a class: permanently under a named
 * owner, and under an anonymous one with the owner's temporary path, until a
 * named owner re-paths it. `Module#name` and `Module#inspect` read that path.
 * `rb_namespace_p` (variable.c:83) admits a class or a module: a class here is a function
 * whose `prototype` is non-writable, which holds for `class` syntax and the
 * built-in constructors and for no arrow, bound or `function` function — the
 * test `rbInspect` applies before rendering a value through `rbModToS`.
 *
 * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
 */
export function rbModConstSet<T>(
  mod: Module | (abstract new (...args: never) => unknown) | { readonly name: string },
  id: string,
  value: T,
): T {
  if (!/^[\p{Lu}\p{Lt}](?:\w|\P{ASCII})*$/u.test(id)) {
    throw new NameError(`wrong constant name ${id}`, id);
  }
  Object.defineProperty(mod, id, { value, writable: true, enumerable: true, configurable: true });
  if (
    value instanceof Module ||
    (typeof value === "function" &&
      Object.getOwnPropertyDescriptor(value, "prototype")?.writable === false)
  ) {
    const klass = mod as abstract new (...args: never) => unknown;
    const valPath = classpaths.get(value);
    if (mod === Object) {
      if (valPath?.permanent !== true) classpaths.set(value, { path: id, permanent: true });
      return value;
    }
    const parentalPathPermanent =
      mod instanceof Module ? classpaths.get(mod)?.permanent === true : Boolean(mod.name);
    const parentalPath = parentalPathPermanent
      ? mod instanceof Module
        ? mod.name
        : rbModName(klass)
      : mod instanceof Module
        ? mod.inspect()
        : rbModToS(klass);
    if (parentalPathPermanent && valPath?.permanent !== true) {
      classpaths.set(value, { path: `${parentalPath}::${id}`, permanent: true });
    } else if (!parentalPathPermanent && valPath === undefined) {
      classpaths.set(value, { path: `${parentalPath}::${id}`, permanent: false });
    }
  }
  return value;
}

/**
 * Mirrors: Ruby's Module#const_defined? — vendor/ruby/v3.3.11/object.c:2596
 * `rb_mod_const_defined`, which raises `NameError` for a name that is not a
 * constant name and otherwise answers `rb_const_defined`: the constant on the
 * module or one of its ancestors, or on the module alone when `recur` is
 * false. A `::` path is walked a segment at a time, each
 * later segment read from the namespace before it alone, and the first also
 * from the top-level table `registerConstant` fills.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbModConstDefined(
  mod: Module | (abstract new (...args: never) => unknown) | { readonly name: string },
  name: string,
  recur: boolean = true,
): boolean {
  if (recur && isRegisteredConstant(name)) return true;
  let c: unknown = mod;
  for (const [i, part] of name.split("::").entries()) {
    if (!/^[\p{Lu}\p{Lt}](?:\w|\P{ASCII})*$/u.test(part)) {
      throw new NameError(`wrong constant name ${name}`, name);
    }
    if (c === null || (typeof c !== "object" && typeof c !== "function")) return false;
    if (i === 0 && recur ? part in c : Object.prototype.hasOwnProperty.call(c, part)) {
      c = (c as Record<string, unknown>)[part];
    } else if (i === 0 && recur && isRegisteredConstant(part)) {
      c = registeredConstant(part);
    } else {
      return false;
    }
  }
  return true;
}

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
 * Mirrors: Ruby's Module.new — vendor/ruby/v3.3.11/object.c:1950 `rb_mod_initialize`.
 *
 * @noRailsEquivalent PERMANENT — a Ruby core class, not a Rails one.
 */
export class Module<I extends object = Record<never, never>> {
  /**
   * Mirrors: Ruby's Module.new — vendor/ruby/v3.3.11/object.c:1950
   * `rb_mod_initialize`, which hands a given block the new module
   * (`rb_mod_module_exec(1, &module, module)`, object.c:1959).
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  constructor(block?: (mod: Module) => void) {
    if (block !== undefined) block(this);
  }

  /**
   * Mirrors: Ruby's Module#to_s — vendor/ruby/v3.3.11/object.c:1710
   * `rb_mod_to_s`, the method `Module#inspect` is an alias of
   * (vendor/ruby/v3.3.11/object.c:4438-4439).
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  toS(): string {
    return this.name ?? rbAnyToS(this);
  }

  /**
   * Mirrors: Ruby's Module#inspect — vendor/ruby/v3.3.11/object.c:1710
   * `rb_mod_to_s`, which renders `rb_class_name`: the classpath, or the
   * `#<Klass:0x…>` path `make_temporary_path` (vendor/ruby/v3.3.11/variable.c:320)
   * gives an anonymous one.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  inspect(): string {
    return modToS.call(this);
  }

  /**
   * Mirrors: Ruby's Module#name — vendor/ruby/v3.3.11/variable.c:122
   * `rb_mod_name`: the classpath `const_set` gave the module, or `nil` while
   * it is anonymous.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  get name(): string | null {
    return classpaths.get(this)?.path ?? null;
  }

  /**
   * Mirrors: Ruby's Module#module_eval — vendor/ruby/v3.3.11/vm_eval.c:2128
   * `rb_mod_module_eval` — yields the module's method table.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  moduleEval<T>(block: (mod: Partial<I> & Record<string, unknown>) => T): T {
    const carrier = carrierOf(this) as Partial<I> & Record<string, unknown>;
    const before: Record<PropertyKey, PropertyDescriptor | undefined> =
      Object.getOwnPropertyDescriptors(carrier);
    const result = block(carrier);
    const installed = trackedKeys(carrier);
    for (const key of installed) {
      const after = Object.getOwnPropertyDescriptor(carrier, key);
      if (after?.value !== before[key]?.value || after?.get !== before[key]?.get) {
        installed.delete(key);
      }
    }
    relinkIncluders(this);
    return result;
  }

  /**
   * Mirrors: Ruby's Module#include into a module — vendor/ruby/v3.3.11/class.c:1179
   * `rb_include_module`, which splices `mod` BELOW this module, so a method
   * this module defines itself outranks the included one. A module already
   * included is skipped (`include_modules_at`, class.c:1281,1291,1296). A
   * module defining `appendFeatures` gets that call instead, then `included`,
   * as `rb_mod_include` sends both (vendor/ruby/v3.3.11/eval.c:1159-1160).
   * `ensure_includable` (class.c:1168-1176) rejects a Ruby `Class`; a TS class
   * passed here is a class module, the spelling {@link include} already takes
   * for a Ruby module that carries accessors, so its prototype methods are
   * the module's method table.
   *
   * A plain-object module's getter and setter are methods too (`def title` /
   * `def title=`), so the pair is carried as an accessor, uncalled. An ES
   * module namespace (`import * as Helper`) is the exception: its exports are
   * functions a bundler may serve through getters, so each is read and
   * installed as the method it names.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  include(mod: ModuleObject): this {
    const appendFeatures = featureHook(mod, "appendFeatures");
    if (appendFeatures) {
      appendFeatures(this);
      if (typeof (mod as ModuleHooks)[included] === "function") {
        (mod as ModuleHooks)[included]!(this);
      } else {
        featureHook(mod, "included")?.(this);
      }
      return this;
    }
    const carrier = carrierOf(this);
    if (!isModuleMethodTablePresent({ prototype: carrier }, mod)) {
      trackIncludedModule(carrier, mod);
      if (mod instanceof Module) {
        let nested = nestedModules.get(this);
        if (!nested) nestedModules.set(this, (nested = []));
        nested.push(mod);
        return this;
      }
      const installed = trackedKeys(carrier);
      const members = (typeof mod === "function" ? (mod as AnyClass).prototype : mod) as Record<
        string,
        unknown
      >;
      const namespace = (members as { [Symbol.toStringTag]?: string })[Symbol.toStringTag];
      for (const key of typeof mod === "function"
        ? Object.getOwnPropertyNames(members)
        : Object.keys(members)) {
        if (key === "constructor") continue;
        const descriptor = Object.getOwnPropertyDescriptor(members, key)!;
        const accessor = !("value" in descriptor) && namespace !== "Module";
        if (/^[A-Z]/.test(key) || (!accessor && typeof members[key] !== "function")) continue;
        if (Object.prototype.hasOwnProperty.call(carrier, key) && !installed.has(key)) continue;
        installed.add(key);
        Object.defineProperty(
          carrier,
          key,
          accessor
            ? { get: descriptor.get, set: descriptor.set, configurable: true }
            : { value: members[key], writable: true, configurable: true },
        );
      }
      relinkIncluders(this);
    }
    if (typeof (mod as ModuleHooks)[included] === "function") {
      (mod as ModuleHooks)[included]!(this);
    }
    return this;
  }

  /**
   * Mirrors: Ruby's Module#include? — vendor/ruby/v3.3.11/class.c:1538
   * `rb_mod_include_p`, which walks the module's ancestry, so a module
   * included by an included module answers true.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  isInclude(mod2: object): boolean {
    if (isModuleMethodTablePresent({ prototype: carrierOf(this) }, mod2)) return true;
    return (nestedModules.get(this) ?? []).some((nested) => nested.isInclude(mod2));
  }

  /**
   * Mirrors: Ruby's Module#define_method — vendor/ruby/v3.3.11/proc.c:2325
   * `rb_mod_define_method`.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  defineMethod(name: string, body: (...args: never[]) => unknown): void {
    trackedKeys(carrierOf(this)).delete(name);
    Object.defineProperty(carrierOf(this), name, {
      value: body,
      writable: true,
      configurable: true,
    });
    relinkIncluders(this);
  }

  /**
   * Mirrors: Ruby's Module#instance_method — the named method, detached from
   * this module. Ruby returns an `UnboundMethod`, which `define_method` binds
   * into another module; the TS carrier of that is the property descriptor,
   * which `Object.defineProperty` re-installs and which — unlike a bare
   * function — also carries an accessor pair.
   *
   * vendor/ruby/v3.3.11/proc.c:2190 `rb_mod_instance_method`.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  instanceMethod(name: string): PropertyDescriptor | undefined {
    return Object.getOwnPropertyDescriptor(carrierOf(this), name);
  }

  /**
   * Mirrors: Ruby's Module#ancestors — vendor/ruby/v3.3.11/class.c:1570
   * `rb_mod_ancestors`: the module, then the modules it includes, most
   * recently included first, each followed by its own.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  ancestors(): object[] {
    const ary: object[] = [this];
    const carrier = carrierOf(this) as Record<symbol, unknown>;
    const mods = Object.prototype.hasOwnProperty.call(carrier, includedModulesKey)
      ? [...(carrier[includedModulesKey] as Set<object>)]
      : [];
    for (const mod of mods.reverse()) {
      for (const m of mod instanceof Module ? mod.ancestors() : [mod]) {
        if (!ary.includes(m)) ary.push(m);
      }
    }
    return ary;
  }

  /**
   * Mirrors: Ruby's Module#instance_methods — vendor/ruby/v3.3.11/class.c:1889
   * `rb_class_instance_methods`, whose `include_super` defaults to true: the
   * methods of the module's ancestors follow its own, and a name a nearer
   * module undefines stays hidden.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  instanceMethods(includeSuper: boolean = true): string[] {
    const seen = new Set<string>();
    const ary: string[] = [];
    for (const mod of includeSuper ? this.ancestors() : [this]) {
      if (!(mod instanceof Module)) continue;
      const carrier = carrierOf(mod);
      for (const name of Object.getOwnPropertyNames(carrier)) {
        if (seen.has(name)) continue;
        seen.add(name);
        if (!isUndefEntry(carrier, name)) ary.push(name);
      }
    }
    return ary;
  }

  /**
   * Mirrors: Ruby's Module#remove_method — vendor/ruby/v3.3.11/vm_method.c:1728
   * `rb_mod_remove_method`.
   *
   * @noRailsEquivalent PERMANENT
   */
  removeMethod(...names: string[]): this {
    const carrier = carrierOf(this);
    try {
      for (const name of names) {
        if (!Object.prototype.hasOwnProperty.call(carrier, name)) {
          throw new NameError(`method '${name}' not defined in #<Module>`, name);
        }
        delete carrier[name];
      }
    } finally {
      relinkIncluders(this);
    }
    return this;
  }

  /**
   * Mirrors: Ruby's Module#undef_method — vendor/ruby/v3.3.11/vm_method.c:1973
   * `rb_mod_undef_method`.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  undefMethod(...names: string[]): this {
    const carrier = carrierOf(this);
    try {
      for (const name of names) {
        if (!Object.prototype.hasOwnProperty.call(carrier, name) || isUndefEntry(carrier, name)) {
          throw new NameError(`undefined method '${name}' for module '#<Module>'`, name);
        }
        trackedKeys(carrier).delete(name);
        Object.defineProperty(carrier, name, {
          value: undefined,
          writable: true,
          configurable: true,
        });
      }
    } finally {
      relinkIncluders(this);
    }
    return this;
  }

  /**
   * Mirrors: Ruby's Module#alias_method — vendor/ruby/v3.3.11/vm_method.c:2366
   * `rb_mod_alias_method`.
   *
   * @noRailsEquivalent PERMANENT
   */
  aliasMethod(newName: string, oldName: string): string {
    const descriptor = Object.getOwnPropertyDescriptor(carrierOf(this), oldName);
    if (!descriptor) {
      throw new NameError(`undefined method '${oldName}' for module '#<Module>'`, oldName);
    }
    trackedKeys(carrierOf(this)).delete(newName);
    Object.defineProperty(carrierOf(this), newName, descriptor);
    relinkIncluders(this);
    return newName;
  }

  /**
   * Mirrors: Ruby's Module#append_features — vendor/ruby/v3.3.11/eval.c:1110
   * `rb_mod_append_features`, the splice `include` runs before `included`.
   * A `Module` this module included is spliced beneath it, as
   * `include_modules_at` (vendor/ruby/v3.3.11/class.c:1253) walks the included
   * module's own ancestry, skipping one already in `base`'s.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  appendFeatures(base: AnyClass): void {
    for (const mod of nestedModules.get(this) ?? []) {
      if (!isModuleMethodTablePresent(base, mod)) Module.prototype.appendFeatures.call(mod, base);
    }
    trackIncludedModule(base.prototype, this);
    const instanceInitializer = (this as ModuleHooks)[initialize];
    if (typeof instanceInitializer === "function") {
      trackInstanceInitializer(base.prototype, instanceInitializer);
    }
    const proto = base.prototype as object;
    const link = Object.create(Object.getPrototypeOf(proto)) as object;
    Object.defineProperties(link, Object.getOwnPropertyDescriptors(carrierOf(this)));
    let links = includerCarriers.get(this);
    if (!links) includerCarriers.set(this, (links = []));
    links.push(link);
    UNDEF_METHOD_TABLES.add(link);
    Object.defineProperty(link, T_ICLASS, { value: this });
    Object.setPrototypeOf(proto, link);
  }

  /**
   * Mirrors: Ruby's Module#prepend_features — vendor/ruby/v3.3.11/eval.c:1175
   * `rb_mod_prepend_features`, the splice `prepend` runs before `prepended`.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  prependFeatures(base: AnyClass): void {
    trackIncludedModule(base.prototype, this);
    const instanceInitializer = (this as ModuleHooks)[initialize];
    if (typeof instanceInitializer === "function") {
      trackInstanceInitializer(base.prototype, instanceInitializer, prependedInstanceInitializers);
    }
    const source = carrierOf(this);
    for (const key of Object.getOwnPropertyNames(source)) {
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (descriptor) Object.defineProperty(base.prototype, key, descriptor);
    }
  }

  /**
   * Mirrors: Ruby's Module#extend_object — vendor/ruby/v3.3.11/eval.c:1746
   * `rb_mod_extend_object`, which `rb_extend_object` (:1713) runs as
   * `rb_include_module(rb_singleton_class(obj), module)`: the module's link is
   * spliced between `obj` and its class, so a later `extend` sits above it and
   * `superMethod` resumes the lookup at the next link. A module already in
   * `obj`'s ancestry is skipped, as `include_modules_at` skips one
   * (vendor/ruby/v3.3.11/class.c:1281,1291,1296).
   *
   * One link is made per extended object, so singleton links are held through
   * `WeakRef`s that `relinkIncluders` still walks, keeping a later
   * `defineMethod` visible on an already-extended object as Ruby's shared
   * method table does, without retaining the object.
   *
   * A class's constructor reaches its superclass through the same prototype
   * link (`super()` reads `Object.getPrototypeOf(klass)`), so the link spliced
   * above a class is itself a subclass of the class's parent.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  extendObject(obj: object): void {
    for (let proto = Object.getPrototypeOf(obj) as object | null; proto; ) {
      if (isLinkOf(this, proto)) return;
      proto = Object.getPrototypeOf(proto) as object | null;
    }
    for (const mod of nestedModules.get(this) ?? []) Module.prototype.extendObject.call(mod, obj);
    trackIncludedModule(obj, this);
    const parent = Object.getPrototypeOf(obj) as object | null;
    const link: object =
      typeof obj === "function" && typeof parent === "function" && parent !== Function.prototype
        ? class extends (parent as new (...args: never[]) => object) {}
        : (Object.create(parent) as object);
    Object.defineProperties(link, Object.getOwnPropertyDescriptors(carrierOf(this)));
    let links = singletonCarriers.get(this);
    if (!links) singletonCarriers.set(this, (links = { members: new WeakSet(), refs: new Set() }));
    const ref = new WeakRef(link);
    links.members.add(link);
    UNDEF_METHOD_TABLES.add(link);
    links.refs.add(ref);
    singletonReaper.register(link, { mod: this, ref });
    Object.defineProperty(link, T_ICLASS, { value: this });
    Object.setPrototypeOf(obj, link);
  }

  /**
   * Mirrors: Ruby's `super` from one of this module's methods —
   * vendor/ruby/v3.3.11/vm_insnhelper.c:4648 `vm_search_super_method`, the lookup
   * `Method#super_method` exposes (vendor/ruby/v3.3.11/proc.c:3391): resume the method
   * search at `RCLASS_SUPER` of the iclass this module contributed to
   * `receiver`'s ancestry. Answers the next method bound to `receiver`, or
   * `undefined` where Ruby's `super_method` answers nil.
   *
   * A JS function's `super` is fixed to its home object, which for a carrier
   * method is the module's own table, not the includer's link, so the link is
   * found on the receiver's prototype chain instead.
   *
   * Every ancestry ends in `Object`, which includes `Kernel`, so a `super` that
   * no link beneath the caller answers reaches `Kernel`'s method. No JS object
   * stands at that root, so the search ends in the `Kernel` module's table.
   *
   * A reader and writer generated as one accessor pair are two Ruby methods,
   * `name` and `name=`, so `name` answers the next getter and `name=` the next
   * setter, each looked up independently the way Ruby looks each method up.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  superMethod(receiver: object, name: string): ((...args: unknown[]) => unknown) | undefined {
    for (let proto = Object.getPrototypeOf(receiver) as object | null; proto; ) {
      if (isLinkOf(this, proto)) {
        const writer = name.endsWith("=");
        const key = writer ? name.slice(0, -1) : name;
        for (let next = Object.getPrototypeOf(proto) as object | null; next; ) {
          const descriptor = Object.getOwnPropertyDescriptor(next, key);
          next = Object.getPrototypeOf(next) as object | null;
          if (descriptor === undefined) continue;
          if (!("value" in descriptor)) {
            const half = writer ? descriptor.set : descriptor.get;
            if (half === undefined) continue;
            return half.bind(receiver) as (...args: unknown[]) => unknown;
          }
          return !writer && typeof descriptor.value === "function"
            ? (descriptor.value as (...args: unknown[]) => unknown).bind(receiver)
            : undefined;
        }
        const root = writer ? undefined : Kernel.instanceMethod(key)?.value;
        return typeof root === "function"
          ? (root as (...args: unknown[]) => unknown).bind(receiver)
          : undefined;
      }
      proto = Object.getPrototypeOf(proto) as object | null;
    }
    return undefined;
  }

  /**
   * Mirrors: Ruby's Module#attr_reader — vendor/ruby/v3.3.11/object.c:2279
   * `rb_mod_attr_reader`.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  attrReader(...argv: string[]): void {
    this.moduleEval((mod) => rbModAttrReader({ prototype: mod }, ...argv));
  }

  /**
   * Mirrors: Ruby's Module#attr_writer — vendor/ruby/v3.3.11/object.c:2335
   * `rb_mod_attr_writer`.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  attrWriter(...argv: string[]): void {
    this.moduleEval((mod) => rbModAttrWriter({ prototype: mod }, ...argv));
  }

  /**
   * Mirrors: Ruby's Module#method_defined? — vendor/ruby/v3.3.11/vm_method.c:2055
   * `rb_mod_method_defined`.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  isMethodDefined(name: string): boolean {
    const carrier = carrierOf(this);
    return Object.prototype.hasOwnProperty.call(carrier, name) && !isUndefEntry(carrier, name);
  }

  /**
   * Mirrors: Ruby's Module#dup — vendor/ruby/v3.3.11/object.c:591 `rb_obj_dup`,
   * whose `initialize_copy` is vendor/ruby/v3.3.11/class.c:524 `rb_mod_init_copy`:
   * the copy gets its own method table and a clone of the singleton class
   * (`rb_singleton_class_clone`, :545-548), and shares the modules it includes.
   * Nothing that already includes the original includes the copy.
   *
   * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
   */
  dup(): this {
    const copy = rbObjClone(this);
    const table = Object.getOwnPropertyDescriptors(carrierOf(this)) as Record<
      string | symbol,
      PropertyDescriptor
    >;
    for (const registry of [includedKeys, includedModulesKey]) {
      const set = table[registry];
      if (set) table[registry] = { ...set, value: new Set(set.value as Set<unknown>) };
    }
    carriers.set(copy, Object.create(null, table) as Record<string, unknown>);
    const nested = nestedModules.get(this);
    if (nested) nestedModules.set(copy, [...nested]);
    return copy;
  }
}

const modToS = Module.prototype.toS;

const carriers = new WeakMap<Module, Record<string, unknown>>();

const nestedModules = new WeakMap<Module, Module[]>();

function carrierOf(mod: Module): Record<string, unknown> {
  let carrier = carriers.get(mod);
  if (!carrier) {
    carrier = Object.create(null) as Record<string, unknown>;
    carriers.set(mod, carrier);
  }
  return carrier;
}

function isUndefEntry(carrier: Record<string, unknown>, name: string): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(carrier, name);
  return descriptor !== undefined && "value" in descriptor && descriptor.value === undefined;
}

const includerCarriers = new WeakMap<Module, object[]>();

const singletonCarriers = new WeakMap<
  Module,
  { members: WeakSet<object>; refs: Set<WeakRef<object>> }
>();

const singletonReaper = new FinalizationRegistry<{ mod: Module; ref: WeakRef<object> }>(
  ({ mod, ref }) => singletonCarriers.get(mod)?.refs.delete(ref),
);

function isLinkOf(mod: Module, proto: object): boolean {
  return (
    (includerCarriers.get(mod)?.includes(proto) ?? false) ||
    (singletonCarriers.get(mod)?.members.has(proto) ?? false)
  );
}

function linksOf(mod: Module): object[] {
  const singletons: object[] = [];
  for (const ref of singletonCarriers.get(mod)?.refs ?? []) {
    const link = ref.deref();
    if (link) singletons.push(link);
  }
  return [...(includerCarriers.get(mod) ?? []), ...singletons];
}

function relinkIncluders(mod: Module): void {
  const table = carrierOf(mod);
  for (const link of linksOf(mod)) {
    for (const name of Object.getOwnPropertyNames(link)) {
      if (
        !Object.prototype.hasOwnProperty.call(table, name) &&
        Object.getOwnPropertyDescriptor(link, name)!.configurable
      )
        delete (link as Record<string, unknown>)[name];
    }
    Object.defineProperties(link, Object.getOwnPropertyDescriptors(table));
  }
}

/**
 * Symbol key for Ruby's Module#included callback, which `rb_mod_include` fires
 * on the module once `append_features` has spliced it into the ancestry
 * (vendor/ruby/v3.3.11/eval.c:1160). Using a symbol avoids collisions with real method
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
 * (vendor/ruby/v3.3.11/eval.c:1795).
 *
 * @noRailsEquivalent PERMANENT — the TypeScript spelling of a Ruby lifecycle
 * hook, which the language has no equivalent of.
 */
export const extended = Symbol.for("@blazetrails/ruby-compat:extended");

/**
 * Symbol key for a module's `initialize`, the per-instance half of Ruby's
 * `include`. `rb_include_module` (vendor/ruby/v3.3.11/class.c:1179) splices the module
 * into the lookup chain, so a module that defines `initialize` and calls
 * `super` runs against every new instance of the including class — which is
 * how `ActiveRecord::Railties::ControllerRuntime#initialize`
 * (activerecord/lib/active_record/railties/controller_runtime.rb:26-29) seats
 * `db_runtime` on each controller.
 *
 * JavaScript has no construction hook a mixin can splice into, so the class at
 * the bottom of the chain calls `initializeIncludedModules(this)` where Ruby's
 * `initialize` calls `super`. Every root whose Ruby `initialize` carries such a
 * `super` does so: `ActionController::Metal` (`metal.rb:210-217`),
 * `ActiveModel::API` (`api.rb:80-85`, which `ActiveRecord::Base`'s constructor
 * reaches through its own `super` at `core.rb:477`), and `ActionView::Base`
 * (`base.rb:244-259`). `AbstractController::Base` defines no `initialize`
 * (`abstract_controller/base.rb`), so it has no `super` site to hook and a
 * mixin included there is seated by whichever subclass root does.
 *
 * A class module's generator `initialize`, included into a class that has a
 * superclass, is instead spliced between that class and its superclass, where
 * `rb_include_module` puts the module: a `super(...)` call, and the implicit
 * one of a class that declares no constructor, resolves its target through the
 * class's prototype when it runs. So `ActiveRecord::Type::Internal::Timezone#initialize`
 * (activerecord/lib/active_record/type/internal/timezone.rb:7-10) wraps its
 * includer's construction. The value the generator yields is the argument list
 * of an explicit `super(...)`, and a bare `yield` forwards the arguments it was
 * called with. A constructor has no `this` until its `super(...)` returns, so
 * the code before the `yield` runs once with `this` undefined, to read those
 * arguments, and the whole body then runs against the instance: that code may
 * only compute the arguments, and one that raises, or a superclass
 * constructor that does, leaves the code after the `yield` unrun. A `Module`'s
 * `initialize` that writes to `self` ahead of `super` (thor/actions.rb:72-85)
 * therefore stays on the root's `super` site.
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
 * superclass chain (vendor/ruby/v3.3.11/class.c:1281,1291,1296).
 *
 * `args` are the arguments a bare `super` forwards
 * (vendor/ruby/v3.3.11/vm_insnhelper.c:5620 `rb_vm_invokesuper`), which is how
 * `Thor::Shell#initialize(args, options, config)` (thor/shell.rb:44-48) reads
 * `config[:shell]`.
 *
 * An `initialize` that runs code before its `super`, as
 * `Thor::Actions#initialize` does (thor/actions.rb:72-85), is a generator
 * function whose `yield` stands where Ruby's `super` does: the code before the
 * `yield` runs before every initializer beneath it, the code after it once
 * they have completed. One that raises closes the generators above it, so an
 * `ensure` around `super` (a `finally` around the `yield`) runs and the code
 * after the `yield` does not. Only a synchronous generator function is read
 * this way: a constructor cannot await, so an async one is never resumed.
 *
 * Mirrors: the `super` call in a class whose ancestry carries module
 * `initialize` definitions — vendor/ruby/v3.3.11/class.c:1179 `rb_include_module`.
 *
 * @noRailsEquivalent PERMANENT — Ruby reaches these through `super`;
 * JavaScript has no construction hook a mixin can splice into.
 */
export function initializeIncludedModules(instance: object, ...args: unknown[]): void {
  const chain: Array<Array<(this: object, ...args: unknown[]) => void>> = [];
  for (
    let proto: object | null = Object.getPrototypeOf(instance) as object | null;
    proto;
    proto = Object.getPrototypeOf(proto) as object | null
  ) {
    const level: Array<(this: object, ...args: unknown[]) => void> = [];
    for (const registry of [instanceInitializers, prependedInstanceInitializers]) {
      if (!Object.prototype.hasOwnProperty.call(proto, registry)) continue;
      level.push(
        ...((proto as Record<symbol, unknown>)[registry] as Array<
          (this: object, ...args: unknown[]) => void
        >),
      );
    }
    if (level.length !== 0) chain.unshift(level);
    if (Object.prototype.hasOwnProperty.call(proto, delegateClass)) break;
  }
  const initializers = chain.flat();
  const unwind = (index: number): void => {
    if (index < 0) return;
    const initializer = initializers[index];
    if (Object.getPrototypeOf(initializer) === GeneratorFunction) {
      const body = initializer.call(instance, ...args) as unknown as Generator;
      body.next();
      try {
        unwind(index - 1);
      } catch (error) {
        body.return(undefined);
        throw error;
      }
      if (body.next().done !== true) {
        body.return(undefined);
        throw new TypeError("an initialize generator yields once, where Ruby calls super");
      }
    } else {
      unwind(index - 1);
      initializer.call(instance, ...args);
    }
  };
  unwind(initializers.length - 1);
}

const GeneratorFunction = Object.getPrototypeOf(function* () {}) as object;

function trackInstanceInitializer(
  proto: object,
  initializer: (this: object, ...args: never[]) => void,
  registry: symbol = instanceInitializers,
): void {
  let list = (proto as Record<symbol, unknown>)[registry] as
    | Array<(this: object, ...args: never[]) => void>
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

function spliceInstanceInitializer(
  klass: AnyClass,
  mod: object,
  initializer: (this: object, ...args: never[]) => void | Generator,
): void {
  const superclass = Object.getPrototypeOf(klass) as new (...args: unknown[]) => object;
  const link = class extends superclass {
    constructor(...args: unknown[]) {
      const zsuper = (
        initializer.call(undefined as never, ...(args as never[])) as Generator<
          unknown[] | undefined
        >
      ).next();
      super(...(zsuper.done !== true && zsuper.value !== undefined ? zsuper.value : args));
      const body = initializer.call(this, ...(args as never[])) as Generator;
      body.next();
      if (body.next().done !== true) {
        body.return(undefined);
        throw new TypeError("an initialize generator yields once, where Ruby calls super");
      }
    }
  };
  Object.defineProperty(link, T_ICLASS, { value: mod });
  Object.setPrototypeOf(klass, link);
}

const includedKeys = Symbol.for("@blazetrails/ruby-compat:includedKeys");

const extendedKeys = Symbol.for("@blazetrails/ruby-compat:extendedKeys");

const includedModulesKey = Symbol.for("@blazetrails/ruby-compat:includedModules");
const extendedOwners = new WeakMap<object, Map<string, object>>();

const delegateClass = Symbol.for("@blazetrails/ruby-compat:delegateClass");

const STATIC_CLASS_KEYS = new Set(["prototype", "length", "name"]);

function trackedKeys(proto: object, registry: symbol = includedKeys): Set<string | symbol> {
  let set = (proto as Record<symbol, unknown>)[registry] as Set<string | symbol> | undefined;
  if (!Object.prototype.hasOwnProperty.call(proto, registry)) {
    set = new Set<string | symbol>();
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
  let set = (proto as Record<symbol, unknown>)[includedModulesKey] as Set<unknown> | undefined;
  if (!Object.prototype.hasOwnProperty.call(proto, includedModulesKey)) {
    set = new Set<unknown>();
    Object.defineProperty(proto, includedModulesKey, {
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
    if (
      Object.prototype.hasOwnProperty.call(proto, includedModulesKey) &&
      ((proto as Record<symbol, unknown>)[includedModulesKey] as Set<unknown>).has(mod)
    ) {
      return true;
    }
    if (Object.prototype.hasOwnProperty.call(proto, delegateClass)) break;
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
 * Mirrors: Ruby's Module#include? — vendor/ruby/v3.3.11/class.c:1538
 * `rb_mod_include_p`.
 *
 * @noRailsEquivalent PERMANENT — Ruby spells this `<`, an operator TypeScript
 * cannot define; the predicate carries the same question at a callable name.
 */
export function isModuleIncluded(
  klass: { prototype: object },
  mod: ModuleObject | AnyClass | Module,
): boolean {
  return isModuleMethodTablePresent(klass, mod);
}

/**
 * Ruby's `Module#included_modules`: every module in `mod`'s ancestry, most
 * recently mixed in first. A class's singleton ancestry is its constructor's
 * static chain, so `includedModules({ prototype: klass })` answers
 * `klass.singleton_class.included_modules`.
 *
 * Mirrors: Ruby's Module#included_modules — vendor/ruby/v3.3.11/class.c:1508
 * `rb_mod_included_modules`.
 *
 * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
 */
export function includedModules(mod: { prototype: object }): unknown[] {
  const result: unknown[] = [];
  for (
    let proto: object | null = mod.prototype;
    proto;
    proto = Object.getPrototypeOf(proto) as object | null
  ) {
    if (!Object.prototype.hasOwnProperty.call(proto, includedModulesKey)) continue;
    const mods = [...((proto as Record<symbol, unknown>)[includedModulesKey] as Set<unknown>)];
    for (const m of mods.reverse()) if (!result.includes(m)) result.push(m);
  }
  return result;
}

/**
 * Ruby's `Module#ancestors`: the class, the modules mixed into it most
 * recently first, and then the same for each superclass up to `Object`.
 * `rb_mod_ancestors` reads the iclass of an included module off the
 * superclass chain; the registry `include()` keeps on each prototype is that
 * record here.
 *
 * `Object.prototype` is the seat of `Object`, whose own ancestry
 * (`Kernel`, `BasicObject`) no JS prototype carries.
 *
 * Mirrors: Ruby's Module#ancestors — vendor/ruby/v3.3.11/class.c:1570
 * `rb_mod_ancestors`.
 *
 * @noRailsEquivalent PERMANENT — a Ruby core method, not a Rails one.
 */
export function rbModAncestors(mod: { prototype: object }): object[] {
  const ary: object[] = [];
  for (let p: object | null = mod.prototype; p; p = Object.getPrototypeOf(p) as object | null) {
    if (Object.prototype.hasOwnProperty.call(p, "constructor")) {
      ary.push((p as { constructor: object }).constructor);
    }
    if (Object.prototype.hasOwnProperty.call(p, includedModulesKey)) {
      const mods = [...((p as Record<symbol, unknown>)[includedModulesKey] as Set<object>)];
      for (const m of mods.reverse()) if (!ary.includes(m)) ary.push(m);
    }
    if (p === Uint8Array.prototype) {
      for (const m of rbModAncestors(rbCString)) if (!ary.includes(m)) ary.push(m);
      return ary;
    }
    if (p === Object.prototype) ary.push(Kernel, rbCBasicObject);
  }
  return ary;
}

/**
 * `rb_obj_is_kind_of` (`vendor/ruby/v3.3.11/object.c:889`), `Object#kind_of?`
 * and `Module#===`: whether `c` is in the ancestry of `obj`'s class. A plain
 * object is a module's seat, as `include()` takes one.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbObjIsKindOf(obj: unknown, c: unknown): boolean {
  if (
    (typeof c === "function" || (typeof c === "object" && c !== null)) &&
    singletonSearchAncestor(obj, c)
  ) {
    return true;
  }
  const cl = rbObjClass(obj) as { prototype: object };

  if (cl === c) return true;

  if (typeof c === "function" || (typeof c === "object" && c !== null)) {
    return classSearchAncestor(cl, c);
  } else {
    throw new TypeError("class or module required");
  }
}

/**
 * `class_search_ancestor` (`vendor/ruby/v3.3.11/object.c:935`) over the
 * singleton class `CLASS_OF(obj)` starts at: the modules `obj` was `extend`ed
 * with, and for a class those of its superclasses too.
 */
function singletonSearchAncestor(obj: unknown, c: object): boolean {
  if (typeof obj !== "function" && (typeof obj !== "object" || obj === null)) return false;
  for (
    let p: object | null = obj;
    p;
    p = typeof p === "function" ? (Object.getPrototypeOf(p) as object | null) : null
  ) {
    if (!Object.hasOwn(p, extendedKeys) || !Object.hasOwn(p, includedModulesKey)) continue;
    const mods = (p as Record<symbol, unknown>)[includedModulesKey] as Set<object>;
    if (mods.has(c)) return true;
    if (typeof c !== "object") continue;
    for (const m of mods) {
      if (typeof m === "object" && Object.prototype.isPrototypeOf.call(c, m)) return true;
    }
  }
  return false;
}

/**
 * `rb_class_inherited_p` (`vendor/ruby/v3.3.11/object.c:1778`), `Module#<=`:
 * true when `mod` is `arg` or has it in its ancestry, false when `arg` has
 * `mod` in its own, and nil when the two are unrelated. The class-to-class
 * arm reads `RCLASS_SUPERCLASS_DEPTH`, a cache no JS class carries, so both
 * arms search the ancestry.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbClassInheritedP(mod: unknown, arg: unknown): boolean | null {
  if (mod === arg) return true;

  if (typeof arg !== "function" && (typeof arg !== "object" || arg === null)) {
    throw new TypeError("compared with non class/module");
  }
  if (classSearchAncestor(mod as { prototype: object }, arg)) {
    return true;
  }
  if (classSearchAncestor(arg as { prototype: object }, mod as object)) {
    return false;
  }
  return null;
}

/** `class_search_ancestor` (`vendor/ruby/v3.3.11/object.c:935`). */
function classSearchAncestor(cl: { prototype: object }, c: object): boolean {
  for (let p: object | null = cl.prototype; p; p = Object.getPrototypeOf(p) as object | null) {
    if (Object.prototype.hasOwnProperty.call(p, "constructor")) {
      if ((p as { constructor: object }).constructor === c) return true;
    }
    if (Object.prototype.hasOwnProperty.call(p, includedModulesKey)) {
      if (((p as Record<symbol, unknown>)[includedModulesKey] as Set<object>).has(c)) return true;
    }
    if (p === Uint8Array.prototype) return c === rbCString || classSearchAncestor(rbCString, c);
    if (p === Object.prototype && (c === Kernel || c === rbCBasicObject)) return true;
  }
  return false;
}

/**
 * `rb_mod_instance_method` (`vendor/ruby/v3.3.11/proc.c:2190`), `Module#instance_method`,
 * answering the `owner` (`method_owner`, `vendor/ruby/v3.3.11/proc.c:1988`): the
 * {@link rbModAncestors} entry that defines `mid`. That is the `Module` an
 * iclass link stands for, the module `include()` copied the entry from, most
 * recently included first, or the class the prototype belongs to.
 *
 * An `Object.prototype` member raises `NameError`: no Ruby class defines it,
 * the line `rbModPublicMethodDefined` draws for `Module#method_defined?`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbModInstanceMethod(mod: { prototype: object }, mid: string): UnboundMethod {
  const method = mnewUnbound(mod.prototype, mid);
  if (method !== null) return method;
  throw new NameError(
    `undefined method '${mid}' for class '${rbModToS(mod as unknown as new () => unknown)}'`,
    mid,
  );
}

/**
 * `rb_mod_public_instance_method` (`vendor/ruby/v3.3.11/proc.c:2207`),
 * `Module#public_instance_method`. Visibility is compile-time only, so it answers
 * as {@link rbModInstanceMethod} does.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbModPublicInstanceMethod(mod: { prototype: object }, mid: string): UnboundMethod {
  return rbModInstanceMethod(mod, mid);
}

/**
 * Ruby's `UnboundMethod`, as far as trails reads one: `owner`
 * (`method_owner`, `vendor/ruby/v3.3.11/proc.c:1988`), `super_method`
 * (`method_super_method`, `:3391`) and `bind_call` (`umethod_bind_call`, `:2713`).
 *
 * @noRailsEquivalent PERMANENT
 */
export interface UnboundMethod {
  owner: object;
  superMethod(): UnboundMethod | null;
  bindCall(recv: object, ...args: unknown[]): unknown;
}

function mnewUnbound(start: object | null, mid: string): UnboundMethod | null {
  const entry = methodEntry(start, mid);
  if (entry === null) return null;
  return {
    owner: entryOwner(entry, mid),
    superMethod: () => mnewUnbound(Object.getPrototypeOf(entry) as object | null, mid),
    bindCall: (recv, ...args) => {
      const desc = Object.getOwnPropertyDescriptor(entry, mid)!;
      if (typeof desc.value === "function") {
        return (desc.value as (...a: unknown[]) => unknown).apply(recv, args);
      }
      return desc.get ? desc.get.call(recv) : desc.value;
    },
  };
}

function methodEntry(start: object | null, mid: string): object | null {
  for (
    let link: object | null = start;
    link && link !== Object.prototype;
    link = Object.getPrototypeOf(link) as object | null
  ) {
    if (Object.hasOwn(link, mid)) return link;
  }
  return null;
}

/**
 * `method_owner` (`vendor/ruby/v3.3.11/proc.c:1988`) for the entry `mid` names from
 * `start`, or nil when there is none. An entry `extend()` copied onto an
 * object is owned by the module it came from, and a class's own static by the
 * class, which stands for its singleton class.
 *
 * @noRailsEquivalent PERMANENT
 */
export function methodOwner(start: object, mid: string): object | null {
  const entry = methodEntry(start, mid);
  return entry === null ? null : entryOwner(entry, mid);
}

function entryOwner(link: object, mid: string): object {
  const table = link as Record<symbol, unknown>;
  if (Object.hasOwn(link, T_ICLASS)) return table[T_ICLASS] as object;
  if (Object.hasOwn(link, includedKeys) && (table[includedKeys] as Set<string>).has(mid)) {
    const mods = [...(table[includedModulesKey] as Set<object>)].reverse();
    const owner = mods.find((m) => {
      if (m instanceof Module) return false;
      if (typeof m === "function") return Object.hasOwn(m.prototype as object, mid);
      return methodEntry(m, mid) !== null;
    });
    if (owner !== undefined) return owner;
  }
  if (Object.hasOwn(link, extendedKeys) && (table[extendedKeys] as Set<string>).has(mid)) {
    const defined = extendedOwners.get(link)?.get(mid);
    if (defined !== undefined) return defined;
    for (const m of [...(table[includedModulesKey] as Set<object>)].reverse()) {
      const owner = m instanceof Module ? null : methodEntry(m, mid);
      if (owner !== null) return owner;
    }
  }
  if (typeof link === "function" && link !== Function.prototype) return link;
  return link.constructor;
}

/**
 * Symbol key for the per-section visibility record `defineModule` stamps onto
 * the flat module object it returns. Symbol-keyed so it never collides with a
 * real method name, and so `Object.keys()` consumers see the module unchanged.
 *
 * The sections it records are the ones Ruby reads back through
 * `Module#private_instance_methods` — vendor/ruby/v3.3.11/class.c:1927
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
 * Mirrors: Ruby's Module.new body — vendor/ruby/v3.3.11/object.c:1950
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
 * Mirrors: Ruby's Module#public_instance_methods — vendor/ruby/v3.3.11/class.c:1942
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
 * `includeSuper` is inert on a `Module`, whose method table is one flat table
 * of its own methods.
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
    : never]: unknown extends ThisParameterType<M[K]>
    ? M[K]
    : M[K] extends (this: never, ...args: infer A) => infer R
      ? (...args: A) => R
      : never;
};

export type Included<M extends object> = CallableMethods<M extends Module<infer I> ? I : M>;

/** @noRailsEquivalent PERMANENT */
export type Initialized<K extends abstract new (...args: never[]) => object, M> = (new (
  ...args: M extends { [initialize]: (...args: infer A) => unknown } ? A : never
) => InstanceType<K>) &
  Pick<K, keyof K>;

function isClass(klass: object): klass is AnyClass {
  return typeof klass === "function";
}

function featureHook(mod: unknown, name: string): ((base: unknown) => void) | undefined {
  if (!(mod instanceof Module)) return undefined;
  const hook = (mod as unknown as Record<string, unknown>)[name];
  if (hook === (Module.prototype as unknown as Record<string, unknown>)[name]) return undefined;
  return typeof hook === "function" ? (hook as (base: unknown) => void).bind(mod) : undefined;
}

/**
 * Mirrors: Ruby's Module#include — vendor/ruby/v3.3.11/eval.c:1139 `rb_mod_include`,
 * backed by vendor/ruby/v3.3.11/class.c:1179 `rb_include_module`.
 *
 * @noRailsEquivalent PERMANENT — a Ruby core-language primitive, which Rails
 * uses but does not define.
 */
export function include(klass: AnyClass | object, mod: ModuleObject | AnyClass | Module): void {
  const appendFeatures = featureHook(mod, "appendFeatures");
  if (appendFeatures) {
    appendFeatures(klass);
    if (typeof (mod as ModuleHooks)[included] === "function") {
      (mod as ModuleHooks)[included]!(klass);
    } else {
      featureHook(mod, "included")?.(klass);
    }
    return;
  }
  if (!isClass(klass)) {
    if (typeof (mod as ModuleHooks)[included] === "function") {
      (mod as ModuleHooks)[included]!(klass);
    }
    return;
  }
  if (isModuleMethodTablePresent(klass, mod)) {
    if (typeof (mod as ModuleHooks)[included] === "function") {
      (mod as ModuleHooks)[included]!(klass);
    }
    return;
  }
  if (mod instanceof Module) {
    mod.appendFeatures(klass);
    if (typeof (mod as ModuleHooks)[included] === "function") {
      (mod as ModuleHooks)[included]!(klass);
    }
    return;
  }
  trackIncludedModule(klass.prototype, mod);
  const instanceInitializer = (mod as ModuleHooks)[initialize];
  if (typeof instanceInitializer === "function") {
    if (
      typeof mod === "function" &&
      Object.getPrototypeOf(instanceInitializer) === GeneratorFunction &&
      rbClassSuperclass(klass) !== null
    ) {
      spliceInstanceInitializer(klass, mod, instanceInitializer);
    } else {
      trackInstanceInitializer(klass.prototype, instanceInitializer);
    }
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
      const modDescs = Object.getOwnPropertyDescriptors(ancestor) as Record<
        string | symbol,
        PropertyDescriptor
      >;
      for (const key of [...Object.keys(modDescs), Symbol.iterator, Symbol.asyncIterator]) {
        const modDesc = modDescs[key];
        if (modDesc === undefined) continue;
        if (key === "constructor" || (typeof key === "string" && /^[A-Z]/.test(key))) continue;
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
 * Mirrors: Ruby's Object#clone — vendor/ruby/v3.3.11/object.c:536 `rb_obj_clone`, via
 * `rb_obj_clone_setup` (:457-527): a new object of the same class carrying a
 * copy of the receiver's singleton class and instance variables (`init_copy`),
 * then `initialize_clone(orig)` dispatched on the copy, which is frozen after
 * that hook runs when the receiver is. The singleton class is copied, not
 * shared, so the clone's `extend()` registries are its own. A JS primitive is
 * MRI's `special_object_p` (:380-393) and is returned as is (:539), as is a
 * Temporal value; an array is allocated as one (`rb_obj_alloc`), so its
 * elements, which Ruby copies in `Array#initialize_copy` (`array.c:8613`,
 * `rb_ary_replace`), land on a real array, and so are a JS `Date`, `Map`, `Set`
 * and `RegExp`. A class with an allocator ({@link rbDefineAllocFunc}) is
 * allocated through it. The copy hook is found as a method entry.
 *
 * Ruby's `Object#initialize_clone` / `#initialize_dup` default to
 * `initialize_copy` (`rb_obj_init_clone` / `rb_obj_init_dup_clone`, object.c:4382-4383), so a
 * receiver that defines only `initializeCopy` gets it here. This and
 * {@link rbObjDup} are the one spelling of Ruby `obj.clone` / `obj.dup`; a
 * class ports `initialize_clone` / `initialize_dup` / `initialize_copy` at
 * their Rails names and never open-codes the copy.
 *
 * @noRailsEquivalent PERMANENT — a Ruby core-language primitive, which Rails
 * uses but does not define.
 */
export function rbObjClone<T>(obj: T): T {
  if (obj === null || (typeof obj !== "object" && typeof obj !== "function")) return obj;
  if (temporalTag(obj) !== null) return obj;
  const frozen = Object.isFrozen(obj);
  const descriptors = copiedDescriptors(obj, frozen);
  for (const registry of [extendedKeys, includedModulesKey]) {
    const table = descriptors[registry];
    if (table) descriptors[registry] = { ...table, value: new Set(table.value as Set<unknown>) };
  }
  const clone = Object.defineProperties(rbObjAlloc(obj, Object.getPrototypeOf(obj)), descriptors);
  const defined = extendedOwners.get(obj);
  if (defined) extendedOwners.set(clone, new Map(defined));
  initCopyHook(clone, "initializeClone", obj);
  if (frozen) Object.freeze(clone);
  return clone as T;
}

/**
 * Mirrors: Ruby's Object#dup — vendor/ruby/v3.3.11/object.c:591 `rb_obj_dup`, via
 * `rb_obj_dup_setup` (:543-549): a new object of `rb_obj_class(obj)` — the
 * singleton class and the modules it was `extend`ed with are not carried —
 * holding a copy of the instance variables, then `initialize_dup(orig)`
 * dispatched on the copy. The frozen state is not carried either. A primitive
 * and an array are handled as in {@link rbObjClone}.
 *
 * @noRailsEquivalent PERMANENT — a Ruby core-language primitive, which Rails
 * uses but does not define.
 */
export function rbObjDup<T>(obj: T): T {
  if (obj === null || (typeof obj !== "object" && typeof obj !== "function")) return obj;
  if (temporalTag(obj) !== null) return obj;
  const descriptors = copiedDescriptors(obj, true);
  const singletonKeys = Object.prototype.hasOwnProperty.call(obj, extendedKeys)
    ? ((obj as Record<symbol, unknown>)[extendedKeys] as Set<string>)
    : undefined;
  for (const key of [extendedKeys, includedModulesKey, ...(singletonKeys ?? [])]) {
    delete descriptors[key];
  }
  let proto = Object.getPrototypeOf(obj) as object | null;
  if (proto !== null && Object.prototype.hasOwnProperty.call(proto, FL_SINGLETON)) {
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  const dup = Object.defineProperties(rbObjAlloc(obj, proto), descriptors);
  initCopyHook(dup, "initializeDup", obj);
  return dup as T;
}

const allocFuncs = new WeakMap<object, (klass: never) => object>();

/**
 * `rb_define_alloc_func` (`vendor/ruby/v3.3.11/vm_method.c:1270`): the allocator
 * for `klass` and its subclasses (`rb_get_alloc_func`, `:1286`), declared when
 * instances hold state `Object.create` cannot make (`#private` fields, a Proxy).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbDefineAllocFunc<K extends abstract new (...args: never) => object>(
  klass: K,
  func: (klass: K) => InstanceType<K>,
): void {
  allocFuncs.set(klass, func);
}

/**
 * `rb_get_alloc_func` (`vendor/ruby/v3.3.11/vm_method.c:1286`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbGetAllocFunc(klass: unknown): ((klass: never) => object) | undefined {
  for (; typeof klass === "function"; klass = Object.getPrototypeOf(klass)) {
    const allocator = allocFuncs.get(klass);
    if (allocator) return allocator;
  }
}

function rbObjAlloc(obj: object, proto: object | null): object {
  const klass = (proto as { constructor?: unknown } | null)?.constructor;
  const allocator = rbGetAllocFunc(klass);
  if (allocator) return Object.setPrototypeOf(allocator(klass as never), proto);
  if (Array.isArray(obj)) return Object.setPrototypeOf([], proto);
  if (obj instanceof Date) return Object.setPrototypeOf(new Date(obj.getTime()), proto);
  if (obj instanceof Map) return Object.setPrototypeOf(new Map(obj), proto);
  if (obj instanceof Set) return Object.setPrototypeOf(new Set(obj), proto);
  if (obj instanceof RegExp) return Object.setPrototypeOf(new RegExp(obj), proto);
  return Object.create(proto);
}

function copiedDescriptors(
  obj: object,
  unfreeze: boolean,
): Record<string | symbol, PropertyDescriptor> {
  const descriptors = Object.getOwnPropertyDescriptors(obj) as Record<
    string | symbol,
    PropertyDescriptor
  >;
  if (unfreeze) {
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key as string];
      descriptor.configurable = !(
        (key === "length" && Array.isArray(obj)) ||
        (key === "lastIndex" && obj instanceof RegExp)
      );
      if (!descriptor.get && !descriptor.set) descriptor.writable = true;
    }
  }
  return descriptors;
}

function initCopyHook(
  copy: object,
  hook: "initializeClone" | "initializeDup",
  orig: unknown,
): void {
  for (const mid of [hook, "initializeCopy"]) {
    for (let o: object | null = copy; o; o = Object.getPrototypeOf(o) as object | null) {
      const me = Object.getOwnPropertyDescriptor(o, mid);
      if (!me) continue;
      if (typeof me.value !== "function") break;
      (me.value as (orig: unknown) => unknown).call(copy, orig);
      return;
    }
  }
}

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
 * (vendor/ruby/v3.3.11/class.c:1281,1291,1296).
 *
 * Mirrors: Ruby's Module#prepend — vendor/ruby/v3.3.11/eval.c:1196 `rb_mod_prepend`,
 * backed by vendor/ruby/v3.3.11/class.c:1430 `rb_prepend_module`.
 *
 * @noRailsEquivalent PERMANENT — a Ruby core-language primitive, which Rails
 * uses but does not define.
 */
export function prepend(klass: AnyClass, mod: ModuleObject | AnyClass | Module): void {
  const prependFeatures = featureHook(mod, "prependFeatures");
  if (prependFeatures) return prependFeatures(klass);
  if (isModuleMethodTablePresent(klass, mod)) return;
  if (mod instanceof Module) return mod.prependFeatures(klass);
  trackIncludedModule(klass.prototype, mod);
  const instanceInitializer = (mod as ModuleHooks)[initialize];
  if (typeof instanceInitializer === "function") {
    trackInstanceInitializer(klass.prototype, instanceInitializer, prependedInstanceInitializers);
  }
  const source = typeof mod === "function" ? (mod as AnyClass).prototype : mod;
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
 * Mirrors: Ruby's Object#extend — vendor/ruby/v3.3.11/eval.c:1778 `rb_obj_extend`,
 * which returns the receiver (:1800). `rb_extend_object` (:1713-1716) is
 * `rb_include_module` on the receiver's singleton class, so the module's
 * ancestors come with it: a plain-object module's prototype chain is walked,
 * nearest first, as `include()` walks it.
 *
 * @noRailsEquivalent PERMANENT — a Ruby core-language primitive, which Rails
 * uses but does not define.
 *
 * Usage:
 *   extend(Base, ConnectionHandlingMethods);
 *   // Now Base.connectedTo(...) works
 */
export function extend<T extends AnyClass | object>(
  klass: T,
  mod: ModuleObject | AnyClass | Module,
): T {
  const extendedHook = featureHook(mod, "extended");
  if (extendedHook) {
    extendedHook(klass);
    return klass;
  }
  if (mod instanceof Module) {
    mod.extendObject(klass);
    return klass;
  }
  const isClassModule = typeof mod === "function" && (mod as AnyClass).prototype;
  const owners = new Map<string, object>();
  if (isClassModule) {
    for (const key of Object.getOwnPropertyNames(mod)) {
      if (!STATIC_CLASS_KEYS.has(key)) owners.set(key, mod);
    }
  } else {
    for (
      let ancestor: object | null = mod;
      ancestor && ancestor !== Object.prototype;
      ancestor = Object.getPrototypeOf(ancestor) as object | null
    ) {
      for (const key of Object.keys(ancestor)) {
        if (!owners.has(key)) owners.set(key, ancestor);
      }
    }
  }
  const installed = trackedKeys(klass, extendedKeys);
  let defined = extendedOwners.get(klass);
  if (!defined) extendedOwners.set(klass, (defined = new Map()));

  for (const [key, owner] of owners) {
    const modDesc = Object.getOwnPropertyDescriptor(owner, key);
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
      defined.set(key, owner);
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
      if (takeGetter) {
        installed.add(key);
        defined.set(key, owner);
      }
      if (takeSetter) installed.add(writer);
    } else if (getterIsMixin && (!existingIsAccessor || existing.set == null || setterIsMixin)) {
      Object.defineProperty(klass, key, descriptor);
      defined.set(key, owner);
      if (modDesc.set != null) installed.add(writer);
    }
  }

  trackIncludedModule(klass, mod);
  if (typeof (mod as ModuleHooks)[extended] === "function") {
    (mod as ModuleHooks)[extended]!(klass);
  }
  return klass;
}

/**
 * Ruby's `Kernel`, the module `Object` includes and so the last stop of every
 * method search. It holds the instance methods a module's `super` reaches when
 * nothing beneath it in the receiver's ancestry defines one: `initialize_dup`
 * (vendor/ruby/v3.3.11/object.c:654 `rb_obj_init_dup_clone`, which sends
 * `initialize_copy`) and `freeze` (vendor/ruby/v3.3.11/object.c:1284
 * `rb_obj_freeze`), defined at vendor/ruby/v3.3.11/object.c:4382,4385. A gem that reopens
 * `Object` defines its method here, as ActiveSupport does for `as_json`.
 *
 * @noRailsEquivalent PERMANENT
 */
export const Kernel = new Module((mod) => {
  /** @noRailsEquivalent PERMANENT */
  mod.defineMethod("initializeDup", function (this: object, orig: unknown): object {
    const initializeCopy = (this as { initializeCopy?: unknown }).initializeCopy;
    if (typeof initializeCopy === "function") initializeCopy.call(this, orig);
    return this;
  });
  /** @noRailsEquivalent PERMANENT */
  mod.defineMethod("freeze", function (this: object): object {
    return Object.freeze(this);
  });
});

classpaths.set(Kernel, { path: "Kernel", permanent: true });
classpaths.set(Enumerable, { path: "Enumerable", permanent: true });

// `rb_mComparable` (`vendor/ruby/v3.3.11/compar.c:315`).
const rbMComparable = new Module();
classpaths.set(rbMComparable, { path: "Comparable", permanent: true });

Object.setPrototypeOf(rbCClass, Module);
Object.setPrototypeOf(rbCClass.prototype, Module.prototype);

rbDefineAllocFunc(Rational, (klass) => new klass(0, 1));
classpaths.set(Rational, { path: "Rational", permanent: true });
rbSetClassPathString(Rational.compatible, Rational, "compatible");
for (const klass of [Rational, Complex, BigDecimal]) {
  Object.setPrototypeOf(klass, rbCNumeric);
  Object.setPrototypeOf(klass.prototype, rbCNumeric.prototype);
}

include(rbCNumeric, rbMComparable);
include(rbCString, rbMComparable);
include(rbCTime, rbMComparable);
include(rbCDate, rbMComparable);
include(Hash, Enumerable);
