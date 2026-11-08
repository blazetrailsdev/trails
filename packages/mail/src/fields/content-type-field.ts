import {
  binaryBytes,
  binaryString,
  type Encoding,
  NoMethodError,
  rbObjAsString,
  strip,
} from "@blazetrails/ruby-compat";
import { ContentTypeElement } from "../elements/content-type-element.js";
import { Encodings } from "../encodings.js";
import { Field } from "../field.js";
import { Mail } from "../mail.js";
import { Utilities } from "../utilities.js";
import { NamedStructuredField } from "./named-structured-field.js";
import { ParameterHash } from "./parameter-hash.js";

export class ContentTypeField extends NamedStructuredField {
  static readonly NAME = "Content-Type";

  /** @internal */
  declare private _mainType: string | null;
  /** @internal */
  declare private _subType: string | null;
  /** @internal */
  declare private _parameters: ParameterHash | undefined;
  /** @internal */
  declare private _filename: unknown;

  static override isSingular(): boolean {
    return true;
  }

  static withBoundary(type: string): ContentTypeField {
    return new this(`${type}; boundary=${this.generateBoundary()}`);
  }

  static generateBoundary(): string {
    return `--==_mimepart_${Mail.randomTag()}`;
  }

  constructor(value: unknown = null, charset: string | Encoding | null = null) {
    let mainType: string | null = null;
    let subType: string | null = null;
    let parameters: ParameterHash | undefined;
    if (Array.isArray(value)) {
      mainType = value[0] as string;
      subType = value[1] as string;
      parameters = new ParameterHash();
      parameters.mergeBang(value.at(-1) as Record<string, unknown>);
    } else {
      value = rbObjAsString(value);
    }

    super(ContentTypeField.prototype.ensureFilenameQuoted(value), charset);
    this._mainType = mainType;
    this._subType = subType;
    this._parameters = parameters;
  }

  override element(): ContentTypeElement {
    if (this._element == null) {
      try {
        this._element = new ContentTypeElement(this.value as string);
      } catch (e) {
        if (!(e instanceof Field.ParseError)) throw e;
        this._element = this.attemptToClean();
      }
    }
    return this._element as ContentTypeElement;
  }

  attemptToClean(): ContentTypeElement {
    try {
      return new ContentTypeElement(this.sanitize(this.value as string | Uint8Array));
    } catch (e) {
      if (!(e instanceof Field.ParseError)) throw e;
      return new ContentTypeElement(this.getMimeType(this.value as string | Uint8Array));
    }
  }

  mainType(): string {
    return (this._mainType ??= this.element().mainType);
  }

  subType(): string {
    return (this._subType ??= this.element().subType);
  }

  string(): string {
    return `${this.mainType()}/${this.subType()}`;
  }

  contentType(): string {
    return this.string();
  }

  override default(): unknown {
    return this.decoded();
  }

  parameters(): ParameterHash {
    if (this._parameters === undefined) {
      this._parameters = new ParameterHash();
      for (const p of this.element().parameters) this._parameters.mergeBang(p);
    }
    return this._parameters;
  }

  override get value(): string | unknown[] {
    if (Array.isArray(this._value)) {
      return `${this._mainType}/${this._subType}; ${this.stringify(this.parameters())}`;
    } else {
      return this._value;
    }
  }

  override set value(value: unknown) {
    super.value = value;
  }

  stringify(params: ParameterHash): string {
    return [...params.entries()]
      .map(([k, v]) => `${k}=${Encodings.paramEncode(v as string)}`)
      .join("; ");
  }

  filename(): unknown {
    return (this._filename ??= this.parameters().get("filename") ?? this.parameters().get("name"));
  }

  override encoded(): string {
    const p = this.parameters().size > 0 ? `;\r\n ${this.parameters().encoded()}` : "";
    return `${this.name}: ${this.contentType()}${p}\r\n`;
  }

  override decoded(): string {
    const p = this.parameters().size > 0 ? `; ${this.parameters().decoded()}` : "";
    return `${this.contentType()}${p}`;
  }

  /** @internal */
  methodMissing(name: string, ...args: unknown[]): unknown {
    const m = /(\w+)=/.exec(name);
    if (m) {
      this.parameters().set(m[1], args[0]);
      this._value = `${this.contentType()}; ${this.stringify(this.parameters())}`;
      return args[0];
    } else {
      throw new NoMethodError(`undefined method '${name}' for an instance of ContentTypeField`);
    }
  }

  /**
   * @internal
   * @inventedArm binaryString — PERMANENT
   */
  private sanitize(val: string | Uint8Array): string | Uint8Array {
    if (val instanceof Uint8Array) return binaryBytes(this.sanitize(binaryString(val)) as string);
    val = val
      .replace(/\s*=\s*/g, "=")
      .replace(/[; ]+/g, "; ")
      .replace(/;\s*$/gm, "");

    const named = /((boundary|name|filename)=(\S*))/i.exec(val);
    if (named) {
      const pre = val.slice(0, named.index);
      const post = val.slice(named.index + named[0].length);
      val = `${pre.toLowerCase()}${named[2]}=${named[3]}${post.toLowerCase()}`;
    } else {
      val = val.toLowerCase();
    }

    const chomped = val.replace(/(\r\n|\n|\r)$/, "");
    let m: RegExpExecArray | null;
    if ((m = /^\s*([\w-]+)\/([\w-]+)\s*;\s?(ISO[\w-]+)$/im.exec(chomped))) {
      return `${m[1]}/${m[2]}; charset=${Utilities.quoteAtom(m[3])}`;
    } else if (/^text;?$/im.test(chomped)) {
      return "text/plain;";
    } else if ((m = /^(\w+);\s(.*)$/im.exec(chomped))) {
      return `text/plain; ${m[2]}`;
    } else if ((m = /([\w-]+\/[\w-]+);\scharset="charset="(\w+)""/i.exec(val))) {
      return `${m[1]}; charset=${Utilities.quoteAtom(m[2])}`;
    } else if ((m = /([\w-]+\/[\w-]+);\s+(.*)/i.exec(val))) {
      const type = m[1];
      const params = m[2]
        .split(/\s+/)
        .filter((i) => i.length > 0)
        .map((i) => strip(i))
        .map((i) => {
          const index = i.search(/\s*=\s*/);
          return index === -1 ? [i] : [i.slice(0, index), i.slice(index + 1)];
        })
        .map((i) => `${i[0]}=${Utilities.dquote((i[1] ?? "").replace(/;$/, ""))}`)
        .join("; ");
      return `${type}; ${params}`;
    } else if (/^\s*$/m.test(val)) {
      return "text/plain";
    } else {
      return val;
    }
  }

  /**
   * @internal
   * @inventedArm binaryString — PERMANENT
   */
  private getMimeType(val: string | Uint8Array): string {
    const m = /^([\w-]+)\/([\w-]+);.+$/im.exec(val instanceof Uint8Array ? binaryString(val) : val);
    return m ? `${m[1]}/${m[2]}` : "text/plain";
  }
}
Mail.ContentTypeField = ContentTypeField;
