/**
 * ActionView::Template::Types
 *
 * The set of format symbols a template can carry. Rails delegates to the Mime
 * registry (`actionview/lib/action_view/template/types.rb:7-12` —
 * `Types.symbols` → `Type.symbols` → `SET.symbols`); until `Mime::Type` is
 * ported the set is the fixed list Rails registers by default.
 */
const SYMBOLS: readonly string[] = [
  "html",
  "text",
  "js",
  "css",
  "xml",
  "json",
  "rss",
  "atom",
  "yaml",
  "multipart_form",
  "url_encoded_form",
  "ics",
  "csv",
  "vcf",
  "vtt",
  "tsx",
  "png",
  "jpeg",
  "gif",
  "bmp",
  "tiff",
  "svg",
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
  "pdf",
  "zip",
  "gzip",
];

export class Types {
  static symbols(): readonly string[] {
    return SYMBOLS;
  }
}
