import { camelize } from "@blazetrails/activesupport";
import { ArgumentError, hasSecurePassword } from "@blazetrails/activemodel";
import type { Base } from "./base.js";

/**
 * Mirrors: `include ActiveModel::SecurePassword` (secure_password.rb:7) —
 * `has_secure_password` itself is ActiveModel's, and ActiveRecord adds only
 * `authenticate_by` below plus the `generates_token_for` wiring ActiveModel
 * already reaches through `respond_to?(:generates_token_for)`.
 */
export { hasSecurePassword };

/**
 * Given a set of attributes, finds a record using the non-password
 * attributes, and then authenticates that record using the password
 * attributes. Returns the record if authentication succeeds; otherwise,
 * returns +nil+.
 *
 * Regardless of whether a record is found, +authenticate_by+ will
 * cryptographically digest the given password attributes. This behavior
 * helps mitigate timing-based enumeration attacks, wherein an attacker can
 * determine if a passworded record exists even without knowing the
 * password.
 *
 * Raises an ArgumentError if the set of attributes doesn't contain at
 * least one password and one non-password attribute.
 *
 * Mirrors: ActiveRecord::SecurePassword::ClassMethods#authenticate_by
 * (secure_password.rb:40-55). `attributes.to_h` is `toH` here, trails being
 * camelCase-only, and a plain object stands in for the Hash a Hash answers for
 * itself. The not-found arm's `new(passwords)` (:53) is what makes the two
 * paths take the same time: building a record runs the `password=` writer, and
 * with it the BCrypt hash the found path spends.
 *
 * @missingRailsCall map — PERMANENT:
 *   `attributes.to_h.partition { ... }.map(&:to_h)`
 *   (`secure_password.rb:41-43`) — `partition` yields two arrays of pairs that
 *   `map(&:to_h)` turns back into Hashes; the TS body partitions into two entry
 *   arrays directly, so there is no pair-array-to-Hash `map` step.
 */
export async function authenticateBy(
  this: typeof Base,
  attributes: Record<string, unknown> | { toH(): Record<string, unknown> },
): Promise<Base | null> {
  const attrs =
    typeof (attributes as { toH?: unknown }).toH === "function"
      ? (attributes as { toH(): Record<string, unknown> }).toH()
      : (attributes as Record<string, unknown>);

  const passwords: Record<string, unknown> = {};
  const identifiers: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(attrs)) {
    if (!this.hasAttribute(name) && this.hasAttribute(`${name}_digest`)) {
      passwords[name] = value;
    } else {
      identifiers[name] = value;
    }
  }

  if (Object.keys(passwords).length === 0) {
    throw new ArgumentError("One or more password arguments are required");
  }
  if (Object.keys(identifiers).length === 0) {
    throw new ArgumentError("One or more finder arguments are required");
  }

  if (Object.values(passwords).some((value) => value == null || value === "")) return null;

  const record = (await (this as unknown as { findBy(h: object): Promise<Base | null> }).findBy(
    identifiers,
  )) as (Base & Record<string, (value: unknown) => unknown>) | null;
  if (record) {
    const count = Object.entries(passwords).filter(([name, value]) =>
      record[`authenticate${camelize(name)}`].call(record, value),
    ).length;
    return count === Object.keys(passwords).length ? record : null;
  } else {
    new (this as unknown as new (attributes: object) => Base)(passwords);
    return null;
  }
}
