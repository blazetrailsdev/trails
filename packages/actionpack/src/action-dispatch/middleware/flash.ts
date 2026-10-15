import type { RackApp, RackEnv } from "@blazetrails/rack";
import { exceptBang, isPlainObject, stringifyKeys } from "@blazetrails/activesupport";
import {
  Enumerable,
  Set,
  except,
  hashReplace,
  include,
  rbDeclareIvar,
  rbObjDup,
  rbObjIvarGet,
} from "@blazetrails/ruby-compat";

/** @internal */
export const KEY = "action_dispatch.request.flash_hash";

/** @internal */
export interface FlashRequestHost {
  env: RackEnv;
  getHeader(name: string): any;
  setHeader(name: string, value: unknown): unknown;
  flashHash(): FlashHash | null;
  session: {
    isEnabled?(): boolean;
    isLoaded(): boolean;
    isKey(key: string): boolean;
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    delete(key: string): void;
  };
}

export class RequestMethods {
  get flash(): FlashHash | null {
    const flash = this.flashHash();
    if (flash) return flash;
    return (this.flash = FlashHash.fromSessionValue(
      (this as unknown as FlashRequestHost).session.get("flash"),
    ));
  }

  set flash(flash: FlashHash | null) {
    (this as unknown as FlashRequestHost).setHeader(KEY, flash);
  }

  /** @internal */
  flashHash(): FlashHash | null {
    return (
      ((this as unknown as FlashRequestHost).getHeader(KEY) as FlashHash | null | undefined) ?? null
    );
  }
}

/** @internal */
export function commitFlash(this: FlashRequestHost): void {
  const session = this.session;
  if (session.isEnabled && !session.isEnabled()) return;

  const hash = this.flashHash();
  if (hash && (!hash.isEmpty() || session.isKey("flash"))) {
    session.set("flash", hash.toSessionValue());
    this.env[KEY] = rbObjDup(hash);
  }

  if (session.isLoaded()) {
    if (session.isKey("flash") && session.get("flash") == null) {
      session.delete("flash");
    }
  }
}

/** @internal */
export function resetSession(this: FlashRequestHost): void {
  this.env[KEY] = null;
}

/** @internal */
export class FlashNow {
  flash: FlashHash;

  constructor(flash: FlashHash) {
    this.flash = flash;
  }

  set(k: string, v: unknown): unknown {
    k = String(k);
    this.flash.set(k, v);
    this.flash.discard(k);
    return v;
  }

  get(k: string): unknown {
    return this.flash.get(String(k));
  }

  set alert(message: unknown) {
    this.set("alert", message);
  }

  set notice(message: unknown) {
    this.set("notice", message);
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include Enumerable` (`actionpack/lib/action_dispatch/middleware/flash.rb:120`); the class/interface merge is how a mixin surfaces on the type side. */
export class FlashHash {
  private _discard: Set<string>;
  private _flashes: Record<string, unknown>;
  private _now: FlashNow | null;

  /** @internal */
  static fromSessionValue(value: unknown): FlashHash {
    let flashes: Record<string, unknown>;
    let discard: unknown;
    if (value instanceof FlashHash) {
      flashes = rbObjIvarGet(value, "@flashes") as Record<string, unknown>;
      if ((discard = rbObjIvarGet(value, "@used")) != null) {
        exceptBang(flashes, ...(discard as Iterable<string>));
      }
      return new this(flashes, Object.keys(flashes));
    } else if (isPlainObject(value)) {
      flashes = (value as Record<string, unknown>)["flashes"] as Record<string, unknown>;
      if ((discard = (value as Record<string, unknown>)["discard"]) != null) {
        exceptBang(flashes, ...(discard as string[]));
      }
      return new this(flashes, Object.keys(flashes));
    } else {
      return new this();
    }
  }

  /** @internal */
  toSessionValue(): { discard: string[]; flashes: Record<string, unknown> } | null {
    const flashesToKeep = except(this._flashes, ...this._discard);
    if (Object.keys(flashesToKeep).length === 0) return null;
    return { discard: [], flashes: flashesToKeep };
  }

  /** @internal */
  constructor(flashes: Record<string, unknown> = {}, discard: readonly string[] = []) {
    this._discard = new Set(this.stringifyArray(discard));
    this._flashes = stringifyKeys(flashes);
    this._now = null;
  }

  initializeCopy(other: FlashHash): void {
    if (other.isNowIsLoaded()) {
      this._now = rbObjDup(other.now);
      this._now.flash = this;
    }
  }

  set(k: string, v: unknown): unknown {
    k = String(k);
    this._discard.delete(k);
    return (this._flashes[k] = v);
  }

  get(k: string): unknown {
    return this._flashes[String(k)];
  }

  /** @internal */
  update(h: Record<string, unknown>): this {
    this._discard.subtract(this.stringifyArray(Object.keys(h)));
    Object.assign(this._flashes, stringifyKeys(h));
    return this;
  }

  get keys(): string[] {
    return Object.keys(this._flashes);
  }

  isKey(name: string): boolean {
    return Object.hasOwn(this._flashes, String(name));
  }

  delete(key: string): this {
    key = String(key);
    this._discard.delete(key);
    delete this._flashes[key];
    return this;
  }

  toHash(): Record<string, unknown> {
    return { ...this._flashes };
  }

  isEmpty(): boolean {
    return Object.keys(this._flashes).length === 0;
  }

  clear(): void {
    this._discard.clear();
    for (const k of Object.keys(this._flashes)) delete this._flashes[k];
  }

  each(block: (pair: [string, unknown]) => void): this {
    for (const pair of Object.entries(this._flashes)) block(pair);
    return this;
  }

  declare mergeBang: FlashHash["update"];

  /** @internal */
  replace(h: Record<string, unknown>): this {
    this._discard.clear();
    hashReplace(this._flashes, stringifyKeys(h));
    return this;
  }

  get now(): FlashNow {
    return (this._now ??= new FlashNow(this));
  }

  keep(k?: string | null): unknown {
    if (k != null) k = String(k);
    this._discard.subtract(k != null ? [k] : this.keys);
    return k != null ? this.get(k) : this;
  }

  discard(k?: string | null): unknown {
    if (k != null) k = String(k);
    this._discard.merge(k != null ? [k] : this.keys);
    return k != null ? this.get(k) : this;
  }

  /** @internal */
  sweep(): void {
    for (const k of this._discard) delete this._flashes[k];
    this._discard.replace(this.keys);
  }

  get alert(): unknown {
    return this.get("alert");
  }
  set alert(message: unknown) {
    this.set("alert", message);
  }

  get notice(): unknown {
    return this.get("notice");
  }
  set notice(message: unknown) {
    this.set("notice", message);
  }

  /** @internal */
  protected isNowIsLoaded(): boolean {
    return this._now != null;
  }

  /** @internal */
  private stringifyArray<T>(array: readonly T[]): T[] {
    return array.map((item) => item);
  }
}

export interface FlashHash {
  [Symbol.iterator](): IterableIterator<[string, unknown]>;
}
/* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */

FlashHash.prototype.mergeBang = FlashHash.prototype.update;
rbDeclareIvar(FlashHash, "@flashes", "_flashes");
rbDeclareIvar(FlashHash, "@discard", "_discard");
rbDeclareIvar(FlashHash, "@now", "_now");
include(FlashHash, Enumerable);

export class Flash {
  static readonly KEY = KEY;
  static readonly RequestMethods = RequestMethods;
  static readonly FlashNow = FlashNow;
  static readonly FlashHash = FlashHash;

  constructor(app: RackApp) {
    return app as unknown as Flash;
  }
}
