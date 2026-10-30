import { Encodings } from "../encodings.js";
import { AddressListsParser } from "../parsers/address-lists-parser.js";
import * as Constants from "../constants.js";
import { Utilities } from "../utilities.js";
import { rbInspect, rbObjDup, rbObjId, strip } from "@blazetrails/ruby-compat";

export class Address {
  /** @internal */
  private _parsed = false;
  /** @internal */ // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _data: any = null;
  /** @internal */
  private _displayName: string | null = null;
  /** @internal */
  private _formatComments: string | null = null;

  constructor(value: unknown = null) {
    if (value == null) {
      this._parsed = false;
      this._data = null;
    } else {
      this.parse(value);
    }
  }

  get raw(): string {
    return this._data.raw;
  }

  format(outputType = "decode"): string {
    if (!this._parsed) this.parse();
    let name: string | null;
    let a: string | null;
    if (this._data == null) {
      return Constants.EMPTY;
    } else if ((name = this.displayName(outputType)) != null) {
      return [Utilities.quotePhrase(name), `<${this.address(outputType)}>`, this.formatComments()]
        .filter((x) => x != null)
        .join(Constants.SPACE);
    } else if ((a = this.address(outputType)) != null) {
      return [a, this.formatComments()].filter((x) => x != null).join(Constants.SPACE);
    } else {
      return this.raw;
    }
  }

  address(outputType = "decode"): string | null {
    if (!this._parsed) this.parse();
    const d = this.domain(outputType);
    if (d != null) {
      return `${this.local(outputType)}@${d}`;
    } else {
      return this.local(outputType);
    }
  }

  setAddress(value: unknown): void {
    this.parse(value);
  }

  displayName(outputType = "decode"): string | null {
    if (!this._parsed) this.parse();
    this._displayName ??= this.getDisplayName();
    return this._displayName != null ? Encodings.decodeEncode(this._displayName, outputType) : null;
  }

  setDisplayName(str: string | null): void {
    this._displayName = str == null ? null : rbObjDup(str);
  }

  local(outputType = "decode"): string | null {
    if (!this._parsed) this.parse();
    const local = this.getLocal();
    if (local == null) return null;
    return Encodings.decodeEncode(`${this._data.obsDomainList ?? ""}${strip(local)}`, outputType);
  }

  domain(outputType = "decode"): string | null {
    if (!this._parsed) this.parse();
    const domain = this.getDomain();
    if (domain == null) return null;
    return Encodings.decodeEncode(this.stripAllComments(domain), outputType);
  }

  get comments(): string[] | null {
    if (!this._parsed) this.parse();
    const comments = this.getComments();
    if (comments == null || !comments.some((c) => c != null)) {
      return null;
    } else {
      return comments.map((c) => c.replace(/ +/g, Constants.SPACE));
    }
  }

  get name(): string | null {
    if (!this._parsed) this.parse();
    return this.getName();
  }

  toString(): string {
    if (!this._parsed) this.parse();
    return this.format();
  }

  inspect(): string {
    if (!this._parsed) this.parse();
    return `#<${rbInspect(this.constructor)}:${rbObjId(this)} Address: |${this.toString()}| >`;
  }

  get encoded(): string {
    return this.format("encode");
  }

  get decoded(): string {
    return this.format("decode");
  }

  get group(): string | null {
    return this._data?.group ?? null;
  }

  /** @internal */
  private parse(value: unknown = null): void {
    this._parsed = true;
    this._data = null;

    if (value instanceof AddressListsParser.AddressStruct) {
      this._data = value;
    } else if (typeof value === "string" || value instanceof Uint8Array) {
      if (!Utilities.isBlank(value)) {
        const addressList = AddressListsParser.parse(value);
        this._data = addressList.addresses[0] ?? null;
      }
    }
  }

  /** @internal */
  private stripAllComments(string: string): string {
    const comments = this.comments;
    if (!Utilities.isBlank(comments)) {
      for (const comment of comments!) {
        string = string.replaceAll(`(${comment})`, Constants.EMPTY);
      }
    }
    return strip(string);
  }

  /** @internal */
  private stripDomainComments(value: string | null): string {
    const comments = this.comments;
    if (!Utilities.isBlank(comments)) {
      for (const comment of comments!) {
        if (this._data.domain != null && this._data.domain.includes(`(${comment})`)) {
          value = value!.replaceAll(`(${comment})`, Constants.EMPTY);
        }
      }
    }
    return strip(value ?? "");
  }

  /** @internal */
  private getDisplayName(): string | null {
    let str: string | null = null;
    if (this._data != null && this._data.displayName != null) {
      str = this.stripAllComments(this._data.displayName);
    } else if (this._data != null && this._data.comments != null && this._data.domain != null) {
      str = this.stripDomainComments(this.formatComments());
    }
    return Utilities.isBlank(str) ? null : str;
  }

  /** @internal */
  private getName(): string | null {
    let str: string | null = null;
    if (this.displayName() != null) {
      str = this.displayName();
    } else if (this.comments != null) {
      str = `(${this.comments.join(Constants.SPACE).replace(/ +/g, Constants.SPACE)})`;
    }

    return Utilities.isBlank(str) ? null : Utilities.unparen(str!);
  }

  /** @internal */
  private formatComments(): string | null {
    if (this.comments != null) {
      const commentText = this.comments
        .map((c) => Utilities.escapeParen(c))
        .join(Constants.SPACE)
        .replace(/ +/g, Constants.SPACE);
      this._formatComments ??= `(${commentText})`;
      return this._formatComments;
    } else {
      return null;
    }
  }

  /** @internal */
  private getLocal(): string | null {
    return this._data?.local ?? null;
  }

  /** @internal */
  private getDomain(): string | null {
    return this._data?.domain ?? null;
  }

  /** @internal */
  private getComments(): string[] | null {
    return this._data?.comments ?? null;
  }
}
