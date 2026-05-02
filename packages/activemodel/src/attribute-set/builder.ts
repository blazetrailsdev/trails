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
 * Lazy variant of AttributeSet that carries an extra `additionalTypes` map and
 * supports on-demand materialization of those entries into the internal store.
 *
 * Mirrors: ActiveModel::LazyAttributeSet
 */
export class LazyAttributeSet extends AttributeSet {
  private _additionalTypes: Map<string, Type>;

  constructor(
    attributes: Map<string, Attribute> = new Map(),
    additionalTypes: Map<string, Type> = new Map(),
  ) {
    super(attributes);
    this._additionalTypes = additionalTypes;
  }

  /** @internal Rails-private helper. Mirrors: LazyAttributeSet#additional_types (attr_reader) */
  additionalTypes(): Map<string, Type> {
    return this._additionalTypes;
  }

  /**
   * @internal Rails-private helper. Mirrors: LazyAttributeSet#materialize (protected)
   * Materializes the lazy set by resolving all keys into the attribute map.
   */
  protected materialize(): Map<string, Attribute> {
    // Write additionalTypes-only keys into the internal store so that
    // subsequent getAttribute/has/forEach calls can see them — mirrors
    // Rails' @additional_types.each_key { |name| self[name] } side-effect.
    for (const [name, type] of this._additionalTypes) {
      if (!this.hasAttribute(name)) this.set(name, Attribute.uninitialized(name, type));
    }
    const result = new Map<string, Attribute>();
    this.forEach((attr, name) => result.set(name, attr));
    return result;
  }

  override deepDup(): LazyAttributeSet {
    const cache = new Map<Attribute, Attribute>();
    const newAttrs = new Map<string, Attribute>();
    this.forEach((attr, name) => newAttrs.set(name, this.cloneAttribute(attr, cache)));
    return new LazyAttributeSet(newAttrs, new Map(this._additionalTypes));
  }

  override map(fn: (attr: Attribute) => Attribute): LazyAttributeSet {
    const newAttrs = new Map<string, Attribute>();
    this.forEach((attr, name) => newAttrs.set(name, fn(attr)));
    return new LazyAttributeSet(newAttrs, new Map(this._additionalTypes));
  }
}

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

  /** @internal Rails-private helper. Mirrors: LazyAttributeHash#delegate_hash (attr_reader) */
  delegateHash(): Map<string, Attribute> {
    return this.delegate;
  }

  /**
   * @internal Rails-private helper. Mirrors: LazyAttributeHash#assign_default_value
   * Materializes an attribute entry for `name` from the value/type tables.
   */
  assignDefaultValue(name: string): Attribute {
    return this.assignDefault(name);
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
