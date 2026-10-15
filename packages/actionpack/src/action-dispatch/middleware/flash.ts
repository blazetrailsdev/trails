import type { RackApp, RackEnv } from "@blazetrails/rack";
import { Enumerable, include, rbObjDup } from "@blazetrails/ruby-compat";

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
    this.env[KEY] = hash.dup();
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
  private _flashes: Map<string, unknown> = new Map();
  private _discard: Set<string>;
  private _keep: Set<string> = new Set();
  private _now: FlashNow | null = null;

  constructor(flashes: Record<string, unknown> = {}, discard: readonly string[] = []) {
    this._discard = new Set(discard);
    for (const [k, v] of Object.entries(flashes)) {
      this._flashes.set(k, v);
    }
  }

  get(key: string): unknown {
    return this._flashes.get(key);
  }

  set(key: string, value: unknown): void {
    this._discard.delete(key);
    this._flashes.set(key, value);
  }

  has(key: string): boolean {
    return this._flashes.has(key);
  }

  delete(key: string): unknown {
    const val = this._flashes.get(key);
    this._flashes.delete(key);
    return val;
  }

  get keys(): string[] {
    return [...this._flashes.keys()];
  }

  isEmpty(): boolean {
    return this._flashes.size === 0;
  }

  each(block: (pair: [string, unknown]) => void): void {
    for (const [k, v] of this._flashes) block([k, v]);
  }

  toHash(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of this._flashes) result[k] = v;
    return result;
  }

  get alert(): unknown {
    return this.get("alert");
  }
  set alert(value: unknown) {
    this.set("alert", value);
  }

  get notice(): unknown {
    return this.get("notice");
  }
  set notice(value: unknown) {
    this.set("notice", value);
  }

  get now(): FlashNow {
    return (this._now ??= new FlashNow(this));
  }

  /** @internal */
  private isNowIsLoaded(): boolean {
    return this._now != null;
  }

  keep(k?: string): Record<string, unknown> {
    if (k) {
      this._keep.add(k);
      this._discard.delete(k);
    } else {
      for (const k of this._flashes.keys()) {
        this._keep.add(k);
        this._discard.delete(k);
      }
    }
    return this.toHash();
  }

  discard(k?: string): Record<string, unknown> {
    if (k) {
      this._discard.add(k);
      this._keep.delete(k);
    } else {
      for (const k of this._flashes.keys()) {
        this._discard.add(k);
      }
    }
    return this.toHash();
  }

  sweep(): void {
    for (const k of this._discard) {
      if (!this._keep.has(k)) {
        this._flashes.delete(k);
      }
    }
    this._discard.clear();
    this._keep.clear();

    for (const k of this._flashes.keys()) {
      this._discard.add(k);
    }
  }

  clear(): void {
    this._flashes.clear();
    this._discard.clear();
    this._keep.clear();
  }

  replace(h: Record<string, unknown>): void {
    this._flashes.clear();
    for (const [k, v] of Object.entries(h)) {
      this._flashes.set(k, v);
    }
  }

  update(h: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(h)) {
      this.set(k, v);
    }
  }

  /** @internal */
  toSessionValue(): { discard: string[]; flashes: Record<string, unknown> } | null {
    const flashesToKeep: Record<string, unknown> = {};
    for (const [k, v] of this._flashes) {
      if (!this._discard.has(k)) flashesToKeep[k] = v;
    }
    if (Object.keys(flashesToKeep).length === 0) return null;
    return { discard: [], flashes: flashesToKeep };
  }

  dup(): FlashHash {
    const copy = new FlashHash();
    if (this.isNowIsLoaded()) {
      copy._now = rbObjDup(this.now);
      copy._now.flash = copy;
    }
    for (const [k, v] of this._flashes) copy._flashes.set(k, v);
    for (const k of this._discard) copy._discard.add(k);
    for (const k of this._keep) copy._keep.add(k);
    return copy;
  }

  static fromSessionValue(value: unknown): FlashHash {
    if (value === null || value === undefined) return new FlashHash();
    if (value instanceof FlashHash) return value.dup();
    if (typeof value !== "object") return new FlashHash();
    const obj = value as Record<string, unknown>;
    const flashesRaw = obj["flashes"];
    const flashes = (flashesRaw && typeof flashesRaw === "object" ? flashesRaw : obj) as Record<
      string,
      unknown
    >;
    const discardRaw = obj["discard"];
    const discard = Array.isArray(discardRaw) ? (discardRaw as string[]) : [];
    const discardSet = new Set(discard);
    const out = new FlashHash();
    for (const [k, v] of Object.entries(flashes)) {
      if (discardSet.has(k)) continue;
      out._flashes.set(k, v);
      out._discard.add(k);
    }
    return out;
  }
}

export interface FlashHash {
  [Symbol.iterator](): IterableIterator<[string, unknown]>;
}
/* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */

include(FlashHash, Enumerable);

export class Flash {
  constructor(app: RackApp) {
    return app as unknown as Flash;
  }
}
