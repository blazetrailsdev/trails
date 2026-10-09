import { Deduplicable } from "./deduplicable.js";
import type { ClassMethods } from "./deduplicable.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";
import { humanize } from "@blazetrails/activesupport";
import {
  Encoding,
  include,
  type Included,
  rbHash,
  registerConstant,
  strUminus,
} from "@blazetrails/ruby-compat";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Deduplicable` (`column.rb:8`); the class/interface merge is how a mixin surfaces on the type side.
export interface Column extends Included<typeof Deduplicable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface above.
export class Column {
  declare static registry: typeof ClassMethods.registry;
  declare static new: typeof ClassMethods.new;

  name: string;
  sqlTypeMetadata: SqlTypeMetadata | null;
  null: boolean;
  default: unknown;
  defaultFunction: string | null;
  collation: string | null;
  comment: string | null;

  get precision(): number | null {
    return this.sqlTypeMetadata?.precision ?? null;
  }

  get scale(): number | null {
    return this.sqlTypeMetadata?.scale ?? null;
  }

  get limit(): number | null {
    return this.sqlTypeMetadata?.limit ?? null;
  }

  get type(): string | null {
    return this.sqlTypeMetadata?.type ?? null;
  }

  get sqlType(): string | null {
    return this.sqlTypeMetadata?.sqlType ?? null;
  }

  constructor(
    name: string,
    defaultValue: unknown,
    sqlTypeMetadata: SqlTypeMetadata | null = null,
    null_: boolean = true,
    defaultFunction: string | null = null,
    options: {
      collation?: string | null;
      comment?: string | null;
    } = {},
  ) {
    this.name = name;
    this.default = defaultValue;
    this.sqlTypeMetadata = sqlTypeMetadata;
    this.null = null_;
    this.defaultFunction = defaultFunction;
    this.collation = options.collation ?? null;
    this.comment = options.comment ?? null;
  }

  get hasDefault(): boolean {
    return this.default != null || this.defaultFunction !== null;
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

  eql(other: unknown): boolean {
    return this.equals(other);
  }

  hash(): number {
    return (
      rbHash(Column) ^
      rbHash(this.name) ^
      rbHash(Encoding.UTF_8) ^
      rbHash(this.default) ^
      rbHash(this.sqlTypeMetadata) ^
      rbHash(this.null) ^
      rbHash(this.defaultFunction) ^
      rbHash(this.collation) ^
      rbHash(this.comment)
    );
  }

  isVirtual(): boolean {
    return false;
  }

  /** @internal */
  deduplicated(): this {
    this.name = strUminus(this.name);
    if (this.sqlTypeMetadata) this.sqlTypeMetadata = this.sqlTypeMetadata.deduplicate();
    if (this.default != null && this.default !== false) {
      this.default = strUminus(this.default as string);
    }
    if (this.defaultFunction != null) this.defaultFunction = strUminus(this.defaultFunction);
    if (this.collation != null) this.collation = strUminus(this.collation);
    if (this.comment != null) this.comment = strUminus(this.comment);
    return Deduplicable.instanceMethod("deduplicated")!.value.call(this);
  }

  initWith(coder: ColumnCoder): void {
    this.name = coder["name"] as string;
    this.sqlTypeMetadata = (coder["sql_type_metadata"] as SqlTypeMetadata | null) ?? null;
    this.null = coder["null"] as boolean;
    this.default = coder["default"];
    this.defaultFunction = (coder["default_function"] as string | null) ?? null;
    this.collation = (coder["collation"] as string | null) ?? null;
    this.comment = (coder["comment"] as string | null) ?? null;
  }

  encodeWith(coder: ColumnCoder): void {
    coder["name"] = this.name;
    coder["sql_type_metadata"] = this.sqlTypeMetadata;
    coder["null"] = this.null;
    coder["default"] = this.default;
    coder["default_function"] = this.defaultFunction;
    coder["collation"] = this.collation;
    coder["comment"] = this.comment;
  }
}

include(Column, Deduplicable);

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

registerConstant("ActiveRecord::ConnectionAdapters::Column", Column);
registerConstant("ActiveRecord::ConnectionAdapters::NullColumn", NullColumn);
