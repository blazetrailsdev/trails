import { included } from "./include.js";
import { rbEql, rbEqual } from "./rb-equal.js";
import { rbHash } from "./rb-hash.js";

/**
 * An instance of a class built by `Struct.new` (`vendor/ruby/v3.3.11/struct.c:643`
 * `rb_struct_s_def`): the `RSTRUCT` whose members `rb_struct_equal`,
 * `rb_struct_eql` and `rb_struct_hash` walk.
 *
 * @noRailsEquivalent PERMANENT
 */
export interface StructInstance {
  members(): string[];
  equals(other: unknown): boolean;
  eql(other: unknown): boolean;
  hash(): number;
}

const structClasses = new WeakSet<object>();

function isStruct(value: unknown): value is StructInstance & object {
  if (typeof value !== "object" || value === null) return false;
  for (let proto = Object.getPrototypeOf(value); proto; proto = Object.getPrototypeOf(proto)) {
    if (structClasses.has(proto)) return true;
  }
  return false;
}

function structValues(s: StructInstance): unknown[] {
  return s.members().map((member) => (s as unknown as Record<string, unknown>)[member]);
}

/**
 * Ruby's `Struct` (`vendor/ruby/v3.3.11/struct.c:2166` `rb_cStruct`). `Struct.new`
 * returns the members' anonymous class as a module: a class that JS already
 * gives another superclass `include`s it where Ruby would inherit from it, and
 * each member is read off the instance by name.
 *
 * @noRailsEquivalent PERMANENT
 */
export const Struct = {
  /**
   * `rb_struct_s_def` (`vendor/ruby/v3.3.11/struct.c:643`).
   *
   * @noRailsEquivalent PERMANENT
   */
  new(...memberNames: string[]) {
    return {
      /**
       * `rb_struct_members_m` (`vendor/ruby/v3.3.11/struct.c:227`).
       *
       * @noRailsEquivalent PERMANENT
       */
      members(this: StructInstance): string[] {
        return [...memberNames];
      },

      /**
       * `rb_struct_equal` (`vendor/ruby/v3.3.11/struct.c:1400`).
       *
       * @noRailsEquivalent PERMANENT
       */
      equals(this: StructInstance, other: unknown): boolean {
        if (this === other) return true;
        if (!isStruct(other)) return false;
        if (this.constructor !== other.constructor) return false;
        const values = structValues(other);
        return structValues(this).every((value, i) => rbEqual(value, values[i]));
      },

      /**
       * `rb_struct_eql` (`vendor/ruby/v3.3.11/struct.c:1481`).
       *
       * @noRailsEquivalent PERMANENT
       */
      eql(this: StructInstance, other: unknown): boolean {
        if (this === other) return true;
        if (!isStruct(other)) return false;
        if (this.constructor !== other.constructor) return false;
        const values = structValues(other);
        return structValues(this).every((value, i) => rbEql(value, values[i]));
      },

      /**
       * `rb_struct_hash` (`vendor/ruby/v3.3.11/struct.c:1432`).
       *
       * @noRailsEquivalent PERMANENT
       */
      hash(this: StructInstance): number {
        return rbHash([this.constructor, ...structValues(this)]);
      },

      [included](klass: { prototype: object }): void {
        structClasses.add(klass.prototype);
      },
    };
  },
};
