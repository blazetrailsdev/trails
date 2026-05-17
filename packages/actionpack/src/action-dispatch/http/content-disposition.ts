/**
 * ActionDispatch::Http::ContentDisposition
 *
 * Builds Content-Disposition header values per RFC 5987, with an ASCII
 * fallback for legacy clients. Used by send_file / send_data.
 */

import { transliterate } from "@blazetrails/activesupport";

const TRADITIONAL_ESCAPED_CHAR = /[^ A-Za-z0-9!#$+.^_`|~-]/g;
const RFC_5987_ESCAPED_CHAR = /[^A-Za-z0-9!#$&+.^_`|~-]/g;

const utf8Encoder = new TextEncoder();

export interface ContentDispositionOptions {
  disposition: string;
  filename: string | null;
}

export class ContentDisposition {
  readonly disposition: string;
  readonly filename: string | null;

  constructor({ disposition, filename }: ContentDispositionOptions) {
    this.disposition = disposition;
    this.filename = filename;
  }

  static format(options: ContentDispositionOptions): string {
    return new ContentDisposition(options).toString();
  }

  asciiFilename(): string {
    const translit = transliterate(this.filename ?? "");
    return `filename="${percentEscape(translit, TRADITIONAL_ESCAPED_CHAR)}"`;
  }

  utf8Filename(): string {
    return `filename*=UTF-8''${percentEscape(this.filename ?? "", RFC_5987_ESCAPED_CHAR)}`;
  }

  toString(): string {
    if (this.filename) {
      return `${this.disposition}; ${this.asciiFilename()}; ${this.utf8Filename()}`;
    }
    return this.disposition;
  }
}

function percentEscape(str: string, pattern: RegExp): string {
  return str.replace(pattern, (char) => {
    const bytes = utf8Encoder.encode(char);
    let out = "";
    for (const byte of bytes) {
      out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
    return out;
  });
}
