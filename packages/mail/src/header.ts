import {
  type Encoding,
  ArgumentError,
  Enumerable,
  type Hash,
  include,
  type Included,
  NoMethodError,
  rbInspect,
  rbObjAsString,
  rbObjDup,
  stringSplit,
  warn,
  binaryBytes,
  binaryString,
} from "@blazetrails/ruby-compat";
import * as Constants from "./constants.js";
import { Field } from "./field.js";
import { FieldList } from "./field-list.js";
import { Utilities } from "./utilities.js";

type ContentTypeParameters = Hash<string, string | Encoding>;
type HasParameters = { parameters(): ContentTypeParameters | null };

let maximumAmount = 1000;

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export class Header {
  static get maximumAmount(): number {
    return maximumAmount;
  }

  static set maximumAmount(value: number) {
    maximumAmount = value;
  }

  /** @internal */
  private _rawSource: string | Uint8Array;
  /** @internal */
  private _charset: string | Encoding | null;
  /** @internal */
  private _fields: FieldList | null = null;

  constructor(
    headerText: string | Uint8Array | null = null,
    charset: string | Encoding | null = null,
  ) {
    this._charset = charset;
    const crlf = Utilities.toCrlf(headerText as string | Uint8Array);
    const binary = crlf instanceof Uint8Array;
    const lstripped = (binary ? binaryString(crlf) : crlf).replace(/^[\0\t\n\v\f\r ]+/, "");
    this._rawSource = binary ? binaryBytes(lstripped) : lstripped;
    if (headerText != null) this.splitHeader();
  }

  get rawSource(): string | Uint8Array {
    return this._rawSource;
  }

  initializeCopy(_original: Header): this {
    const fields = rbObjDup(this._fields!);
    fields.forEach((field, index) => (fields[index] = rbObjDup(field)));
    this._fields = fields;
    return this;
  }

  get fields(): FieldList {
    return (this._fields ??= new FieldList());
  }

  set fields(unfoldedFields: (string | Uint8Array)[]) {
    this._fields = new FieldList();

    if (unfoldedFields.length > (this.constructor as typeof Header).maximumAmount) {
      warn(
        `WARNING: More than ${(this.constructor as typeof Header).maximumAmount} header fields; only using the first ${(this.constructor as typeof Header).maximumAmount} and ignoring the rest`,
      );
      unfoldedFields = unfoldedFields.slice(0, (this.constructor as typeof Header).maximumAmount);
    }

    for (let field of unfoldedFields as (string | Uint8Array | Field | null)[]) {
      field = Field.parse(field as string | Uint8Array, this.charset);
      if (field != null) {
        this._fields.addField(field);
      }
    }
  }

  errors(): unknown[] {
    return this._fields!.map((field) => field.errors).flat();
  }

  get(name: unknown): Field | Field[] | null {
    return this.fields.getField(Utilities.dasherize(name));
  }

  set(name: unknown, value: unknown): void {
    name = rbObjAsString(name);
    if ((name as string).includes(Constants.COLON)) {
      throw new ArgumentError(`Header names may not contain a colon: ${rbInspect(name)}`);
    }

    name = Utilities.dasherize(name);

    if (value == null) {
      this.fields.deleteField(name);
    } else {
      this.fields.addField(new Field(rbObjAsString(name), value, this.charset));

      if (name === "content-type") {
        let params: ContentTypeParameters | null;
        try {
          params = (this.get("content_type") as unknown as HasParameters).parameters();
        } catch {
          params = null;
        }
        const charset = params?.get("charset");
        if (params != null && charset != null) this._charset = charset;
      }
    }
  }

  get charset(): string | Encoding | null {
    return this._charset;
  }

  set charset(val: string | Encoding | null) {
    let params: ContentTypeParameters | null;
    try {
      params = (this.get("content_type") as unknown as HasParameters).parameters();
    } catch {
      params = null;
    }
    if (params != null) {
      if (val != null) {
        params.set("charset", val);
      } else {
        params.delete("charset");
      }
    }
    this._charset = val;
  }

  encoded(): string {
    let buffer = "";
    for (const field of this.fields) {
      buffer += field.encoded();
    }
    return buffer;
  }

  toString(): string {
    return this.encoded();
  }

  decoded(): never {
    throw new NoMethodError(
      "Can not decode an entire header as there could be character set conflicts. Try calling #decoded on the various fields.",
    );
  }

  fieldSummary(): string {
    return this.fields.summary();
  }

  hasMessageId(): boolean {
    return this.fields.isHasField("Message-ID");
  }

  hasContentId(): boolean {
    return this.fields.isHasField("Content-ID");
  }

  hasDate(): boolean {
    return this.fields.isHasField("Date");
  }

  hasMimeVersion(): boolean {
    return this.fields.isHasField("Mime-Version");
  }

  /** @internal */
  private splitHeader(): void {
    const raw = this._rawSource;
    if (raw instanceof Uint8Array) {
      this.fields = stringSplit(binaryString(raw), Constants.HEADER_SPLIT).map(binaryBytes);
    } else {
      this.fields = stringSplit(raw, Constants.HEADER_SPLIT);
    }
  }

  /** @internal */
  private each(block: (field: Field) => void): void {
    this.fields.forEach((field) => block(field));
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export interface Header extends Included<typeof Enumerable> {
  find(block: (field: Field) => unknown): Field | null;
}
include(Header, Enumerable);
