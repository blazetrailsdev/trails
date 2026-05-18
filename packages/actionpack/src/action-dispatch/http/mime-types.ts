// Build list of Mime types for HTTP responses
// https://www.iana.org/assignments/media-types/
//
// Mirrors `actionpack/lib/action_dispatch/http/mime_types.rb`. The Ruby file
// runs `Mime::Type.register` at load time; here we expose the same data as a
// function so `mime-type.ts` can invoke it after defining the class (avoids
// a circular import).

interface MimeTypeRegistrar {
  register(string: string, symbol: string, synonyms?: string[], extensions?: string[]): unknown;
}

/** @internal */
export function registerDefaultMimeTypes(MimeType: MimeTypeRegistrar): void {
  MimeType.register("text/html", "html", ["application/xhtml+xml"], ["xhtml"]);
  MimeType.register("text/plain", "text", [], ["txt"]);
  MimeType.register("text/javascript", "js", [
    "application/javascript",
    "application/x-javascript",
  ]);
  MimeType.register("text/css", "css");
  MimeType.register("text/calendar", "ics");
  MimeType.register("text/csv", "csv");
  MimeType.register("text/vcard", "vcf");
  MimeType.register("text/vtt", "vtt", [], ["vtt"]);

  MimeType.register("image/png", "png", [], ["png"]);
  MimeType.register("image/jpeg", "jpeg", [], ["jpg", "jpeg", "jpe", "pjpeg"]);
  MimeType.register("image/gif", "gif", [], ["gif"]);
  MimeType.register("image/bmp", "bmp", [], ["bmp"]);
  MimeType.register("image/tiff", "tiff", [], ["tif", "tiff"]);
  MimeType.register("image/svg+xml", "svg");
  MimeType.register("image/webp", "webp", [], ["webp"]);

  MimeType.register("video/mpeg", "mpeg", [], ["mpg", "mpeg", "mpe"]);

  MimeType.register("audio/mpeg", "mp3", [], ["mp1", "mp2", "mp3"]);
  MimeType.register("audio/ogg", "ogg", [], ["oga", "ogg", "spx", "opus"]);
  MimeType.register("audio/aac", "m4a", ["audio/mp4"], ["m4a", "mpg4", "aac"]);

  MimeType.register("video/webm", "webm", [], ["webm"]);
  MimeType.register("video/mp4", "mp4", [], ["mp4", "m4v"]);

  MimeType.register("font/otf", "otf", [], ["otf"]);
  MimeType.register("font/ttf", "ttf", [], ["ttf"]);
  MimeType.register("font/woff", "woff", [], ["woff"]);
  MimeType.register("font/woff2", "woff2", [], ["woff2"]);

  MimeType.register("application/xml", "xml", ["text/xml", "application/x-xml"]);
  MimeType.register("application/rss+xml", "rss");
  MimeType.register("application/atom+xml", "atom");
  MimeType.register("application/x-yaml", "yaml", ["text/yaml"], ["yml", "yaml"]);

  MimeType.register("multipart/form-data", "multipart_form");
  MimeType.register("application/x-www-form-urlencoded", "url_encoded_form");

  // https://www.ietf.org/rfc/rfc4627.txt
  // http://www.json.org/JSONRequest.html
  // https://www.ietf.org/rfc/rfc7807.txt
  MimeType.register("application/json", "json", [
    "text/x-json",
    "application/jsonrequest",
    "application/problem+json",
  ]);

  MimeType.register("application/pdf", "pdf", [], ["pdf"]);
  MimeType.register("application/zip", "zip", [], ["zip"]);
  MimeType.register("application/gzip", "gzip", ["application/x-gzip"], ["gz"]);
}
