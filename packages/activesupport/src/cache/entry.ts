import { deflate, inflate } from "../gzip.js";
import { DeserializationError } from "./deserialization-error.js";
import { coder } from "./coder.js";

/** @internal */
export class Entry {
  protected _value: unknown;
  readonly version: string | null;
  private _createdAt: number;
  private _expiresIn: number | null;
  private _compressed: boolean;
  private _bytesize?: number;

  // Mirrors Rails Entry.unpack (entry.rb:15-17): rebuilds an Entry from the
  // array produced by #pack.
  static unpack(members: unknown[]): Entry {
    // A nil value is popped from #pack's trailing nils, so members[0] is absent
    // (undefined) here; normalize to null to mirror Ruby's `members[0]` nil and
    // stay consistent with the `?? null` already applied to the other members.
    return new Entry(members[0] ?? null, {
      expiresAt: (members[1] as number | null) ?? null,
      version: (members[2] as string | null) ?? null,
    });
  }

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

  // Returns the size of the cached value. May be less than the value's byte
  // size when the data is compressed. Mirrors Rails Entry#bytesize
  // (entry.rb:60-69); the non-String branch is memoized like Rails' `@s`.
  bytesize(): number {
    const value = this.value;
    if (value == null) {
      return 0;
    } else if (typeof value === "string") {
      // Rails `@value.bytesize` — the *stored* value's byte size. When the entry
      // is compressed, @value is the binary deflated payload (a latin1 string,
      // one char per byte) so its byte size is its length; otherwise it is a
      // UTF-8 string.
      return this._compressed ? (this._value as string).length : byteLength(this._value as string);
    } else {
      // Rails `@s ||= Marshal.dump(@value).bytesize` (entry.rb:65-68). When the
      // entry is compressed, @value is the binary deflated payload string and
      // Marshal.dump wraps it in framing overhead (version + type tag + length),
      // which we reproduce exactly via marshalStringBytesize. Uncompressed,
      // @value is the Array/Object serialized by the Marshal-equivalent fidelity
      // Coder. nil/bool/Numeric are never compressed (entry.rb:79-82), so only
      // Array/Object reaches the compressed branch in practice.
      return (this._bytesize ??= this._compressed
        ? marshalStringBytesize((this._value as string).length)
        : byteLength(coder.dump(this._value)));
    }
  }

  // Mirrors Rails Entry#local? (entry.rb:100-102).
  isLocal(): boolean {
    return false;
  }

  // Duplicates the value to protect against accidental cache modifications,
  // unless it is compressed, Numeric, or boolean. Mirrors Rails Entry#dup_value!
  // (entry.rb:105-112). JS strings are immutable so the String branch is a
  // no-op; non-String values are deep-cloned via the fidelity Coder round-trip
  // that stands in for Marshal here.
  dupValueBang(): void {
    if (
      this._value != null &&
      !this._compressed &&
      !(typeof this._value === "number" || typeof this._value === "boolean")
    ) {
      if (typeof this._value !== "string") {
        this._value = coder.load(coder.dump(this._value));
      }
    }
  }

  // Mirrors Rails Entry#pack (entry.rb:114-118): [value, expires_at, version]
  // with trailing nils popped.
  pack(): unknown[] {
    const members: unknown[] = [this.value, this.expiresAt, this.version];
    while (members.length > 0 && members[members.length - 1] == null) {
      members.pop();
    }
    return members;
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
      serialized = coder.dump(this._value);
      uncompressedSize = byteLength(serialized);
    }

    // Mirrors Rails' shape: the threshold is checked against the raw value size
    // (entry.rb:84 `@value.bytesize`) while what actually gets compressed is the
    // serialized form (entry.rb:90 `Marshal.dump`) — here the trails
    // Marshal-equivalent fidelity Coder (see coder.ts).
    if (uncompressedSize >= compressThreshold) {
      serialized ??= coder.dump(this._value);
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
    return this.marshalLoad(inflate(value));
  }

  // Mirrors Rails Entry#marshal_load (entry.rb:127-130): deserialize, raising
  // Cache::DeserializationError when the payload is malformed. The trails
  // Marshal-equivalent fidelity Coder (see coder.ts) stands in for Marshal.load.
  private marshalLoad(payload: string): unknown {
    try {
      return coder.load(payload);
    } catch (error) {
      throw new DeserializationError(error instanceof Error ? error.message : String(error));
    }
  }
}

// Byte size of `Marshal.dump(str)` for a binary (ASCII-8BIT) Ruby String of
// `byteLen` bytes — the form a deflated cache payload takes. The dump is the
// 2-byte Marshal version, a 1-byte `"` String tag, the Marshal-encoded byte
// length, then the bytes themselves. Binary strings carry no encoding instance
// variable, so there is no extra framing. Matches `Marshal.dump(str).bytesize`.
function marshalStringBytesize(byteLen: number): number {
  return 2 + 1 + marshalUintSize(byteLen) + byteLen;
}

// Number of bytes Ruby's Marshal uses to encode a non-negative integer `n`.
// 0 and 1..122 fit in a single tagged byte; larger values are a 1-byte count
// followed by `count` little-endian bytes (entry payload lengths only).
function marshalUintSize(n: number): number {
  if (n <= 122) return 1;
  let count = 0;
  for (let v = n; v > 0; v = Math.floor(v / 256)) count++;
  return 1 + count;
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
