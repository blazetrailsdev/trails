/**
 * ActionDispatch::Flash
 *
 * Flash message store that persists for one request.
 */

import type { RackEnv } from "@blazetrails/rack";

/**
 * Rack env key under which the request's {@link FlashHash} is stored.
 * Mirrors `ActionDispatch::Flash::KEY`.
 *
 * @internal
 */
export const FLASH_KEY = "action_dispatch.request.flash_hash";

/**
 * Host shape used by {@link flash} / {@link flashHash} / {@link commitFlash}
 * / {@link resetSession}. Matches the Request surface Rails'
 * `Flash::RequestMethods` reads from.
 *
 * @internal
 */
export interface FlashRequestHost {
  env: RackEnv;
  session: {
    isEnabled?(): boolean;
    isLoaded?(): boolean;
    hasKey(key: string): boolean;
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    delete(key: string): void;
  };
}

/**
 * Access the contents of the flash. Returns the request's
 * {@link FlashHash}, building it from the session on first access.
 * Mirrors `ActionDispatch::Flash::RequestMethods#flash`.
 */
export function flash(this: FlashRequestHost, value?: FlashHash | null): FlashHash | null {
  if (arguments.length > 0) {
    // Normalize `undefined` to `null` so the env key is never left in
    // a non-Railsy "absent vs cleared" limbo state.
    const normalized = value ?? null;
    this.env[FLASH_KEY] = normalized;
    return normalized;
  }
  const existing = flashHash.call(this);
  if (existing) return existing;
  const built = FlashHash.fromSessionValue(this.session.get("flash"));
  this.env[FLASH_KEY] = built;
  return built;
}

/**
 * Returns the cached {@link FlashHash} for this request without falling
 * back to the session, or `null` if {@link flash} has not been called yet.
 *
 * @internal
 */
export function flashHash(this: FlashRequestHost): FlashHash | null {
  return (this.env[FLASH_KEY] as FlashHash | null | undefined) ?? null;
}

/**
 * Persist this request's {@link FlashHash} back into the session, copying
 * the live hash so the next request starts with a fresh dup. Mirrors
 * Rails' `commit_flash`.
 *
 * @internal
 */
export function commitFlash(this: FlashRequestHost): void {
  const session = this.session;
  if (session.isEnabled && !session.isEnabled()) return;

  const hash = flashHash.call(this);
  if (hash && (!hash.empty || session.hasKey("flash"))) {
    const value = hash.flashesForSession();
    if (Object.keys(value).length === 0) {
      session.delete("flash");
    } else {
      session.set("flash", value);
    }
    // Rails: `self.flash = flash_hash.dup` so further mutations don't
    // bleed into the just-stored session value.
    this.env[FLASH_KEY] = hash.dup();
  }

  // Rails guards this branch with `session.loaded?` to avoid forcing a
  // session load just to clean up a nil flash entry. trails' Session
  // already lazily loads on `hasKey`/`get` (action-dispatch/request/
  // session.ts), so the guard would be redundant — and `isLoaded()` is
  // optional on the host shape for environments that do expose it
  // (e.g. a wrapped Rails-style store).
  if (session.isLoaded ? session.isLoaded() : true) {
    if (session.hasKey("flash") && session.get("flash") == null) {
      session.delete("flash");
    }
  }
}

/**
 * The flash side of `Request#reset_session`. Rails prepends this onto
 * Request and uses `super` to chain to the original implementation; in
 * trails-mixin style, the chain is the responsibility of the wiring
 * code, so this function only owns the post-`super` "clear the flash"
 * step. Callers must invoke the underlying `Request#resetSession` first.
 *
 * @internal
 */
export function resetSession(this: FlashRequestHost): void {
  this.env[FLASH_KEY] = null;
}

export class FlashHash {
  private _flashes: Map<string, unknown> = new Map();
  private _discard: Set<string> = new Set();
  private _keep: Set<string> = new Set();
  private _now: Map<string, unknown> = new Map();

  constructor(flashes?: Record<string, unknown>) {
    if (flashes) {
      for (const [k, v] of Object.entries(flashes)) {
        this._flashes.set(k, v);
      }
    }
  }

  // --- Read/Write ---

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

  // --- Convenience ---

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

  // --- Lifecycle ---

  now(key: string, value: unknown): void {
    this._now.set(key, value);
  }

  keep(key?: string): Record<string, unknown> {
    if (key) {
      this._keep.add(key);
      this._discard.delete(key);
    } else {
      for (const k of this._flashes.keys()) {
        this._keep.add(k);
        this._discard.delete(k);
      }
    }
    return this.toHash();
  }

  discard(key?: string): Record<string, unknown> {
    if (key) {
      this._discard.add(key);
      this._keep.delete(key);
    } else {
      for (const k of this._flashes.keys()) {
        this._discard.add(k);
      }
    }
    return this.toHash();
  }

  sweep(): void {
    // Remove discarded keys (unless kept this cycle)
    for (const k of this._discard) {
      if (!this._keep.has(k)) {
        this._flashes.delete(k);
      }
    }
    this._discard.clear();
    this._keep.clear();

    // Mark all remaining keys for discard on next sweep
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

  replace(hash: Record<string, unknown>): void {
    this._flashes.clear();
    for (const [k, v] of Object.entries(hash)) {
      this._flashes.set(k, v);
    }
  }

  update(hash: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(hash)) {
      this.set(k, v);
    }
  }

  // --- Session serialization ---

  toSessionValue(): Record<string, unknown> {
    // Returns the persisted flash entries only. Mirrors Rails'
    // `to_session_value`, which serializes `@flashes` and excludes
    // `flash.now` — `now` entries are intentionally request-local and
    // must not bleed into the next request. Callers that want the
    // request-visible state (including `flash.now`) should use
    // {@link toHash} instead. The session-commit pipeline applies
    // discard filtering via {@link flashesForSession}; this method
    // intentionally skips that filter to preserve the existing
    // contract used by `metal/etag-with-flash`.
    return Object.fromEntries(this._flashes);
  }

  /**
   * Hash projection used by {@link commitFlash} when storing the flash
   * back into the session — mirrors Rails' `to_session_value`'s
   * `@flashes.except(*@discard)` filter.
   *
   * @internal
   */
  flashesForSession(): Record<string, unknown> {
    const keep: Record<string, unknown> = {};
    for (const [k, v] of this._flashes) {
      if (!this._discard.has(k)) keep[k] = v;
    }
    return keep;
  }

  /** Shallow copy mirroring Ruby's `FlashHash#dup`. */
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
    // Rails 4.0+ session shape: `{ "flashes" => Hash, "discard" => Array }`.
    // Rails' `flashes.except!(*discard)` removes the keys the prior request
    // marked for discard, then `new(flashes, flashes.keys)` marks every
    // remaining key for sweep — they live through this request and are
    // dropped on the next one.
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
