import { Deduplicable } from "./deduplicable.js";
import type { ClassMethods, deduplicate } from "./deduplicable.js";
import { include, rbHash } from "@blazetrails/ruby-compat";

export class SqlTypeMetadata {
  declare static registry: typeof ClassMethods.registry;
  declare static new: typeof ClassMethods.new;
  declare deduplicate: typeof deduplicate;
  declare negate: typeof deduplicate;

  readonly sqlType: string | null;
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
    return Deduplicable.instanceMethod("deduplicated")!.value.call(this);
  }
}

include(SqlTypeMetadata, Deduplicable);
