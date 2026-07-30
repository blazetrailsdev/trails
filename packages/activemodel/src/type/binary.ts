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

  /**
   * Mirrors: ActiveModel::Type::Binary#changed_in_place? (binary.rb:35-38)
   *
   *   old_value = deserialize(raw_old_value)
   *   old_value != value
   *
   * Rails does not coerce `value`; it relies on Ruby's `!=`. JS cannot compare
   * byte arrays with `!=`, so the bytes are walked, and `cast` supplies the
   * `Uint8Array` that walk needs. It is identity in practice: the only callers
   * (`Attribute#changedInPlace` / `#changedInPlaceFromDatabase`) pass
   * `this.value`, which is already cast.
   */
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
   * Mirrors: Data#initialize (binary.rb:42-46) — `value = value.to_s`, then `.b`
   * to force BINARY encoding. `Uint8Array` is our stand-in for Ruby's
   * binary-encoded String, so byte sources pass through unchanged (as Ruby's
   * `.b` on an already-BINARY String returns it unchanged) and everything else
   * is coerced via `String(value)`, standing in for `to_s`.
   *
   * The `Data` arm is not idempotence sugar — it is precisely Ruby's `to_s`
   * step. Ruby gets it free because `Data#to_s` returns the byte string, but
   * JS's `String(data)` runs our `toString()`, which UTF-8-decodes: it turns
   * `de ad be ef` into `de ad ef bf bd ef bf bd` (U+FFFD replacements). So the
   * arm is what makes `new Data(data)` byte-preserving, matching Ruby.
   *
   * `Uint8Array` is stored by reference, so mutating the source array mutates
   * this `Data` — the same aliasing Ruby has when `.b` returns self.
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

  /**
   * Mirrors: Data#== (binary.rb:56) — `other == to_s || super`.
   *
   * Ruby's left arm compares `other` against the raw binary String, so it is a
   * BYTE comparison; another `Data` recurses one level and lands on
   * `String#==`, again on bytes. Our `toString()` UTF-8-decodes and is lossy
   * (`de ad be ef` → U+FFFD replacements), so the port must walk `bytes`
   * rather than route through it. `Uint8Array` is our stand-in for a
   * binary-encoded Ruby String (see the constructor), and a `string` is
   * encoded to compare on the same footing.
   *
   * The `|| super` arm — `Object#==`, identity — needs no separate case: an
   * identical `Data` already matches byte-for-byte, and anything that is
   * neither a byte source nor a string can never be identical to a `Data`.
   */
  equals(other: unknown): boolean {
    let otherBytes: Uint8Array;
    if (other instanceof Data) otherBytes = other.bytes;
    else if (other instanceof Uint8Array) otherBytes = other;
    else if (typeof other === "string") otherBytes = textEncoder.encode(other);
    else return false;

    if (this.bytes.length !== otherBytes.length) return false;
    for (let i = 0; i < this.bytes.length; i++) {
      if (this.bytes[i] !== otherBytes[i]) return false;
    }
    return true;
  }
}
