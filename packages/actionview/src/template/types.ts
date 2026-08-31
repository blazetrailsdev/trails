/**
 * ActionView::Template::Types
 *
 * The set of format symbols a template can carry. Rails delegates to the Mime
 * registry (`actionview/lib/action_view/template/types.rb:37-42` —
 * `Types.symbols` → `Type.symbols` → `SET.symbols`); until `Mime::Type` is
 * ported the set is Rails' default registrations, in the order
 * `actionpack/lib/action_dispatch/http/mime_types.rb:8-56` registers them.
 */
const SYMBOLS: readonly string[] = [
  "html",
  "text",
  "js",
  "css",
  "ics",
  "csv",
  "vcf",
  "vtt",
  "png",
  "jpeg",
  "gif",
  "bmp",
  "tiff",
  "svg",
  "webp",
  "mpeg",
  "mp3",
  "ogg",
  "m4a",
  "webm",
  "mp4",
  "otf",
  "ttf",
  "woff",
  "woff2",
  "xml",
  "rss",
  "atom",
  "yaml",
  "multipart_form",
  "url_encoded_form",
  "json",
  "pdf",
  "zip",
  "gzip",
];

export class Types {
  static symbols(): readonly string[] {
    return SYMBOLS;
  }

  /** @internal `types.rb:22-24`. */
  static isValidSymbols(symbols: ReadonlyArray<string | symbol>): boolean {
    return symbols.every((s) => typeof s === "string" && SYMBOLS.includes(s));
  }
}
