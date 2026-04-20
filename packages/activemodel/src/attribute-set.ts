import { Attribute } from "./attribute.js";
import { typeRegistry } from "./type/registry.js";

const LAZY_ATTR = Symbol("lazyAttr");

/**
 * A set of Attribute instances keyed by name.
 *
 * Mirrors: ActiveModel::AttributeSet
 */
export class AttributeSet {
  private attributes: Map<string, Attribute>;
  private _frozen = false;

  constructor(attributes: Map<string, Attribute> = new Map()) {
    this.attributes = attributes;
  }

  /**
   * Freeze this set in place so subsequent mutations throw.
   * Matches Ruby's `Hash#freeze` semantic used by `ActiveRecord::Core#freeze`.
   */
  freeze(): this {
    this._frozen = true;
    return this;
  }

  /** Whether this set has been frozen via {@link freeze}. */
  isFrozen(): boolean {
    return this._frozen;
  }

  private assertNotFrozen(): void {
    if (this._frozen) {
      const err = new Error("can't modify frozen AttributeSet");
      err.name = "FrozenError";
      throw err;
    }
  }

  /**
   * Get the Attribute instance for a name.
   */
  getAttribute(name: string): Attribute {
    return this.attributes.get(name) ?? Attribute.null(name);
  }

  /**
   * Get the cast value of an attribute (backward-compatible with Map.get).
   */
  get(name: string): unknown {
    const attr = this.attributes.get(name);
    if (!attr) return undefined;
    return attr.value;
  }

  set(name: string, attrOrValue: Attribute | unknown): void {
    this.assertNotFrozen();
    if (attrOrValue instanceof Attribute) {
      this.attributes.set(name, attrOrValue);
    } else {
      const existing = this.attributes.get(name);
      const type = existing ? existing.type : typeRegistry.lookup("value");
      this.attributes.set(name, Attribute.withCastValue(name, attrOrValue, type));
    }
  }

  has(name: string): boolean {
    const attr = this.attributes.get(name);
    return attr !== undefined && attr.isInitialized();
  }

  keys(): string[] {
    const result: string[] = [];
    for (const [name, attr] of this.attributes) {
      if (attr.isInitialized()) result.push(name);
    }
    return result;
  }

  fetchValue(name: string): unknown {
    return this.getAttribute(name).value;
  }

  writeFromUser(name: string, value: unknown): unknown {
    this.assertNotFrozen();
    const existing = this.attributes.get(name);
    if (existing) {
      this.attributes.set(name, existing.withValueFromUser(value));
    } else {
      // New attribute not previously declared — create a FromUser with default type
      this.attributes.set(name, Attribute.fromUser(name, value, typeRegistry.lookup("value")));
    }
    return value;
  }

  writeFromDatabase(name: string, value: unknown): void {
    this.assertNotFrozen();
    const existing = this.attributes.get(name);
    if (existing) {
      this.attributes.set(name, existing.withValueFromDatabase(value));
    } else {
      this.attributes.set(name, Attribute.fromDatabase(name, value, typeRegistry.lookup("value")));
    }
  }

  writeCastValue(name: string, value: unknown): void {
    this.assertNotFrozen();
    const attr = this.attributes.get(name);
    if (attr) {
      attr.overrideCastValue(value);
    } else {
      this.attributes.set(name, Attribute.withCastValue(name, value, typeRegistry.lookup("value")));
    }
  }

  toHash(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const name of this.keys()) {
      result[name] = this.fetchValue(name);
    }
    return result;
  }

  valuesBeforeTypeCast(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [name, attr] of this.attributes) {
      if (attr.isInitialized()) {
        result[name] = attr.valueBeforeTypeCast;
      }
    }
    return result;
  }

  /**
   * Capture current values for all initialized attributes.
   * For already-read attributes, captures the cast value directly.
   * For unread attributes, clones the Attribute so it can be lazily
   * evaluated later without affecting the original.
   */
  snapshotValues(): Map<string, unknown> {
    const result = new Map<string, unknown>();
    for (const [name, attr] of this.attributes) {
      if (attr.isInitialized()) {
        if (attr.hasBeenRead()) {
          result.set(name, attr.value);
        } else {
          // Clone so lazy evaluation doesn't affect the live attribute
          const cloned = Object.assign(Object.create(Object.getPrototypeOf(attr)), attr);
          result.set(name, { [LAZY_ATTR]: cloned });
        }
      }
    }
    return result;
  }

  /**
   * Resolve a snapshot value — handles both direct values and lazy Attribute clones.
   */
  static resolveSnapshotValue(value: unknown): unknown {
    if (value && typeof value === "object" && LAZY_ATTR in value) {
      const attr = (value as Record<symbol, unknown>)[LAZY_ATTR];
      if (attr instanceof Attribute) return attr.value;
    }
    return value;
  }

  valuesForDatabase(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [name, attr] of this.attributes) {
      if (attr.isInitialized()) {
        result[name] = attr.valueForDatabase;
      }
    }
    return result;
  }

  delete(name: string): boolean {
    this.assertNotFrozen();
    return this.attributes.delete(name);
  }

  reset(name: string): void {
    if (this.has(name)) {
      this.writeFromDatabase(name, null);
    }
  }

  private cloneAttribute(attr: Attribute, cache: Map<Attribute, Attribute>): Attribute {
    const existing = cache.get(attr);
    if (existing) return existing;

    // UserProvidedDefault needs a fresh construction so function defaults
    // re-evaluate per instance — matching Rails' Proc-per-deep_dup behavior.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asAny = attr as Record<string, any>;
    const cloned =
      typeof asAny.dupForDeepClone === "function"
        ? asAny.dupForDeepClone()
        : Object.assign(Object.create(Object.getPrototypeOf(attr)), attr);
    cache.set(attr, cloned);

    const orig = attr.getOriginalAttribute();
    if (orig) {
      cloned.setOriginalAttribute(this.cloneAttribute(orig, cache));
    }

    return cloned;
  }

  deepDup(): AttributeSet {
    const newAttrs = new Map<string, Attribute>();
    const cache = new Map<Attribute, Attribute>();

    for (const [name, attr] of this.attributes) {
      newAttrs.set(name, this.cloneAttribute(attr, cache));
    }

    return new AttributeSet(newAttrs);
  }

  forEach(fn: (attr: Attribute, name: string) => void): void {
    for (const [name, attr] of this.attributes) {
      fn(attr, name);
    }
  }

  /**
   * Make AttributeSet iterable — yields [name, value] pairs for compatibility
   * with code that iterates `for (const [k, v] of _attributes)`.
   */
  *[Symbol.iterator](): IterableIterator<[string, unknown]> {
    for (const name of this.keys()) {
      yield [name, this.fetchValue(name)];
    }
  }

  entries(): IterableIterator<[string, unknown]> {
    return this[Symbol.iterator]();
  }

  castTypes(): Record<string, import("./type/value.js").Type> {
    const result: Record<string, import("./type/value.js").Type> = {};
    for (const [name, attr] of this.attributes) {
      result[name] = attr.type;
    }
    return result;
  }

  isKey(name: string): boolean {
    const attr = this.attributes.get(name);
    return attr !== undefined && attr.isInitialized();
  }

  accessed(): string[] {
    const result: string[] = [];
    for (const [name, attr] of this.attributes) {
      if (attr.hasBeenRead()) result.push(name);
    }
    return result;
  }

  map(fn: (attr: Attribute) => Attribute): AttributeSet {
    const newAttrs = new Map<string, Attribute>();
    for (const [name, attr] of this.attributes) {
      newAttrs.set(name, fn(attr));
    }
    return new AttributeSet(newAttrs);
  }

  reverseMergeBang(target: AttributeSet): this {
    this.assertNotFrozen();
    const cache = new Map<Attribute, Attribute>();
    target.forEach((attr, name) => {
      if (!this.isKey(name)) {
        this.attributes.set(name, this.cloneAttribute(attr, cache));
      }
    });
    return this;
  }
}
