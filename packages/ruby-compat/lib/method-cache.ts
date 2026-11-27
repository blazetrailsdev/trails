/**
 * Mirrors: MRI's `rb_clear_method_cache` — vendor/ruby/v3.3.11/vm_method.c:295,
 * which every method-table or ancestry change calls so a call cache keyed on
 * the old table misses. trails keeps one serial for every class: a cache reads
 * {@link methodCacheSerial} and is stale once it differs.
 *
 * @noRailsEquivalent PERMANENT
 * @perf 100ns — PERMANENT
 */
export let methodCacheSerial = 0;

/**
 * `rb_clear_method_cache` (`vendor/ruby/v3.3.11/vm_method.c:295`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbClearMethodCache(): void {
  methodCacheSerial++;
}

/**
 * Each method's `super` slot, which {@link rbSeatSuper} writes and
 * `rbCallSuper` reads (MRI `vm_search_super_method`,
 * `vendor/ruby/v3.3.11/vm_insnhelper.c:4680`).
 *
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export const superSlots = new WeakMap<
  (...args: never[]) => unknown,
  { slot: symbol; key: string; seats?: number }
>();

/**
 * A method's own copy of its {@link superSlots} slot (MRI
 * `vm_search_super_method`, `vendor/ruby/v3.3.11/vm_insnhelper.c:4680`).
 *
 * @internal
 * @noRailsEquivalent PERMANENT
 * @perf 10ns — PERMANENT
 */
export const _superSlot = Symbol("superSlot");

/**
 * `method`'s entry in {@link superSlots}, made on first use under the `key`
 * it is being installed as, the `original_id` MRI's `vm_search_super_method`
 * (`vendor/ruby/v3.3.11/vm_insnhelper.c:4680`) searches by.
 *
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function superSlotFor(
  method: (...args: never[]) => unknown,
  key: string,
): { slot: symbol; key: string; seats?: number } {
  let entry = superSlots.get(method);
  if (entry === undefined) {
    superSlots.set(method, (entry = { slot: Symbol(`super:${key}`), key }));
    if (Object.isExtensible(method))
      Object.defineProperty(method, _superSlot, { value: entry.slot });
  }
  return entry;
}

/**
 * Seats on `target`, in `descriptors`, the `key` method `method` is about to
 * shadow, for {@link rbCallSuper}. A function keeps the key it was first
 * installed under, as MRI's `super` searches by the method's `original_id`
 * (`vendor/ruby/v3.3.11/vm_insnhelper.c:4680`, `vm_search_super_method`).
 * An accessor's `get` and `set` are seated one `half` at a time, as Ruby's
 * `name` and `name=` are two methods.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbSeatSuper(
  target: object,
  key: string,
  method: unknown,
  descriptors: PropertyDescriptorMap,
  half: "value" | "get" | "set" = "value",
): void {
  if (typeof method !== "function") return;
  let shadowed: unknown;
  for (
    let link: object | null = target;
    link;
    link = Object.getPrototypeOf(link) as object | null
  ) {
    const desc = Object.getOwnPropertyDescriptor(link, key);
    if (desc && (half === "value" || desc[half] !== undefined)) {
      shadowed = desc[half];
      break;
    }
  }
  if (typeof shadowed !== "function" || shadowed === method) return;
  const entry = superSlotFor(method as (...args: never[]) => unknown, key);
  if (Object.hasOwn(descriptors, entry.slot)) return;
  descriptors[entry.slot] = { value: shadowed, configurable: true };
  entry.seats = (entry.seats ?? 0) + 1;
}

/**
 * `Module#define_method` on a class receiver (`rb_mod_define_method`,
 * `vendor/ruby/v3.3.11/proc.c:2325`): binds `body` as `mod`'s instance method
 * `mid`. `body` is the block, or the method `define_method(symbol, method)`
 * takes, whose JS carrier is a property descriptor (see
 * `Module#instanceMethod`), so a zero-argument reader can be defined as the
 * accessor it ports to. A JS class has no metaclass apart from its own
 * statics (CLAUDE.md, "`singleton_class` is a per-object subclass"), so a
 * class's `singleton_class.define_method` passes `{ prototype: klass }`.
 *
 * It replaces `mod`'s own `mid`, and its `super` reaches the next `mid` in
 * the ancestry ({@link rbCallSuper}).
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbModDefineMethod(
  mod: { prototype: object },
  mid: string,
  body: ((...args: never[]) => unknown) | PropertyDescriptor,
): string {
  const descriptors: PropertyDescriptorMap = {
    [mid]:
      typeof body === "function"
        ? { value: body, writable: true, configurable: true }
        : { configurable: true, ...body },
  };
  rbSeatSuper(
    Object.getPrototypeOf(mod.prototype) as object,
    mid,
    typeof body === "function" ? body : body.value,
    descriptors,
  );
  Object.defineProperties(mod.prototype, descriptors);
  rbClearMethodCache();
  return mid;
}
