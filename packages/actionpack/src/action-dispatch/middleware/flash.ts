import type { RackEnv } from "@blazetrails/rack";

/** @internal */
export const KEY = "action_dispatch.request.flash_hash";

/** @internal */
export interface FlashRequestHost {
  env: RackEnv;
  getHeader(name: string): any;
  session: {
    isEnabled?(): boolean;
    isLoaded(): boolean;
    isKey(key: string): boolean;
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    delete(key: string): void;
  };
}

export function flash(this: FlashRequestHost, value?: FlashHash | null): FlashHash | null {
  if (arguments.length > 0) {
    const normalized = value ?? null;
    this.env[KEY] = normalized;
    return normalized;
  }
  const existing = flashHash.call(this);
  if (existing) return existing;
  const built = FlashHash.fromSessionValue(this.session.get("flash"));
  this.env[KEY] = built;
  return built;
}

/** @internal */
export function flashHash(this: FlashRequestHost): FlashHash | null {
  return (this.getHeader(KEY) as FlashHash | null | undefined) ?? null;
}

/** @internal */
export function commitFlash(this: FlashRequestHost): void {
  const session = this.session;
  if (session.isEnabled && !session.isEnabled()) return;

  const hash = flashHash.call(this);
  if (hash && (!hash.empty || session.isKey("flash"))) {
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

export class FlashHash {
  private _flashes: Map<string, unknown> = new Map();
  private _discard: Set<string> = new Set();
  private _keep: Set<string> = new Set();
  private _now: Map<string, unknown> = new Map();

  constructor(flashes: Record<string, unknown> = {}, discard: readonly string[] = []) {
    for (const k of discard) this._discard.add(k);
    for (const [k, v] of Object.entries(flashes)) {
      this._flashes.set(k, v);
    }
  }

  get(key: string): unknown {
    return this._now.get(key) ?? this._flashes.get(key);
  }

  set(key: string, value: unknown): void {
    this._discard.delete(key);
    this._flashes.set(key, value);
  }

  has(key: string): boolean {
    return this._flashes.has(key) || this._now.has(key);
  }

  delete(key: string): unknown {
    const val = this._flashes.get(key);
    this._flashes.delete(key);
    return val;
  }

  get keys(): string[] {
    return [...new Set([...this._flashes.keys(), ...this._now.keys()])];
  }

  get empty(): boolean {
    return this._flashes.size === 0 && this._now.size === 0;
  }

  each(fn: (key: string, value: unknown) => void): void {
    for (const [k, v] of this._flashes) fn(k, v);
    for (const [k, v] of this._now) {
      if (!this._flashes.has(k)) fn(k, v);
    }
  }

  toHash(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of this._flashes) result[k] = v;
    for (const [k, v] of this._now) {
      if (!(k in result)) result[k] = v;
    }
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

  now(key: string, value: unknown): void {
    this._now.set(key, value);
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
    this._now.clear();
  }

  clear(): void {
    this._flashes.clear();
    this._discard.clear();
    this._keep.clear();
    this._now.clear();
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
    for (const [k, v] of this._flashes) copy._flashes.set(k, v);
    for (const [k, v] of this._now) copy._now.set(k, v);
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
