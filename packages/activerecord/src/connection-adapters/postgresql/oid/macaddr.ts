/**
 * PostgreSQL macaddr type — MAC address.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Macaddr.
 * Rails: `class Macaddr < Type::String`. Overrides `type`, `changed?`,
 * and `changed_in_place?` to do case-insensitive comparison so casing
 * differences don't mark the column dirty.
 */

import { StringType } from "@blazetrails/activemodel";

export class Macaddr extends StringType {
  override readonly name: string = "macaddr";

  override type(): string {
    return this.name;
  }

  override isChanged(
    oldValue: unknown,
    newValue: unknown,
    _newValueBeforeTypeCast?: unknown,
  ): boolean {
    if (oldValue?.constructor !== newValue?.constructor) return true;
    if (typeof oldValue === "string" && typeof newValue === "string") {
      return oldValue.toLowerCase() !== newValue.toLowerCase();
    }
    return oldValue !== newValue;
  }

  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    if (rawOldValue?.constructor !== newValue?.constructor) return true;
    if (typeof rawOldValue === "string" && typeof newValue === "string") {
      return rawOldValue.toLowerCase() !== newValue.toLowerCase();
    }
    return rawOldValue !== newValue;
  }
}
