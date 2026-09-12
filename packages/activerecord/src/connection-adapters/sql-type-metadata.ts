import { deduplicate } from "./deduplicable.js";
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

  /** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
  deduplicateKey(): string {
    return JSON.stringify(this.toJSON());
  }

  /** @noRailsEquivalent CONVERGEABLE converge-pool-and-cache-moved-residue */
  toJSON(): SqlTypeMetadataJSON {
    return {
      sqlType: this.sqlType,
      type: this.type,
      limit: this.limit,
      precision: this.precision,
      scale: this.scale,
    };
  }

  /** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
  static fromJSON(data: SqlTypeMetadataJSON): SqlTypeMetadata {
    const klass = TYPE_METADATA_CLASSES[data.class ?? ""];
    if (klass) return klass.fromJSON(data);
    return new SqlTypeMetadata({
      sqlType: data.sqlType,
      type: data.type,
      limit: data.limit,
      precision: data.precision,
      scale: data.scale,
    });
  }

  deduplicate(): this {
    return deduplicate(this);
  }

  /** @internal */
  deduplicated(): this {
    return Object.freeze(this);
  }
}

export interface SqlTypeMetadataJSON {
  class?: string;
  sqlType: string | null;
  type: string | undefined;
  limit: number | null;
  precision: number | null;
  scale: number | null;
}

const TYPE_METADATA_CLASSES: Record<
  string,
  { fromJSON(data: SqlTypeMetadataJSON): SqlTypeMetadata }
> = {};

/** @noRailsEquivalent PERMANENT */
export function registerTypeMetadataClass(
  name: string,
  klass: { fromJSON(data: SqlTypeMetadataJSON): SqlTypeMetadata },
): void {
  TYPE_METADATA_CLASSES[name] = klass;
}
