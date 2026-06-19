import { deflate, inflate } from "../gzip.js";

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
  private _compressed: boolean;

  constructor(
    value: unknown,
    options: {
      compressed?: boolean;
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
    this._compressed = options.compressed === true;
  }

  get value(): unknown {
    return this._compressed ? this.uncompress(this._value as string) : this._value;
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

  isCompressed(): boolean {
    return this._compressed;
  }

  // Mirrors Rails Entry#compressed(compress_threshold): returns self unless the
  // serialized value meets the threshold and actually shrinks once compressed.
  compressed(compressThreshold: number): Entry {
    if (this._compressed) return this;

    let serialized: string | undefined;
    let uncompressedSize: number;
    if (
      this._value == null ||
      typeof this._value === "boolean" ||
      typeof this._value === "number"
    ) {
      uncompressedSize = 0;
    } else if (typeof this._value === "string") {
      uncompressedSize = byteLength(this._value);
    } else {
      serialized = JSON.stringify(this._value);
      uncompressedSize = byteLength(serialized);
    }

    // Mirrors Rails' shape: the threshold is checked against the raw value size
    // (entry.rb:84 `@value.bytesize`) while what actually gets compressed is the
    // serialized form (entry.rb:90 `Marshal.dump`) — here JSON.
    if (uncompressedSize >= compressThreshold) {
      serialized ??= JSON.stringify(this._value);
      const compressed = deflate(serialized);
      // deflate returns a latin1 string (one char per byte), so its byte size is
      // its length; serialized is utf8, counted by byteLength above.
      if (compressed.length < uncompressedSize) {
        return new Entry(compressed, {
          compressed: true,
          expiresAt: this.expiresAt,
          version: this.version,
        });
      }
    }
    return this;
  }

  private uncompress(value: string): unknown {
    return JSON.parse(inflate(value));
  }
}

function byteLength(value: string): number {
  // Exact UTF-8 byte count without a node:buffer import. Supplementary code
  // points (U+10000+) arrive as a surrogate pair but encode to 4 bytes, so the
  // high surrogate accounts for the whole pair and we skip its low surrogate.
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/** @internal */
export function namespaceKey(key: string, namespace?: string): string {
  return namespace ? `${namespace}:${key}` : key;
}

export function isExpired(entry: CacheEntry): boolean {
  return entry.expiresAt !== null && Date.now() > entry.expiresAt;
}
