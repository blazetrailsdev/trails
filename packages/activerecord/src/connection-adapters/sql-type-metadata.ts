import { Deduplicable } from "./deduplicable.js";
import type { ClassMethods } from "./deduplicable.js";
import {
  include,
  type Included,
  rbHash,
  registerConstant,
  strUminus,
} from "@blazetrails/ruby-compat";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Deduplicable` (`sql_type_metadata.rb:7`); the class/interface merge is how a mixin surfaces on the type side.
export interface SqlTypeMetadata extends Included<typeof Deduplicable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class SqlTypeMetadata {
  declare static registry: typeof ClassMethods.registry;
  declare static new: typeof ClassMethods.new;

  sqlType: string | null;
  readonly type: string | undefined;
  readonly limit: number | null;
  readonly precision: number | null;
  readonly scale: number | null;

  constructor(
    options: {
      sqlType?: string | null;
      type?: string;
      limit?: number | null;
      precision?: number | null;
      scale?: number | null;
    } = {},
  ) {
    this.sqlType = options.sqlType ?? null;
    this.type = options.type ?? undefined;
    this.limit = options.limit ?? null;
    this.precision = options.precision ?? null;
    this.scale = options.scale ?? null;
  }

  equals(other: unknown): boolean {
    return (
      other instanceof SqlTypeMetadata &&
      this.sqlType === other.sqlType &&
      this.type === other.type &&
      this.limit === other.limit &&
      this.precision === other.precision &&
      this.scale === other.scale
    );
  }

  eql(other: unknown): boolean {
    return this.equals(other);
  }

  hash(): number {
    return (
      rbHash(SqlTypeMetadata) ^
      rbHash(this.sqlType) ^
      rbHash(this.type) ^
      rbHash(this.limit) ^
      (rbHash(this.precision) >> 1) ^
      (rbHash(this.scale) >> 2)
    );
  }

  /** @internal */
  deduplicated(): this {
    this.sqlType = strUminus(this.sqlType!);
    return Deduplicable.instanceMethod("deduplicated")!.value.call(this);
  }
}

include(SqlTypeMetadata, Deduplicable);

registerConstant("ActiveRecord::ConnectionAdapters::SqlTypeMetadata", SqlTypeMetadata);
