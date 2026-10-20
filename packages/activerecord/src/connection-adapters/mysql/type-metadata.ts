import {
  DelegateClass,
  include,
  type Included,
  rbEqual,
  rbHash,
  registerConstant,
  strUminus,
} from "@blazetrails/ruby-compat";
import { Deduplicable } from "../deduplicable.js";
import type { ClassMethods } from "../deduplicable.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Deduplicable` (`mysql/type_metadata.rb:9`); the class/interface merge is how a mixin surfaces on the type side.
export interface TypeMetadata extends Included<typeof Deduplicable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class TypeMetadata extends DelegateClass(SqlTypeMetadata) {
  declare static registry: typeof ClassMethods.registry;

  extra: string | null;

  /**
   * @inlinedFrom ActiveRecord::ConnectionAdapters::Deduplicable::ClassMethods#new rails/v8.0.2/activerecord/lib/active_record/connection_adapters/deduplicable.rb:13-15
   * @inventedArm if — CONVERGEABLE deduplicable-new-runs-after-the-most-derived-constructor
   */
  constructor(typeMetadata: SqlTypeMetadata, options: { extra?: string | null } = {}) {
    super(typeMetadata);
    this.extra = options.extra ?? null;
    if (new.target === TypeMetadata) return this.deduplicate();
  }

  equals(other: unknown): boolean {
    return (
      other instanceof TypeMetadata &&
      rbEqual(this.__getobj__(), other.__getobj__()) &&
      this.extra === other.extra
    );
  }

  eql(other: unknown): boolean {
    return this.equals(other);
  }

  hash(): number {
    return rbHash(TypeMetadata) ^ rbHash(this.__getobj__()) ^ rbHash(this.extra);
  }

  /** @internal */
  deduplicated(): this {
    this.__setobj__(this.__getobj__().deduplicate());
    if (this.extra != null) this.extra = strUminus(this.extra);
    return Object.freeze(this);
  }
}

include(TypeMetadata, Deduplicable);

registerConstant("ActiveRecord::ConnectionAdapters::MySQL::TypeMetadata", TypeMetadata);
