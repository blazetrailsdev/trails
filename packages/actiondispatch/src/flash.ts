/**
 * ActionDispatch::Flash
 *
 * Flash message store that persists for one request.
 */

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

  get alert(): unknown { return this.get("alert"); }
  set alert(value: unknown) { this.set("alert", value); }

  get notice(): unknown { return this.get("notice"); }
  set notice(value: unknown) { this.set("notice", value); }

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
    return Object.fromEntries(this._flashes);
  }

  static fromSessionValue(value: Record<string, unknown> | null | undefined): FlashHash {
    if (!value) return new FlashHash();
    return new FlashHash(value);
  }
}
