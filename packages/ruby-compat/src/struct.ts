import { ArgumentError } from "./argument-error.js";
import { FrozenError } from "./frozen-error.js";
import { rbInspect, rbObjClassname } from "./object.js";
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
  toH(block?: (k: string, v: unknown) => [unknown, unknown]): Record<string, unknown>;
}

const RSTRUCT = Symbol("RSTRUCT");

const structClasses = new WeakSet<object>();

function isStruct(value: unknown): value is StructInstance & object {
  if (typeof value !== "object" || value === null) return false;
  for (let proto = Object.getPrototypeOf(value); proto; proto = Object.getPrototypeOf(proto)) {
    if (structClasses.has(proto)) return true;
  }
  return false;
}

function structValues(s: StructInstance): unknown[] {
  return [...(s as unknown as { [RSTRUCT]: unknown[] })[RSTRUCT]];
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
 * inherits from. The values live in the instance's `RSTRUCT` slot and each
 * member is an accessor over it on the anonymous class, so a subclass reader
 * of the same name reaches the raw slot as `super.member`.
 *
 * @noRailsEquivalent PERMANENT
 */
export const Struct = {
  /**
   * `rb_struct_s_def` (`vendor/ruby/v3.3.11/struct.c:643`).
   *
   * @noRailsEquivalent PERMANENT
   */
  new<M extends string>(
    ...memberNames: M[]
  ): new (...values: unknown[]) => StructInstance & Record<M, unknown> {
    const klass = class {
      [RSTRUCT]: unknown[];

      /** `rb_struct_initialize_m` (`vendor/ruby/v3.3.11/struct.c:742`). */
      constructor(...values: unknown[]) {
        if (memberNames.length < values.length) throw new ArgumentError("struct size differs");
        this[RSTRUCT] = memberNames.map((_member, i) => values[i] ?? null);
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
          throw new FrozenError(`can't modify frozen ${rbObjClassname(this)}: ${rbInspect(this)}`, {
            receiver: this,
          });
        }
        if (this.constructor !== s.constructor) {
          throw new TypeError("initialize_copy should take same class object");
        }
        if (this.members().length !== s.members().length) {
          throw new TypeError("struct size mismatch");
        }
        this[RSTRUCT] = structValues(s);
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

      /**
       * `rb_struct_to_h` (`vendor/ruby/v3.3.11/struct.c:1057`).
       *
       * @noRailsEquivalent PERMANENT
       */
      toH(block?: (k: string, v: unknown) => [unknown, unknown]): Record<string, unknown> {
        const h: Record<string, unknown> = {};
        const members = this.members();
        for (let i = 0; i < this[RSTRUCT].length; i++) {
          const k = members[i];
          const v = this[RSTRUCT][i];
          if (block) {
            const pair = block(k, v);
            h[pair[0] as string] = pair[1];
          } else {
            h[k] = v;
          }
        }
        return h;
      }
    };
    memberNames.forEach((member, i) => {
      Object.defineProperty(klass.prototype, member, {
        /** `define_aref_method` (`vendor/ruby/v3.3.11/struct.c:283`). */
        get(this: InstanceType<typeof klass>) {
          return this[RSTRUCT][i];
        },
        /** `define_aset_method` (`vendor/ruby/v3.3.11/struct.c:289`), behind `rb_struct_modify` (`:246`). */
        set(this: InstanceType<typeof klass>, val: unknown) {
          if (Object.isFrozen(this)) {
            throw new FrozenError(
              `can't modify frozen ${rbObjClassname(this)}: ${rbInspect(this)}`,
              { receiver: this },
            );
          }
          this[RSTRUCT][i] = val;
        },
        configurable: true,
      });
    });
    structClasses.add(klass.prototype);
    return klass as unknown as new (...values: unknown[]) => StructInstance & Record<M, unknown>;
  },
};
