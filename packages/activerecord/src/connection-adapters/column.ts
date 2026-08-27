import { deduplicate } from "./deduplicable.js";
import type { Deduplicable } from "./deduplicable.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";
import type { SqlTypeMetadataJSON } from "./sql-type-metadata.js";
import { humanize } from "@blazetrails/activesupport";

export class Column implements Deduplicable {
  name: string;
  sqlTypeMetadata: SqlTypeMetadata | null;
  null: boolean;
  default: unknown;
  defaultFunction: string | null;
  collation: string | null;
  comment: string | null;

  constructor(
    name: string,
    defaultValue: unknown,
    sqlTypeMetadata: SqlTypeMetadata | null = null,
    null_: boolean = true,
    options: {
      defaultFunction?: string | null;
      collation?: string | null;
      comment?: string | null;
    } = {},
  ) {
    this.name = name;
    this.default = defaultValue;
    this.sqlTypeMetadata = sqlTypeMetadata;
    this.null = null_;
    this.defaultFunction = options.defaultFunction ?? null;
    this.collation = options.collation ?? null;
    this.comment = options.comment ?? null;
  }

  get sqlType(): string | null {
    return this.sqlTypeMetadata?.sqlType ?? null;
  }

  get type(): string | null {
    return this.sqlTypeMetadata?.type ?? null;
  }

  get baseType(): string | null {
    return this.sqlTypeMetadata?.type ?? null;
  }

  get limit(): number | null {
    return this.sqlTypeMetadata?.limit ?? null;
  }

  get precision(): number | null {
    return this.sqlTypeMetadata?.precision ?? null;
  }

  get scale(): number | null {
    return this.sqlTypeMetadata?.scale ?? null;
  }

  get hasDefault(): boolean {
    return this.default != null || this.defaultFunction !== null;
  }

  get isNullable(): boolean {
    return this.null;
  }

  isBigint(): boolean {
    return this.sqlType != null && /^bigint\b/i.test(this.sqlType);
  }

  humanName(): string {
    return humanize(this.name);
  }

  isAutoIncrementedByDb(): boolean {
    return false;
  }

  isAutoPopulated(): boolean {
    return this.isAutoIncrementedByDb() || this.defaultFunction !== null;
  }

  equals(other: unknown): boolean {
    return (
      other instanceof Column &&
      this.name === other.name &&
      (this.default ?? null) === (other.default ?? null) &&
      metadataEquals(this.sqlTypeMetadata, other.sqlTypeMetadata) &&
      this.null === other.null &&
      this.defaultFunction === other.defaultFunction &&
      this.collation === other.collation &&
      this.comment === other.comment
    );
  }

  isVirtual(): boolean {
    return false;
  }

  initWith(coder: ColumnCoder): void {
    this.name = coder["name"] as string;
    this.sqlTypeMetadata = coder["sql_type_metadata"]
      ? SqlTypeMetadata.fromJSON(coder["sql_type_metadata"] as SqlTypeMetadataJSON)
      : null;
    this.null = coder["null"] as boolean;
    this.default = coder["default"];
    this.defaultFunction = (coder["default_function"] as string | null) ?? null;
    this.collation = (coder["collation"] as string | null) ?? null;
    this.comment = (coder["comment"] as string | null) ?? null;
  }

  encodeWith(coder: ColumnCoder): void {
    coder["class"] = "Column";
    coder["name"] = this.name;
    coder["sql_type_metadata"] = this.sqlTypeMetadata?.toJSON() ?? null;
    coder["null"] = this.null;
    coder["default"] = this.default;
    coder["default_function"] = this.defaultFunction;
    coder["collation"] = this.collation;
    coder["comment"] = this.comment;
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  deduplicateKey(): string {
    return JSON.stringify([
      this.name,
      this.default ?? null,
      this.sqlTypeMetadata?.deduplicateKey() ?? null,
      this.null,
      this.defaultFunction,
      this.collation,
      this.comment,
    ]);
  }

  deduplicate(): this {
    return deduplicate(this);
  }

  /** @internal */
  deduplicated(): this {
    if (this.sqlTypeMetadata) {
      this.sqlTypeMetadata = this.sqlTypeMetadata.deduplicate();
    }
    return Object.freeze(this);
  }

  toString(): string {
    return this.name;
  }
}

/** @internal */
function metadataEquals(a: SqlTypeMetadata | null, b: SqlTypeMetadata | null): boolean {
  if (a === null || b === null) return a === b;
  return a.equals(b);
}

export type ColumnCoder = Record<string, unknown>;

export class NullColumn extends Column {
  constructor(name: string) {
    super(name, null);
  }
}
