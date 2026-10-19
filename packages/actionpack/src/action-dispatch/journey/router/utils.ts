import { format, strNew } from "@blazetrails/ruby-compat";

class UriEncoder {
  static readonly ENCODE = "%%%02X";
  static readonly EMPTY = "";
  static readonly DEC2HEX = Array.from({ length: 256 }, (_, i) => format(UriEncoder.ENCODE, i));

  static readonly ALPHA = "a-zA-Z";
  static readonly DIGIT = "0-9";
  static readonly UNRESERVED = `${UriEncoder.ALPHA}${UriEncoder.DIGIT}\\-\\._~`;
  static readonly SUB_DELIMS = "!\\$&'\\(\\)\\*\\+,;=";

  static readonly ESCAPED = /%[a-zA-Z0-9]{2}/g;

  static readonly FRAGMENT = new RegExp(
    `[^${UriEncoder.UNRESERVED}${UriEncoder.SUB_DELIMS}:@\\/?]`,
    "gu",
  );
  static readonly SEGMENT = new RegExp(
    `[^${UriEncoder.UNRESERVED}${UriEncoder.SUB_DELIMS}:@]`,
    "gu",
  );
  static readonly PATH = new RegExp(
    `[^${UriEncoder.UNRESERVED}${UriEncoder.SUB_DELIMS}:@\\/]`,
    "gu",
  );

  escapeFragment(fragment: string): string {
    return this.escape(fragment, UriEncoder.FRAGMENT);
  }

  escapePath(path: string): string {
    return this.escape(path, UriEncoder.PATH);
  }

  escapeSegment(segment: string): string {
    return this.escape(segment, UriEncoder.SEGMENT);
  }

  unescapeUri(uri: string): string {
    const bytes: number[] = [];
    const encoder = new TextEncoder();
    let last = 0;
    for (const match of uri.matchAll(UriEncoder.ESCAPED)) {
      for (const b of encoder.encode(uri.slice(last, match.index))) bytes.push(b);
      bytes.push(parseInt(match[0].slice(1, 3), 16));
      last = match.index + match[0].length;
    }
    for (const b of encoder.encode(uri.slice(last))) bytes.push(b);
    return strNew(bytes);
  }

  private escape(component: string, pattern: RegExp): string {
    return component.replace(pattern, (unsafe) => this.percentEncode(unsafe));
  }

  private percentEncode(unsafe: string): string {
    let safe = UriEncoder.EMPTY;
    for (const b of new TextEncoder().encode(unsafe)) safe += UriEncoder.DEC2HEX[b];
    return safe;
  }
}

export class Utils {
  static normalizePath(path: string | null | undefined): string {
    let p = `/${path ?? ""}`.replace(/\/+/g, "/");
    if (p !== "/") {
      if (p.endsWith("/")) p = p.slice(0, -1);
      p = p.replace(/(%[a-f0-9]{2})/g, (m) => m.toUpperCase());
    }
    return p;
  }

  static UriEncoder = UriEncoder;

  static readonly ENCODER = new UriEncoder();

  static escapePath(path: unknown): string {
    return Utils.ENCODER.escapePath(String(path));
  }

  static escapeSegment(segment: unknown): string {
    return Utils.ENCODER.escapeSegment(String(segment));
  }

  static escapeFragment(fragment: unknown): string {
    return Utils.ENCODER.escapeFragment(String(fragment));
  }

  static unescapeUri(uri: string): string {
    return Utils.ENCODER.unescapeUri(uri);
  }
}
