import { Digest, rbObjRespondTo } from "@blazetrails/ruby-compat";

type Part = string | Uint8Array;
type Body = Iterable<Part> & { close?: () => unknown };

export class EntityStore {
  static Heap: typeof Heap;
  static HEAP: typeof Heap;
  static MEM: typeof Heap;
  static Noop: typeof Noop;
  static NOOP: typeof Noop;

  /** @internal */
  protected slurp(body: Body, block: (part: Part) => unknown): [string, number] {
    const digest = Digest.SHA1.new();
    let size = 0;
    for (const part of body) {
      size += this.bytesize(part);
      digest.update(part);
      block(part);
    }
    if (rbObjRespondTo(body, "close")) body.close!();
    return [digest.hexdigest(), size];
  }

  /** @internal */
  protected bytesize(string: Part): number {
    return string instanceof Uint8Array ? string.length : new TextEncoder().encode(string).length;
  }
}

export class Heap extends EntityStore {
  /** @internal */
  private _hash: Record<string, Part[]>;

  /** @internal */
  private _options: Record<string, unknown>;

  constructor(hash: Record<string, Part[]> = {}, options: Record<string, unknown> = {}) {
    super();
    this._hash = hash;
    this._options = options;
  }

  async isExist(key: string): Promise<boolean> {
    return Object.hasOwn(this._hash, key);
  }

  async open(key: string): Promise<Part[] | null> {
    const body = Object.hasOwn(this._hash, key) ? this._hash[key] : null;
    return body && [...body];
  }

  async read(key: string): Promise<string | null> {
    const body = Object.hasOwn(this._hash, key) ? this._hash[key] : null;
    return body && body.join("");
  }

  async write(body: Body, _ttl: number | null = null): Promise<[string, number]> {
    const buf: Part[] = [];
    const [key, size] = this.slurp(body, (part) => buf.push(part));
    this._hash[key] = buf;
    return [key, size];
  }

  async purge(key: string): Promise<null> {
    delete this._hash[key];
    return null;
  }

  static resolve(_uri: unknown, options: Record<string, unknown> = {}): Heap {
    return new this({}, options);
  }
}

EntityStore.Heap = Heap;
EntityStore.HEAP = Heap;
EntityStore.MEM = Heap;

export class Noop extends EntityStore {
  async isExist(_key: string): Promise<boolean> {
    return true;
  }

  async read(_key: string): Promise<string> {
    return "";
  }

  async open(_key: string): Promise<Part[]> {
    return [];
  }

  async write(body: Body, _ttl: number | null = null): Promise<[string, number]> {
    const [key, size] = this.slurp(body, (part) => part);
    return [key, size];
  }

  async purge(_key: string): Promise<null> {
    return null;
  }

  static resolve(_uri: unknown): Noop {
    return new this();
  }
}

EntityStore.Noop = Noop;
EntityStore.NOOP = Noop;
