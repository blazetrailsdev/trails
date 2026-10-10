import {
  DelegateClass,
  include,
  type Included,
  rbEqual,
  rbHash,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { Deduplicable } from "../deduplicable.js";
import type { ClassMethods } from "../deduplicable.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Deduplicable` (`postgresql/type_metadata.rb:10`); the class/interface merge is how a mixin surfaces on the type side.
export interface TypeMetadata extends Included<typeof Deduplicable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class TypeMetadata extends DelegateClass(SqlTypeMetadata) {
  declare static registry: typeof ClassMethods.registry;
  declare static new: typeof ClassMethods.new;

  readonly oid: number | null;
  readonly fmod: number | null;

  constructor(
    typeMetadata: SqlTypeMetadata,
    options: { oid?: number | null; fmod?: number | null } = {},
  ) {
    super(typeMetadata);
    this.oid = options.oid ?? null;
    this.fmod = options.fmod ?? null;
  }

  equals(other: unknown): boolean {
    return (
      other instanceof TypeMetadata &&
      rbEqual(this.__getobj__(), other.__getobj__()) &&
      this.oid === other.oid &&
      this.fmod === other.fmod
    );
  }

  eql(other: unknown): boolean {
    return this.equals(other);
  }

  hash(): number {
    return rbHash(TypeMetadata) ^ rbHash(this.__getobj__()) ^ rbHash(this.oid) ^ rbHash(this.fmod);
  }

  /** @internal */
  deduplicated(): this {
    this.__setobj__(this.__getobj__().deduplicate());
    return Deduplicable.instanceMethod("deduplicated")!.value.call(this);
  }
}

include(TypeMetadata, Deduplicable);

registerConstant("ActiveRecord::ConnectionAdapters::PostgreSQL::TypeMetadata", TypeMetadata);
