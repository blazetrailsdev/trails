import { Attribute } from "../attribute.js";
import { Type } from "../type/value.js";
import { AttributeSet } from "../attribute-set.js";

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

  isKey(key: string): boolean {
    return this.has(key);
  }

  eachKey(fn: (key: string) => void): void {
    const allKeys = new Set([
      ...this.delegate.keys(),
      ...Object.keys(this.values),
      ...this.types.keys(),
    ]);
    for (const key of allKeys) fn(key);
  }

  marshalDump(): [Map<string, Type>, Record<string, unknown>] {
    return [this.types, this.values];
  }

  static marshalLoad(data: [Map<string, Type>, Record<string, unknown>]): LazyAttributeHash {
    return new LazyAttributeHash(data[0], data[1]);
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
