/**
 * PostgreSQL OID type — object identifier.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Oid.
 * Rails: `class Oid < Type::UnsignedInteger; def type; :oid; end; end`.
 */

import { UnsignedInteger } from "../../../type/unsigned-integer.js";

export class Oid extends UnsignedInteger {
  override readonly name: string = "oid";

  // Rails' Oid sets no :limit, so the introspected column reports `limit == nil`
  // and `t.oid` dumps bare. UnsignedInteger already doubles the default-limit-4
  // signed max (2^31) to 2^32, giving exactly the unsigned-32 OID window
  // [0, 0xffffffff] — the inherited range check enforces it on serialize, so no
  // expanded limit or cast/serialize override is needed (carrying limit=8
  // surfaced a spurious `limit: 8` on oid columns).

  override type(): string {
    return "oid";
  }
}
