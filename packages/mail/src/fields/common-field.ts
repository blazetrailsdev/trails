import { rbObjAsString, casecmp, type Encoding } from "@blazetrails/ruby-compat";

const FILENAME_RE = /\b(filename|name)=([^;"\r\n]+[ \t\r\n\f\v][^;"\r\n]+)/;

export class CommonField {
  static isSingular(): boolean {
    return false;
  }

  static parse<T extends new (...args: never[]) => CommonField>(
    this: T,
    ...args: ConstructorParameters<T>
  ): InstanceType<T> {
    const field = new this(...args);
    field.parse();
    return field as InstanceType<T>;
  }

  name: unknown;
  charset: string | Encoding;
  readonly errors: unknown[];
  /** @internal */
  protected _value!: string | unknown[];
  /** @internal */
  protected _element: unknown;

  constructor(
    name: unknown = null,
    value: unknown = null,
    charset: string | Encoding | null = null,
  ) {
    this.errors = [];

    this.name = name;
    this.value = value;
    this.charset = charset != null ? charset : "utf-8";
  }

  isSingular(): boolean {
    return (this.constructor as typeof CommonField).isSingular();
  }

  get value(): string | unknown[] {
    return this._value;
  }

  set value(value: unknown) {
    this._element = null;
    this._value = Array.isArray(value) ? value : rbObjAsString(value);
    this.parse();
  }

  parse(): this {
    this.element();
    return this;
  }

  element(): unknown {
    return null;
  }

  toString(): string {
    return rbObjAsString(this.decoded());
  }

  default(): unknown {
    return this.decoded();
  }

  decoded(): unknown {
    return (this as unknown as { doDecode(): unknown }).doDecode();
  }

  encoded(): string {
    return (this as unknown as { doEncode(): string }).doEncode();
  }

  /** @missingRailsArgs casecmp — PERMANENT */
  isResponsibleFor(fieldName: unknown): boolean {
    return casecmp(rbObjAsString(this.name), rbObjAsString(fieldName)) === 0;
  }

  /** @internal */
  protected ensureFilenameQuoted(value: unknown): unknown {
    if (typeof value === "string") {
      return value.replace(FILENAME_RE, '$1="$2"');
    } else {
      return value;
    }
  }
}
