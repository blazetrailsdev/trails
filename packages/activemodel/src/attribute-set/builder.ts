import { Attribute } from "../attribute.js";
import { Type } from "../type/value.js";
import { typeRegistry } from "../type/registry.js";

const LAZY_ATTR = Symbol("lazyAttr");

/**
 * A set of Attribute instances keyed by name.
 *
 * Mirrors: ActiveModel::AttributeSet
 */
export class AttributeSet {
  private attributes: Map<string, Attribute>;

  constructor(attributes: Map<string, Attribute> = new Map()) {
    this.attributes = attributes;
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
    const existing = this.attributes.get(name);
    if (existing) {
      this.attributes.set(name, existing.withValueFromDatabase(value));
    } else {
      this.attributes.set(name, Attribute.fromDatabase(name, value, typeRegistry.lookup("value")));
    }
  }

  writeCastValue(name: string, value: unknown): void {
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

    const cloned = Object.assign(Object.create(Object.getPrototypeOf(attr)), attr);
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
}

/**
 * Builds an AttributeSet from type definitions and raw values.
 *
 * Mirrors: ActiveModel::AttributeSet::Builder
 */
export class Builder {
  readonly types: Map<string, Type>;
  readonly defaultAttributes: Map<string, Attribute>;

  constructor(types: Map<string, Type>, defaultAttributes: Map<string, Attribute> = new Map()) {
    this.types = types;
    this.defaultAttributes = defaultAttributes;
  }

  buildFromDatabase(values: Record<string, unknown> = {}): AttributeSet {
    const attrs = new Map<string, Attribute>();

    for (const [name, type] of this.types) {
      if (name in values) {
        attrs.set(name, Attribute.fromDatabase(name, values[name], type));
      } else {
        const defaultAttr = this.defaultAttributes.get(name);
        if (defaultAttr) {
          attrs.set(
            name,
            Object.assign(Object.create(Object.getPrototypeOf(defaultAttr)), defaultAttr),
          );
        } else {
          attrs.set(name, Attribute.uninitialized(name, type));
        }
      }
    }

    return new AttributeSet(attrs);
  }
}

/**
 * Lazy variant of AttributeSet. Currently delegates to the base implementation.
 *
 * Mirrors: ActiveModel::LazyAttributeSet
 */
export class LazyAttributeSet extends AttributeSet {}

/**
 * Lazy hash of attribute objects, materializes on demand.
 *
 * Mirrors: ActiveModel::LazyAttributeHash
 */
export class LazyAttributeHash {
  private delegate: Map<string, Attribute> = new Map();
  private types: Map<string, Type>;
  private values: Record<string, unknown>;

  constructor(types: Map<string, Type>, values: Record<string, unknown>) {
    this.types = types;
    this.values = values;
  }

  get(name: string): Attribute {
    if (this.delegate.has(name)) return this.delegate.get(name)!;
    return this.assignDefault(name);
  }

  set(name: string, attr: Attribute): void {
    this.delegate.set(name, attr);
  }

  has(name: string): boolean {
    return (
      this.delegate.has(name) ||
      Object.prototype.hasOwnProperty.call(this.values, name) ||
      this.types.has(name)
    );
  }

  keys(): string[] {
    const allKeys = new Set([
      ...this.delegate.keys(),
      ...Object.keys(this.values),
      ...this.types.keys(),
    ]);
    return [...allKeys];
  }

  deepDup(): LazyAttributeHash {
    const copy = new LazyAttributeHash(this.types, { ...this.values });
    const cache = new Map<Attribute, Attribute>();
    for (const [name, attr] of this.delegate) {
      copy.delegate.set(name, LazyAttributeHash.cloneAttr(attr, cache));
    }
    return copy;
  }

  private static cloneAttr(attr: Attribute, cache: Map<Attribute, Attribute>): Attribute {
    const existing = cache.get(attr);
    if (existing) return existing;
    const cloned = Object.assign(Object.create(Object.getPrototypeOf(attr)), attr);
    cache.set(attr, cloned);
    const orig = attr.getOriginalAttribute();
    if (orig) {
      cloned.setOriginalAttribute(LazyAttributeHash.cloneAttr(orig, cache));
    }
    return cloned;
  }

  private assignDefault(name: string): Attribute {
    const type = this.types.get(name);
    if (Object.prototype.hasOwnProperty.call(this.values, name) && type) {
      const attr = Attribute.fromDatabase(name, this.values[name], type);
      this.delegate.set(name, attr);
      return attr;
    }
    if (type) {
      const attr = Attribute.uninitialized(name, type);
      this.delegate.set(name, attr);
      return attr;
    }
    return Attribute.null(name);
  }
}
