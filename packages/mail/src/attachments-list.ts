import { flatten, RuntimeError, IO } from "@blazetrails/ruby-compat";
import { type Info, MiniMime } from "@blazetrails/mini-mime";
import { Encodings } from "./encodings.js";
import { Mail } from "./mail.js";
import type { PartsListPart } from "./parts-list.js";

export class AttachmentsList extends Array<PartsListPart> {
  /** @noRailsEquivalent PERMANENT */
  static override get [Symbol.species](): ArrayConstructor {
    return Array;
  }

  /** @internal */
  private _partsList: PartsListPart[];
  /** @internal */
  private _contentDispositionType: string;
  /** @internal */
  private _mimeType: Info | null = null;

  constructor(partsList: PartsListPart[]) {
    super();
    this._partsList = partsList;
    this._contentDispositionType = "attachment";
    const found = Array.from(partsList).map((p) => {
      if (p.mimeType() === "message/rfc822") {
        return Mail.new(p.body.encoded()).attachments();
      } else if (p.parts.length === 0) {
        return p.isAttachment() ? p : null;
      } else {
        return p.attachments();
      }
    });
    for (const a of flatten(found)) {
      if (a != null) this.push(a);
    }
  }

  inline(): this {
    this._contentDispositionType = "inline";
    return this;
  }

  get(indexValue: number | string): PartsListPart {
    if (typeof indexValue === "number") {
      return this.at(indexValue);
    } else {
      return this.find((a) => a.filename() === indexValue) ?? null;
    }
  }

  async set(name: string, value: unknown): Promise<unknown> {
    const encodedName = Encodings.decodeEncode(name, ":encode");
    const defaultValues: Record<string, unknown> = {
      contentType: `${this.setMimeType(name)}; filename="${encodedName}"`,
      contentTransferEncoding: `${this.guessEncoding()}`,
      contentDisposition: `${this._contentDispositionType}; filename="${encodedName}"`,
    };

    let hash: Record<string, unknown>;
    if (typeof value === "object" && value !== null && !(value instanceof Uint8Array)) {
      const options = value as Record<string, unknown>;
      const path = options.filename;
      delete options.filename;
      if (path != null && path !== false) {
        options.content ??= await IO.binread(path as string);
      }

      if (options.content != null) {
        defaultValues.body = options.content;
        delete options.content;
      }

      if (options.data != null) {
        defaultValues.body = options.data;
        delete options.data;
      }

      const transferEncoding = options.transferEncoding;
      delete options.transferEncoding;
      const encoding = transferEncoding ?? options.encoding;
      delete options.encoding;
      if (encoding != null) {
        if (Encodings.isDefined(encoding as string)) {
          defaultValues.contentTransferEncoding = encoding;
        } else {
          throw new RuntimeError(
            `Do not know how to handle Content Transfer Encoding ${encoding}, please choose either quoted-printable or base64`,
          );
        }
      }

      if (options.mimeType != null) {
        defaultValues.contentType = options.mimeType;
        delete options.mimeType;
        this._mimeType = MiniMime.lookupByContentType(defaultValues.contentType as string);
        defaultValues.contentTransferEncoding ??= this.guessEncoding();
      }

      hash = { ...defaultValues, ...options };
    } else {
      defaultValues.body = value;
      hash = defaultValues;
    }

    const attachment = new (Mail.Part as new (h: unknown) => PartsListPart)(hash);
    attachment.addContentId(hash.contentId);

    return this._partsList.push(attachment);
  }

  guessEncoding(): string {
    if (this._mimeType != null && !this._mimeType.isBinary()) {
      return "7bit";
    } else {
      return "binary";
    }
  }

  setMimeType(filename: string): string | null {
    this._mimeType = MiniMime.lookupByFilename(filename);
    return this._mimeType?.contentType ?? null;
  }
}
