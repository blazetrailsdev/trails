/**
 * PostgreSQL bytea type — binary data.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Bytea.
 *
 * Rails: `class Bytea < Type::Binary`. Only overrides deserialize, relying
 * on Type::Binary for cast/serialize/isChangedInPlace.
 */

import { BinaryType, BinaryData } from "@blazetrails/activemodel";
import { unescapeBytea } from "../quoting.js";

export class Bytea extends BinaryType {
  /**
   * Rails' OID::Bytea#deserialize:
   *   return if value.nil?
   *   return value.to_s if value.is_a?(Type::Binary::Data)
   *   PG::Connection.unescape_bytea(super)
   *
   * `unescape_bytea` handles both hex (`\x...`) and legacy octal escape
   * formats. We delegate to our shared `unescapeBytea` helper (the same
   * one used by quoting.ts) so octal escapes aren't silently lost.
   */
  override deserialize(value: unknown): Uint8Array | null {
    if (value == null) return null;
    if (value instanceof BinaryData) return value.bytes;
    // Buffer in Node is already a Uint8Array — return it directly instead
    // of allocating a copy via Uint8Array.from.
    if (typeof value === "string") return unescapeBytea(value);
    return super.deserialize(value);
  }
}
