import { ArgumentError, dup, except, fetch, Hash } from "@blazetrails/ruby-compat";

type PairBlock = (key: string, value: string) => unknown;

export class Headers extends Hash<string, string> {
  static get(...items: any[]): Headers {
    if (items.length % 2 !== 0) {
      if (items.length === 1 && typeof items[0] === "object" && items[0] !== null) {
        return new this().update(items[0]);
      } else {
        throw new ArgumentError("odd number of arguments for Rack::Headers");
      }
    } else {
      const hash = new this();
      for (;;) {
        if (items.length === 0) break;
        const key = items.shift();
        const value = items.shift();
        hash.set(key, value);
      }
      return hash;
    }
  }

  override get(key: string): string | undefined {
    return super.get(this.downcaseKey(key));
  }

  override set(key: string, value: string): this {
    return super.set(key.toLowerCase(), value);
  }

  store(key: string, value: string): this {
    return this.set(key, value);
  }

  assoc(key: string): [string, string] | null {
    const k = this.downcaseKey(key);
    if (super.has(k)) return [k, super.get(k)!];
    return null;
  }

  override compareByIdentity(): never {
    throw new TypeError("Rack::Headers cannot compare by identity, use regular Hash");
  }

  override delete(key: string, block?: (key: string) => string) {
    return super.delete(this.downcaseKey(key), block);
  }

  dig(key: string, ...a: any[]): string | undefined | null {
    const val = this.get(key);
    if (a.length === 0) return val;
    if (val === undefined || val === null) return undefined;
    throw new TypeError("String does not have #dig method");
  }

  fetch(key: string, ...defaultValue: any[]): string {
    key = this.downcaseKey(key);
    return fetch(this as Map<string, string>, key, ...defaultValue) as string;
  }

  fetchValues(...a: string[]): string[] {
    return a.map((key) => this.fetch(key));
  }

  hasKey(key: string): boolean {
    return super.has(this.downcaseKey(key));
  }

  override isInclude(key: string): boolean {
    return this.hasKey(key);
  }

  invert(): Headers {
    const hash = new (this.constructor as typeof Headers)();
    this.each((key, value) => {
      hash.set(value, key);
    });
    return hash;
  }

  override merge(
    hash: Record<string, string> | Headers,
    block?: (key: string, oldVal: string, newVal: string) => string,
  ): Headers {
    return (dup(this) as Headers).update(hash, block);
  }

  reject(block: PairBlock): Headers {
    const hash = dup(this) as Headers;
    hash.rejectBang(block);
    return hash;
  }

  override replace(hash: Record<string, string> | Headers): this {
    this.clear();
    return this.update(hash);
  }

  select(block: PairBlock): Headers {
    const hash = dup(this) as Headers;
    hash.selectBang(block);
    return hash;
  }

  toProc(): (x: string) => string | undefined | null {
    return (x: string) => this.get(x);
  }

  transformValues(block: (value: string) => string): Headers {
    return (dup(this) as Headers).transformValuesBang(block);
  }

  update(
    hash: Record<string, string> | Headers,
    block?: (key: string, oldVal: string, newVal: string) => string,
  ): this {
    const pairs = hash instanceof Map ? [...hash] : Object.entries(hash);
    for (const [key, value] of pairs) {
      this.set(
        key,
        block !== undefined && this.isInclude(key) ? block(key, this.get(key)!, value) : value,
      );
    }
    return this;
  }

  valuesAt(...keys: string[]): (string | undefined | null)[] {
    return keys.map((key) => this.get(key));
  }

  slice(...a: string[]): Headers {
    const h = new (this.constructor as typeof Headers)();
    a.forEach((k) => {
      if (this.hasKey(k)) h.set(k, this.get(k)!);
    });
    return h;
  }

  transformKeys(block: (key: string) => string): Headers {
    return (dup(this) as Headers).transformKeysBang(block);
  }

  transformKeysBang(block: (key: string) => string): this {
    const hash = new (this.constructor as typeof Headers)();
    this.each((k, v) => {
      hash.set(block(k), v);
    });
    return this.replace(hash);
  }

  except(...a: string[]): Hash<string, string> {
    return except(this as Map<string, string>, ...a.map((key) => this.downcaseKey(key)));
  }

  /** @internal */
  private downcaseKey(key: string): string {
    return typeof key === "string" ? key.toLowerCase() : key;
  }
}
