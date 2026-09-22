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
    return string.replace(
      /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,
      (bad) => recodeWindows1252Chars(bad),
    );
  }

  /** @internal */
  export function recodeWindows1252Chars(string: string): string {
    const bytes = Uint8Array.from(string, (c) => c.charCodeAt(0) & 0xff);
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function codepointsOf(string: string): number[] {
  return Array.from(string, (c) => c.codePointAt(0)!);
}
