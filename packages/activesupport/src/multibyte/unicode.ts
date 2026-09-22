import { bytes, scrub } from "@blazetrails/ruby-compat";

export namespace Unicode {
  export function decompose(type: string, codepoints: number[]): number[] {
    if (type === ":compatibility") {
      return codepointsOf(String.fromCodePoint(...codepoints).normalize("NFKD"));
    } else {
      return codepointsOf(String.fromCodePoint(...codepoints).normalize("NFD"));
    }
  }

  export function compose(codepoints: number[]): number[] {
    return codepointsOf(String.fromCodePoint(...codepoints).normalize("NFC"));
  }

  export function tidyBytes(string: string, force: boolean = false): string {
    // eslint-disable-next-line no-control-regex -- Ruby's `ascii_only?` (unicode.rb:29)
    if (string.length === 0 || /^[\x00-\x7f]*$/.test(string)) return string;
    if (force) return recodeWindows1252Chars(string);
    return scrub(string, null, (bad) => recodeWindows1252Chars(bad));
  }

  /** @internal */
  export function recodeWindows1252Chars(string: string): string {
    const decoder = new TextDecoder("windows-1252");
    return bytes(string)
      .map((byte) =>
        WINDOWS_1252_UNDEF.has(byte) ? "\ufffd" : decoder.decode(Uint8Array.of(byte)),
      )
      .join("");
  }
}

const WINDOWS_1252_UNDEF = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

function codepointsOf(string: string): number[] {
  return Array.from(string, (c) => c.codePointAt(0)!);
}
