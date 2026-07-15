import { ValueType } from "./value.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class BinaryType extends ValueType<Uint8Array> {
  readonly name = "binary";

  type(): string {
    return this.name;
  }

  isBinary(): boolean {
    return true;
  }

  cast(value: unknown): Uint8Array | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Data) return value.bytes;
    if (value instanceof Uint8Array) return value;
    return textEncoder.encode(String(value));
  }

  /**
   * Mirrors: ActiveModel::Type::Binary#serialize (binary.rb:30-33)
   *
   *   def serialize(value)
   *     return if value.nil?
   *     Data.new(super)
   *   end
   *
   * `super` is Value#serialize — identity, *not* `cast` — so the raw value is
   * handed to `Data`, whose constructor does the `to_s`/binary coercion. The
   * wrapper is what `quote` dispatches on (abstract/quoting.rb:83).
   */
  serialize(value: unknown): Data | null {
    if (value === null || value === undefined) return null;
    return new Data(super.serialize(value));
  }

  isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    const old = this.deserialize(rawOldValue);
    const cur = this.cast(newValue);
    if (old === null && cur === null) return false;
    if (old === null || cur === null) return true;
    if (old.length !== cur.length) return true;
    for (let i = 0; i < old.length; i++) {
      if (old[i] !== cur[i]) return true;
    }
    return false;
  }
}

export class Data {
  readonly bytes: Uint8Array;

  /**
   * Mirrors: Data#initialize (binary.rb:42-46) — `value.to_s`, then `.b` to
   * force BINARY encoding. `Uint8Array` is our stand-in for Ruby's
   * binary-encoded String, so byte sources pass through unchanged and
   * everything else is coerced via `String(value)` (Ruby's `to_s`). Re-wrapping
   * a `Data` is idempotent, mirroring `Data.new(data)` → `data.to_s`.
   */
  constructor(value: unknown) {
    if (value instanceof Data) this.bytes = value.bytes;
    else if (value instanceof Uint8Array) this.bytes = value;
    else this.bytes = textEncoder.encode(String(value));
  }

  toString(): string {
    return textDecoder.decode(this.bytes);
  }

  hex(): string {
    return Array.from(this.bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}
