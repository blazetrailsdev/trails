import {
  Hash,
  dup,
  eachPair,
  fetch,
  isSymbol,
  rbEqual,
  rtest,
  symbolToS,
} from "@blazetrails/ruby-compat";

type AnyHash<V> = Record<string, V> | Map<string, V>;

export type ThorOptions<T extends object> = HashWithIndifferentAccess<T[keyof T]> &
  Readonly<T> & {
    readonly [K in keyof T & string as `is${Capitalize<K>}`]: boolean;
  };

export class HashWithIndifferentAccess<V = unknown> extends Hash<string, V> {
  static {
    Object.setPrototypeOf(
      this.prototype,
      new Proxy(Object.create(Hash.prototype) as object, {
        get(target, method, receiver: HashWithIndifferentAccess) {
          if (typeof method === "symbol" || method in target) {
            return Reflect.get(target, method, receiver);
          }
          const predicate = /^is([A-Z])(\w*)$/.exec(method);
          return receiver.methodMissing(
            predicate ? `${predicate[1].toLowerCase()}${predicate[2]}?` : method,
          );
        },
        set(target, method, value, receiver: HashWithIndifferentAccess) {
          if (typeof method === "symbol" || method in target) {
            return Reflect.set(target, method, value, receiver);
          }
          receiver.set(method, value);
          return true;
        },
      }),
    );
  }

  constructor(hash: AnyHash<V> = {}) {
    super();
    eachPair(hash as Record<string, V>, (key, value) => {
      this.set(this.convertKey(key), value);
    });
  }

  override get(key: string): V | undefined {
    return super.get(this.convertKey(key));
  }

  override set(key: string, value: V): this {
    return super.set(this.convertKey(key), value);
  }

  override delete(key: string): ReturnType<Hash<string, V>["delete"]> {
    return super.delete(this.convertKey(key));
  }

  except(...keys: string[]): this {
    const hash = dup(this) as this;
    keys.forEach((key) => hash.delete(this.convertKey(key)));
    return hash;
  }

  fetch(key: string, ...args: unknown[]): unknown {
    return (fetch as (hash: Map<string, V>, key: string, ...rest: unknown[]) => unknown)(
      this,
      this.convertKey(key),
      ...args,
    );
  }

  slice(...keys: string[]): Hash<string, V> {
    const result = new Hash<string, V>();
    for (const key of keys.map((key) => this.convertKey(key))) {
      if (super.has(key)) result.set(key, super.get(key)!);
    }
    return result;
  }

  key(key: string): boolean {
    return super.has(this.convertKey(key));
  }

  valuesAt(...indices: string[]): (V | undefined)[] {
    return indices.map((key) => this.get(this.convertKey(key)));
  }

  merge(other: AnyHash<V>): this {
    return (dup(this) as this).mergeBang(other);
  }

  mergeBang(other: AnyHash<V>): this {
    eachPair(other as Record<string, V>, (key, value) => {
      this.set(this.convertKey(key), value);
    });
    return this;
  }

  reverseMerge(other: AnyHash<V>): this {
    return new (this.constructor as new (hash: AnyHash<V>) => this)(other).merge(this);
  }

  reverseMergeBang(otherHash: AnyHash<V>): this {
    return this.replace(this.reverseMerge(otherHash));
  }

  replace(otherHash: AnyHash<V>): this {
    const pairs = otherHash instanceof Map ? [...otherHash] : Object.entries(otherHash);
    super.clear();
    for (const [key, value] of pairs) super.set(key, value);
    return this;
  }

  toHash(): Hash<string, V> {
    const hash = new Hash<string, V>(this.default());
    for (const [key, value] of this) hash.set(key, value);
    return hash;
  }

  /** @internal */
  protected convertKey(key: string): string {
    return isSymbol(key) ? symbolToS(key) : key;
  }

  /** @internal */
  protected methodMissing(method: string, ...args: unknown[]): unknown {
    const match = /^(\w+)\?$/.exec(method);
    if (match) {
      if (args.length === 0) {
        return rtest(this.get(match[1]));
      } else {
        return rbEqual(this.get(match[1]), args[0]);
      }
    } else {
      return this.get(method);
    }
  }
}
