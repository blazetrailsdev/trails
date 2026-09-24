import { deduplicate } from "./deduplicable.js";
import { rbHash } from "@blazetrails/ruby-compat";
import type { Deduplicable } from "./deduplicable.js";

export class SqlTypeMetadata implements Deduplicable {
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

  deduplicate(): this {
    return deduplicate(this);
  }

  /** @internal */
  deduplicated(): this {
    return Object.freeze(this);
  }
}
