import { Column as BaseColumn } from "../column.js";
import type { ColumnCoder } from "../column.js";
import { TypeMetadata } from "./type-metadata.js";
import { isPresent } from "@blazetrails/activesupport";

export class Column extends BaseColumn {
  private _serial: boolean;
  private _identity: string | null;
  private _generated: string | null;

  constructor(
    name: string,
    defaultValue: unknown,
    sqlTypeMetadata: TypeMetadata | null = null,
    null_: boolean = true,
    options: {
      collation?: string | null;
      defaultFunction?: string | null;
      comment?: string | null;
      serial?: boolean;
      identity?: string | null;
      generated?: string | null;
    } = {},
  ) {
    super(name, defaultValue, sqlTypeMetadata, null_, {
      collation: options.collation,
      defaultFunction: options.defaultFunction,
      comment: options.comment,
    });
    this._serial = options.serial ?? false;
    this._identity = options.identity ?? null;
    this._generated = options.generated ?? null;
  }

  get oid(): number | null {
    return (this.sqlTypeMetadata as TypeMetadata | null)?.oid ?? null;
  }

  get fmod(): number | null {
    return (this.sqlTypeMetadata as TypeMetadata | null)?.fmod ?? null;
  }

  override get sqlType(): string | null {
    const raw = super.sqlType;
    return raw?.endsWith("[]") ? raw.slice(0, -2) : (raw ?? null);
  }

  override get type(): string | null {
    return super.type;
  }

  get isSerial(): boolean {
    return this._serial;
  }

  get isIdentity(): boolean {
    return this._identity != null;
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  override deduplicateKey(): string {
    return JSON.stringify([super.deduplicateKey(), this.isIdentity, this.isSerial]);
  }

  override isAutoIncrementedByDb(): boolean {
    return this.isSerial || this.isIdentity;
  }

  override isVirtual(): boolean {
    return isPresent(this._generated);
  }

  override get hasDefault(): boolean {
    return super.hasDefault && !this.isVirtual();
  }

  get array(): boolean {
    return this.sqlTypeMetadata?.sqlType?.endsWith("[]") ?? false;
  }

  isArray(): boolean {
    return this.array;
  }

  get isEnum(): boolean {
    return this.sqlTypeMetadata?.type === "enum";
  }

  override equals(other: unknown): boolean {
    return (
      other instanceof Column &&
      super.equals(other) &&
      this.isIdentity === other.isIdentity &&
      this.isSerial === other.isSerial
    );
  }

  override initWith(coder: ColumnCoder): void {
    this._serial = (coder["serial"] as boolean) ?? false;
    this._identity = (coder["identity"] as string | null) ?? null;
    this._generated = (coder["generated"] as string | null) ?? null;
    super.initWith(coder);
  }

  override encodeWith(coder: ColumnCoder): void {
    coder["serial"] = this._serial;
    coder["identity"] = this._identity;
    coder["generated"] = this._generated;
    super.encodeWith(coder);
    coder["class"] = "PostgreSQL::Column";
  }
}
