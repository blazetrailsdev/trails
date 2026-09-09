import { format } from "@blazetrails/ruby-compat";

export function normalizePath(path: string | null | undefined): string {
  let p = `/${path ?? ""}`.replace(/\/+/g, "/");
  if (p !== "/") {
    if (p.endsWith("/")) p = p.slice(0, -1);
    p = p.replace(/(%[a-f0-9]{2})/g, (m) => m.toUpperCase());
  }
  return p;
}

export class UriEncoder {
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
    let i = 0;
    while (i < uri.length) {
      UriEncoder.ESCAPED.lastIndex = i;
      const match = UriEncoder.ESCAPED.exec(uri);
      if (match && match.index === i) {
        bytes.push(parseInt(/^[0-9a-fA-F]*/.exec(match[0].slice(1, 3))![0], 16) || 0);
        i += 3;
        continue;
      }
      const cp = uri.codePointAt(i)!;
      for (const b of encoder.encode(String.fromCodePoint(cp))) bytes.push(b);
      i += cp > 0xffff ? 2 : 1;
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
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

const ENCODER = new UriEncoder();

export function escapePath(path: string): string {
  return ENCODER.escapePath(String(path));
}

export function escapeSegment(segment: string): string {
  return ENCODER.escapeSegment(String(segment));
}

export function escapeFragment(fragment: string): string {
  return ENCODER.escapeFragment(String(fragment));
}

export function unescapeUri(uri: string): string {
  return ENCODER.unescapeUri(uri);
}
