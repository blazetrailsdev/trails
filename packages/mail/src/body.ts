import {
  eachSlice,
  encode,
  isAsciiOnly,
  matchOperator,
  rbObjAsString,
  rbObjIvarSet,
  rbObjRespondTo,
  RuntimeError,
  regexpEscape,
  strip,
  stringSplit,
} from "@blazetrails/ruby-compat";
import { Encodings, UnknownEncodingType } from "./encodings.js";
import type { Identity } from "./encodings/identity.js";
import { TransferEncoding } from "./encodings/transfer-encoding.js";
import { Mail } from "./mail.js";
import { PartsList, type PartsListPart } from "./parts-list.js";
import { Utilities } from "./utilities.js";

export class Body {
  /** @internal */
  private _partSortOrder: string[];
  /** @internal */
  private _parts: PartsList;
  /** @internal */
  private _rawSource: string;
  /** @internal */
  private _encoding: unknown;
  /** @internal */
  private _asciiOnly: boolean | undefined;

  boundary: string | null = null;
  preamble: string | null = null;
  epilogue: string | null = null;
  charset: string | null = null;

  constructor(string: unknown = "") {
    this._partSortOrder = ["text/plain", "text/enriched", "text/html", "multipart/alternative"];
    this._parts = new PartsList();
    if (Utilities.isBlank(string)) {
      this._rawSource = "";
    } else {
      if (rbObjRespondTo(string, "join")) {
        this._rawSource = Utilities.toCrlf((string as string[]).join(""));
      } else if (rbObjRespondTo(string, "toString")) {
        this._rawSource = Utilities.toCrlf(rbObjAsString(string));
      } else {
        throw new RuntimeError(
          "You can only assign a string or an object that responds_to? :join or :to_s to a body.",
        );
      }
    }
    this._encoding = this.defaultEncoding();
    this.setCharset();
  }

  initWith(coder: { map: Record<string, unknown>; get(key: string): unknown }): void {
    for (const [k, v] of Object.entries(coder.map)) {
      const name = k.replace(/_(\w)/g, (_m, c: string) => c.toUpperCase());
      rbObjIvarSet(this, `_${name}` in this ? `@_${name}` : `@${name}`, v);
    }
    this._parts = new PartsList(coder.get("parts"));
  }

  equals(other: unknown): boolean {
    if (typeof other === "string") {
      return this._decodedText() === other;
    } else {
      return this === other;
    }
  }

  matchOperator(regexp: RegExp): number | null {
    return matchOperator(this._decodedText(), regexp) as number | null;
  }

  match(regexp: RegExp): RegExpMatchArray | null {
    return this._decodedText().match(regexp);
  }

  isInclude(other: unknown): boolean {
    return this._decodedText().includes(rbObjAsString(other));
  }

  setSortOrder(order: string[]): void {
    this._partSortOrder = order;
  }

  sortPartsBang(): unknown {
    for (const p of this._parts) {
      p.body().setSortOrder(this._partSortOrder);
      p.body().sortPartsBang();
    }
    return this._parts.sortBang(this._partSortOrder);
  }

  negotiateBestEncoding(
    messageEncoding: string | typeof TransferEncoding | null,
    allowedEncodings: (typeof TransferEncoding)[] | null = null,
  ): typeof TransferEncoding | null {
    return TransferEncoding.negotiate(
      messageEncoding,
      this.encoding() as string,
      this.rawSource,
      allowedEncodings,
    );
  }

  encoded(transferEncoding: string | typeof TransferEncoding | null = null): string | Uint8Array {
    if (this.isMultipart()) {
      this.sortPartsBang();
      const encodedParts = this.parts.map((p: PartsListPart) => p.encoded());
      return (
        [this.preamble, ...encodedParts].join(this.crlfBoundary()) +
        this.endBoundary() +
        (this.epilogue ?? "")
      );
    } else {
      const dec = Encodings.getEncoding(this.encoding() as string) as typeof Identity | null;
      const enc = (
        Utilities.isBlank(transferEncoding) ? dec : this.negotiateBestEncoding(transferEncoding)
      ) as typeof Identity | null;

      if (dec == null) {
        return this.rawSource;
      } else {
        let decoded = dec.decode(this.rawSource);
        if (this.charset != null && this.charset !== "US-ASCII") {
          decoded = encode(decoded, this.charset);
        }
        return enc!.encode(decoded);
      }
    }
  }

  decoded(): string | Uint8Array {
    if (!Encodings.isDefined(this.encoding() as string)) {
      throw new UnknownEncodingType(
        `Don't know how to decode ${this.encoding()}, please call #encoded and decode it yourself.`,
      );
    } else {
      return (Encodings.getEncoding(this.encoding() as string) as typeof Identity).decode(
        this.rawSource,
      );
    }
  }

  toString(): string {
    return this._decodedText();
  }

  encoding(val: unknown = null): unknown {
    if (val != null && val !== false) {
      this.setEncoding(val);
      return val;
    } else {
      return this._encoding;
    }
  }

  setEncoding(val: unknown): void {
    this._encoding = val === "text" || Utilities.isBlank(val) ? this.defaultEncoding() : val;
  }

  get rawSource(): string {
    return this._rawSource;
  }

  get parts(): PartsList {
    return this._parts;
  }

  isMultipart(): true | null {
    return this.parts.length > 0 ? true : null;
  }

  push(val: PartsListPart): unknown {
    return this._parts.push(val);
  }

  splitBang(boundary: string | null): this {
    this.boundary = boundary;
    const parts = this.extractParts();

    this.preamble = strip(parts[0] ?? "");
    this.epilogue = strip(parts.at(-1) ?? "");
    for (const part of parts.slice(1, -1)) this._parts.push(new Mail.Part(part));
    return this;
  }

  isAsciiOnly(): boolean {
    if (this._asciiOnly === undefined) {
      this._asciiOnly = isAsciiOnly(this.rawSource);
    }
    return this._asciiOnly;
  }

  isEmpty(): boolean {
    return this.rawSource.length === 0;
  }

  defaultEncoding(): string {
    return this.isAsciiOnly() ? "7bit" : "8bit";
  }

  private _decodedText(): string {
    const decoded = this.decoded();
    return typeof decoded === "string" ? decoded : new TextDecoder().decode(decoded);
  }

  /** @internal */
  private extractParts(): string[] {
    const partsRegex = new RegExp(
      `(?:(?<![\\s\\S])|\\r\\n)(--${regexpEscape(this.boundary ?? "")}(?:--)?)(?=\\s*$)`,
      "m",
    );
    const parts: string[][] = [];
    eachSlice(stringSplit(this.rawSource, partsRegex), 2, (slice: string[]) => parts.push(slice));
    for (let index = 0; index < parts.length; index++) {
      if (index > 0 && Utilities.isBlank(parts[index][0])) parts.splice(index, 1);
    }

    if (parts.length > 1) {
      const finalSeparator = parts.at(-2)![1];
      if (finalSeparator !== `--${this.boundary}--`) parts.push([""]);
    }
    return parts.map((p) => p[0]);
  }

  /** @internal */
  private crlfBoundary(): string {
    return `\r\n--${this.boundary}\r\n`;
  }

  /** @internal */
  private endBoundary(): string {
    return `\r\n--${this.boundary}--\r\n`;
  }

  /** @internal */
  private setCharset(): void {
    this.charset = this.isAsciiOnly() ? "US-ASCII" : null;
  }
}
