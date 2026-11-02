import {
  ArgumentError,
  byteslice,
  cmp,
  type Comparable,
  Encoding,
  forceEncoding,
  Range,
  rbFSend,
  rbInspect,
  rbObjAsString,
  rbObjDup,
  rbObjId,
  rbObjInstanceVariables,
  rbObjRespondTo,
  rstrip,
  StandardError,
  strip,
  warn,
} from "@blazetrails/ruby-compat";
import * as Constants from "./constants.js";
import type { CommonField } from "./fields/common-field.js";
import { Mail } from "./mail.js";
import { Utilities } from "./utilities.js";

type FieldClass = { NAME: string; isSingular(): boolean; parse(...args: unknown[]): CommonField };

const STRUCTURED_FIELDS =
  "bcc cc content-description content-disposition content-id content-location content-transfer-encoding content-type date from in-reply-to keywords message-id mime-version received references reply-to resent-bcc resent-cc resent-date resent-from resent-message-id resent-sender resent-to return-path sender to".split(
    " ",
  );

const FIELD_ORDER_LOOKUP: Record<string, number> = Object.assign(
  Object.create(null) as Record<string, number>,
  Object.fromEntries(
    "return-path received resent-date resent-from resent-sender resent-to resent-cc resent-bcc resent-message-id date from sender reply-to to cc bcc message-id in-reply-to references subject comments keywords mime-version content-type content-transfer-encoding content-location content-disposition content-description"
      .split(" ")
      .map((name, index) => [name, index]),
  ),
);

let _fieldsMap: Record<string, FieldClass> | undefined;
let _fieldNameMap: Record<string, string> | undefined;

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export class Field implements Comparable {
  static readonly STRUCTURED_FIELDS = STRUCTURED_FIELDS;

  static readonly KNOWN_FIELDS = [...STRUCTURED_FIELDS, "comments", "subject"];

  static get FIELDS_MAP(): Record<string, FieldClass> {
    return (_fieldsMap ??= {
      __proto__: null,
      to: Mail.ToField,
      cc: Mail.CcField,
      bcc: Mail.BccField,
      "message-id": Mail.MessageIdField,
      "in-reply-to": Mail.InReplyToField,
      references: Mail.ReferencesField,
      subject: Mail.SubjectField,
      comments: Mail.CommentsField,
      keywords: Mail.KeywordsField,
      date: Mail.DateField,
      from: Mail.FromField,
      sender: Mail.SenderField,
      "reply-to": Mail.ReplyToField,
      "resent-date": Mail.ResentDateField,
      "resent-from": Mail.ResentFromField,
      "resent-sender": Mail.ResentSenderField,
      "resent-to": Mail.ResentToField,
      "resent-cc": Mail.ResentCcField,
      "resent-bcc": Mail.ResentBccField,
      "resent-message-id": Mail.ResentMessageIdField,
      "return-path": Mail.ReturnPathField,
      received: Mail.ReceivedField,
      "mime-version": Mail.MimeVersionField,
      "content-transfer-encoding": Mail.ContentTransferEncodingField,
      "content-description": Mail.ContentDescriptionField,
      "content-location": Mail.ContentLocationField,
    } as unknown as Record<string, FieldClass>);
  }

  static get FIELD_NAME_MAP(): Record<string, string> {
    if (_fieldNameMap == null) {
      _fieldNameMap = Object.create(null) as Record<string, string>;
      for (const [field, fieldKlass] of Object.entries(Field.FIELDS_MAP)) {
        _fieldNameMap[field] = fieldKlass.NAME;
      }
    }
    return _fieldNameMap;
  }

  static FieldError = class FieldError extends StandardError {};

  static ParseError = class ParseError extends Field.FieldError {
    element: unknown;
    value: unknown;
    reason: unknown;

    constructor(element: unknown, value: unknown, reason: unknown) {
      const value_ = new.target.prototype.toUtf8(value);
      const reason_ = new.target.prototype.toUtf8(reason);
      const [elementS, valueS, reasonS] = [element, value_, reason_].map((x) => {
        const str: unknown = rbObjAsString(x);
        return str instanceof Uint8Array ? new TextDecoder().decode(str) : str;
      });
      super(`${elementS} can not parse |${valueS}|: ${reasonS}`);
      this.element = element;
      this.value = value_;
      this.reason = reason_;
    }

    /** @internal */
    toUtf8(text: unknown): unknown {
      if (text instanceof Uint8Array || typeof text === "string") {
        return forceEncoding(rbObjDup(text), Encoding.UTF_8);
      } else {
        return text;
      }
    }
  };

  static NilParseError = class NilParseError extends Field.ParseError {
    constructor(element: unknown) {
      super(element, null, "nil is invalid");
    }
  };

  static IncompleteParseError = class IncompleteParseError extends Field.ParseError {
    constructor(element: unknown, originalText: Uint8Array, unparsedIndex: number) {
      const parsedText = forceEncoding(
        byteslice(originalText, new Range(0, unparsedIndex, true))!,
        Encoding.UTF_8,
      );
      super(element, originalText, `Only able to parse up to ${rbInspect(parsedText)}`);
    }
  };

  static SyntaxError = class SyntaxError extends Field.FieldError {};

  static parse(field: string, charset: unknown = "utf-8"): Field | null {
    const split = Field.split(field);
    const [name, value] = Array.isArray(split) ? split : [split, null];
    if (name != null && value != null) {
      return new this(name, value, charset);
    }
    return null;
  }

  /** @internal */
  static split(rawField: string): [string, string] | string | null {
    try {
      const index = rawField.indexOf(Constants.COLON);
      if (index !== -1) {
        const name = rstrip(rawField.slice(0, index));
        const value = rawField.slice(index + 1);
        if (new RegExp(`^${Constants.FIELD_NAME.source}$`).test(name)) {
          return [rstrip(name), strip(value)];
        } else {
          warn(
            `WARNING: Ignoring unparsable header ${rbInspect(rawField)}: invalid header name syntax: ${rbInspect(name)}`,
          );
          return null;
        }
      } else {
        return strip(rawField);
      }
    } catch (error) {
      const e = error as Error;
      warn(
        `WARNING: Ignoring unparsable header ${rbInspect(rawField)}: ${e.constructor.name}: ${e.message}`,
      );
      return null;
    }
  }

  /** @internal */
  static fieldClassFor(name: unknown): FieldClass | undefined {
    return Field.FIELDS_MAP[rbObjAsString(name).toLowerCase()];
  }

  static readonly FIELD_ORDER_LOOKUP = FIELD_ORDER_LOOKUP;

  /** @internal */
  private _name: string;
  /** @internal */
  private _unparsedValue: unknown;
  /** @internal */
  private _charset: unknown;
  /** @internal */
  private _field: CommonField | null = null;
  /** @internal */
  private _fieldOrderId: number | null = null;

  constructor(name: string, value: unknown = null, charset: unknown = "utf-8") {
    if (name.includes(Constants.COLON)) {
      throw new ArgumentError(
        "Passing an unparsed header field to Mail::Field.new is not supported in Mail 2.8.0+. Use Mail::Field.parse instead.",
      );
    } else if (Utilities.isBlank(value)) {
      this._name = name;
      this._unparsedValue = null;
      this._charset = charset;
    } else {
      this._name = name;
      this._unparsedValue = value;
      this._charset = charset;
    }
    this._name = Field.FIELD_NAME_MAP[rbObjAsString(this._name).toLowerCase()] ?? this._name;
  }

  get unparsedValue(): unknown {
    return this._unparsedValue;
  }

  get field(): CommonField {
    return (this._field ??= this.createField(this._name, this._unparsedValue, this._charset));
  }

  set field(field: CommonField) {
    this._field = field;
  }

  get name(): string {
    return this._name;
  }

  get value(): string | unknown[] {
    return this.field.value;
  }

  set value(val: unknown) {
    this._field = this.createField(this.name, val, this._charset);
  }

  toString(): string {
    return this.field.toString();
  }

  inspect(): string {
    const ivars = rbObjInstanceVariables(this).map(
      (ivar) => `${ivar}=${rbInspect(this[`_${ivar.slice(1)}` as keyof this])}`,
    );
    return `#<Mail::Field 0x${(BigInt(rbObjId(this)) * 2n).toString(16)} ${ivars.join(" ")}>`;
  }

  same(other: unknown): boolean {
    return (
      other instanceof (this.constructor as typeof Field) &&
      Utilities.matchToS(other.name, this.name)
    );
  }

  equals(other: unknown): boolean {
    return this.same(other) && Utilities.matchToS((other as Field).value, this.value);
  }

  isResponsibleFor(fieldName: unknown): boolean {
    return rbObjAsString(this.name).toLowerCase() === rbObjAsString(fieldName).toLowerCase();
  }

  compareTo(other: unknown): number | null {
    return cmp(this.fieldOrderId(), (other as Field).fieldOrderId());
  }

  fieldOrderId(): number {
    return (this._fieldOrderId ??=
      FIELD_ORDER_LOOKUP[rbObjAsString(this.name).toLowerCase()] ?? 100);
  }

  methodMissing(name: string, ...args: unknown[]): unknown {
    return rbFSend(this.field, name, ...args);
  }

  respondToMissing(methodName: string, _includePrivate: boolean): boolean {
    return rbObjRespondTo(this.field, methodName);
  }

  /** @internal */
  private createField(name: string, value: unknown, charset: unknown): CommonField {
    try {
      return this.parseField(name, value, charset);
    } catch (e) {
      if (!(e instanceof Field.ParseError)) throw e;
      const field = new (Mail.UnstructuredField as unknown as new (
        ...args: unknown[]
      ) => CommonField)(name, value);
      field.errors.push([name, value, e]);
      return field;
    }
  }

  /** @internal */
  private parseField(name: string, value: unknown, charset: unknown): CommonField {
    if (typeof value === "string") value = this.unfold(value);

    const klass = (this.constructor as typeof Field).fieldClassFor(name);
    if (klass != null) {
      return klass.parse(value, charset);
    } else {
      return (Mail.OptionalField as unknown as FieldClass).parse(name, value, charset);
    }
  }

  /** @internal */
  private unfold(string: string): string {
    return string.replace(Constants.UNFOLD_WS, "$1");
  }
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export interface Field {
  readonly errors: unknown[];
  readonly charset: unknown;
  isSingular(): boolean;
  encoded(): string;
  decoded(): unknown;
}

Object.setPrototypeOf(
  Field.prototype,
  new Proxy(Object.create(Object.prototype) as object, {
    get(target, name, receiver: Field) {
      if (typeof name !== "string" || !Object.hasOwn(receiver, "_field")) {
        return Reflect.get(target, name, receiver);
      }
      if (name in target || !receiver.respondToMissing(name, false)) return undefined;
      const value = Reflect.get(receiver.field, name, receiver.field) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => receiver.methodMissing(name, ...args);
    },
    set(target, name, value, receiver: Field) {
      if (
        typeof name === "string" &&
        Object.hasOwn(receiver, "_field") &&
        receiver.respondToMissing(name, false)
      ) {
        return Reflect.set(receiver.field, name, value, receiver.field);
      }
      return Reflect.set(target, name, value, receiver);
    },
  }),
);
