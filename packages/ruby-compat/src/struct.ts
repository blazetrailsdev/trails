import { ArgumentError } from "./argument-error.js";
import { FrozenError } from "./frozen-error.js";
import { rbInspect, rbObjClass } from "./object.js";
import { rbEql, rbEqual } from "./rb-equal.js";
import { rbHash } from "./rb-hash.js";
import { TypeError } from "./type-error.js";

/**
 * An instance of a class built by `Struct.new` (`vendor/ruby/v3.3.11/struct.c:643`
 * `rb_struct_s_def`): the `RSTRUCT` whose members `rb_struct_equal`,
 * `rb_struct_eql` and `rb_struct_hash` walk.
 *
 * @noRailsEquivalent PERMANENT
 */
export interface StructInstance {
  members(): string[];
  initializeCopy(s: StructInstance): this;
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

const pairedRecursion: [object, object][] = [];

function rbExecRecursivePaired(
  func: (s: StructInstance, s2: StructInstance, recur: boolean) => boolean,
  s: StructInstance,
  s2: StructInstance,
): boolean {
  if (pairedRecursion.some(([obj, paired]) => obj === s && paired === s2)) {
    return func(s, s2, true);
  }
  pairedRecursion.push([s, s2]);
  try {
    return func(s, s2, false);
  } finally {
    pairedRecursion.pop();
  }
}

function recursiveEqual(s: StructInstance, s2: StructInstance, recur: boolean): boolean {
  if (recur) return true;
  const values = structValues(s2);
  return structValues(s).every((value, i) => rbEqual(value, values[i]));
}

function recursiveEql(s: StructInstance, s2: StructInstance, recur: boolean): boolean {
  if (recur) return true;
  const values = structValues(s2);
  return structValues(s).every((value, i) => rbEql(value, values[i]));
}

/**
 * Ruby's `Struct` (`vendor/ruby/v3.3.11/struct.c:2166` `rb_cStruct`). `Struct.new`
 * returns the members' anonymous class, which `class X < Struct.new(...)`
 * inherits from; each member is read off the instance by name.
 *
 * @noRailsEquivalent PERMANENT
 */
export const Struct = {
  /**
   * `rb_struct_s_def` (`vendor/ruby/v3.3.11/struct.c:643`).
   *
   * @noRailsEquivalent PERMANENT
   */
  new(...memberNames: string[]): new (...values: unknown[]) => StructInstance {
    const klass = class {
      /** `rb_struct_initialize_m` (`vendor/ruby/v3.3.11/struct.c:742`). */
      constructor(...values: unknown[]) {
        if (memberNames.length < values.length) throw new ArgumentError("struct size differs");
        memberNames.forEach((member, i) => {
          (this as Record<string, unknown>)[member] = values[i] ?? null;
        });
      }

      /**
       * `rb_struct_members_m` (`vendor/ruby/v3.3.11/struct.c:227`).
       *
       * @noRailsEquivalent PERMANENT
       */
      members(): string[] {
        return [...memberNames];
      }

      /**
       * `rb_struct_init_copy` (`vendor/ruby/v3.3.11/struct.c:1123`), whose
       * `OBJ_INIT_COPY` is `rb_obj_init_copy` (`vendor/ruby/v3.3.11/object.c:634`).
       *
       * @noRailsEquivalent PERMANENT
       */
      initializeCopy(s: StructInstance): this {
        if (this === s) return this;
        if (Object.isFrozen(this)) {
          throw new FrozenError(`can't modify frozen ${rbObjClass(this)}: ${rbInspect(this)}`, {
            receiver: this,
          });
        }
        if (this.constructor !== s.constructor) {
          throw new TypeError("initialize_copy should take same class object");
        }
        if (this.members().length !== s.members().length) {
          throw new TypeError("struct size mismatch");
        }
        const values = structValues(s);
        memberNames.forEach((member, i) => {
          (this as Record<string, unknown>)[member] = values[i];
        });
        return this;
      }

      /**
       * `rb_struct_equal` (`vendor/ruby/v3.3.11/struct.c:1400`).
       *
       * @noRailsEquivalent PERMANENT
       */
      equals(other: unknown): boolean {
        if (this === other) return true;
        if (!isStruct(other)) return false;
        if (this.constructor !== other.constructor) return false;
        return rbExecRecursivePaired(recursiveEqual, this, other);
      }

      /**
       * `rb_struct_eql` (`vendor/ruby/v3.3.11/struct.c:1481`).
       *
       * @noRailsEquivalent PERMANENT
       */
      eql(other: unknown): boolean {
        if (this === other) return true;
        if (!isStruct(other)) return false;
        if (this.constructor !== other.constructor) return false;
        return rbExecRecursivePaired(recursiveEql, this, other);
      }

      /**
       * `rb_struct_hash` (`vendor/ruby/v3.3.11/struct.c:1432`).
       *
       * @noRailsEquivalent PERMANENT
       */
      hash(): number {
        return rbHash([this.constructor, ...structValues(this)]);
      }
    };
    structClasses.add(klass.prototype);
    return klass;
  },
};
