export interface CacheEntry {
  value: unknown;
  expiresAt: number | null; // timestamp ms, null = no expiry
  accessedAt: number;
}

/** @internal */
export class Entry {
  protected _value: unknown;
  readonly version: string | null;
  private _createdAt: number;
  private _expiresIn: number | null;

  constructor(
    value: unknown,
    options: {
      version?: string | null;
      expiresIn?: number | null;
      expiresAt?: number | null;
    } = {},
  ) {
    this._value = value;
    this.version = options.version ?? null;
    this._createdAt = 0;
    if (options.expiresAt != null) {
      this._expiresIn = options.expiresAt - this._createdAt;
    } else if (options.expiresIn != null) {
      this._expiresIn = options.expiresIn * 1000 + Date.now();
    } else {
      this._expiresIn = null;
    }
  }

  get value(): unknown {
    return this._value;
  }

  get expiresAt(): number | null {
    return this._expiresIn != null ? this._createdAt + this._expiresIn : null;
  }

  set expiresAt(value: number | null) {
    this._expiresIn = value != null ? value - this._createdAt : null;
  }

  isExpired(): boolean {
    return this._expiresIn != null && this._createdAt + this._expiresIn <= Date.now();
  }

  isMismatched(version: string | null | undefined): boolean {
    return !!(this.version && version && this.version !== version);
  }
}

/** @internal */
export function namespaceKey(key: string, namespace?: string): string {
  return namespace ? `${namespace}:${key}` : key;
}

export function isExpired(entry: CacheEntry): boolean {
  return entry.expiresAt !== null && Date.now() > entry.expiresAt;
}
