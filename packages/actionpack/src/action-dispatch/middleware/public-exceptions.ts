/**
 * ActionDispatch::PublicExceptions
 *
 * When called, this middleware renders an error page. By default if an HTML
 * response is expected it will render static error pages from the `/public`
 * directory. For example when this middleware receives a 500 response it will
 * render the template found in `/public/500.html`. If an internationalized
 * locale is set, this middleware will attempt to render the template in
 * `/public/500.<locale>.html`. If an internationalized template is not found
 * it will fall back on `/public/500.html`.
 *
 * When a request with a content type other than HTML is made, this middleware
 * will attempt to convert error information into the appropriate response
 * type.
 *
 * Port of `actionpack/lib/action_dispatch/middleware/public_exceptions.rb`.
 */

import { I18n, getFs, getPath } from "@blazetrails/activesupport";
import type { RackBody, RackEnv, RackResponse } from "@blazetrails/rack";
import { HTTP_STATUS_CODES } from "@blazetrails/rack";
import { X_CASCADE } from "../constants.js";
import { MimeType } from "../http/mime-type.js";
import { Response } from "../http/response.js";

async function* emptyBody(): RackBody {}

async function* bodyFromBytes(bytes: Uint8Array): RackBody {
  yield bytes;
}

const LOCALE_RE = /^[A-Za-z0-9_-]+$/;

type ErrorBody = { status: number; error: string };

export class PublicExceptions {
  publicPath: string;

  constructor(publicPath: string) {
    this.publicPath = publicPath;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const pathInfo = String(env["PATH_INFO"] ?? "");
    const status = parseInt(pathInfo.slice(1), 10) || 0;

    // Rails wraps this in a `rescue ActionDispatch::Http::MimeNegotiation::InvalidType`
    // and falls back to `Mime[:text]`. Our `MimeType.parse` is forgiving (creates
    // ad-hoc types for unknown ranges and never raises), so the rescue is a no-op
    // until `Request.formats` lands and surfaces `InvalidType` for malformed
    // Accept headers. See PR follow-ups.
    const contentType = this.firstFormat(env);

    const body: ErrorBody = {
      status,
      error: HTTP_STATUS_CODES[status as keyof typeof HTTP_STATUS_CODES] ?? HTTP_STATUS_CODES[500],
    };

    return this.render(status, contentType, body);
  }

  private firstFormat(env: RackEnv): MimeType | undefined {
    const accept = String(env["HTTP_ACCEPT"] ?? "").trim();
    if (accept === "") return MimeType.lookupByExtension("html");
    const parsed = MimeType.parse(accept);
    return parsed[0];
  }

  private render(status: number, contentType: MimeType | undefined, body: ErrorBody): RackResponse {
    const sym = contentType?.symbol;
    if (sym === "json") {
      return this.renderFormat(status, contentType!, JSON.stringify(body));
    }
    if (sym === "xml") {
      return this.renderFormat(status, contentType!, toXml(body));
    }
    return this.renderHtml(status);
  }

  private renderFormat(status: number, contentType: MimeType, body: string): RackResponse {
    const charset = Response.defaultCharset;
    // Encode the body into bytes that match the negotiated charset so the
    // `content-type` header, `content-length`, and wire bytes all agree.
    // Unknown tokens fall back to utf-8 with the header rewritten to match.
    const enc = normalizeCharset(charset);
    const effectiveCharset =
      enc === "utf-8" && charset.toLowerCase() !== "utf-8" ? "utf-8" : charset;
    const encoded = Buffer.from(body, enc);
    return [
      status,
      {
        "content-type": `${contentType}; charset=${effectiveCharset}`,
        "content-length": String(encoded.byteLength),
      },
      bodyFromBytes(encoded),
    ];
  }

  private renderHtml(status: number): RackResponse {
    // Sanitize locale before string-interpolating into a file path so a
    // misconfigured `I18n.locale` can never escape `publicPath`.
    const locale = LOCALE_RE.test(I18n.locale) ? I18n.locale : null;
    let file: string | null = locale
      ? getPath().join(this.publicPath, `${status}.${locale}.html`)
      : null;
    let found = file != null && getFs().existsSync(file);
    if (!found) {
      file = getPath().join(this.publicPath, `${status}.html`);
      found = getFs().existsSync(file);
    }

    if (found && file != null) {
      const html = getFs().readFileSync(file, "utf8");
      const htmlType = MimeType.lookupByExtension("html") ?? MimeType.lookup("text/html");
      return this.renderFormat(status, htmlType, html);
    }
    return [404, { [X_CASCADE]: "pass" }, emptyBody()];
  }
}

function normalizeCharset(charset: string): BufferEncoding {
  switch (charset.toLowerCase()) {
    case "utf-8":
    case "utf8":
      return "utf-8";
    case "utf-16le":
    case "utf16le":
    case "ucs-2":
    case "ucs2":
      return "utf16le";
    case "iso-8859-1":
    case "iso8859-1":
    case "latin1":
    case "latin-1":
      return "latin1";
    case "us-ascii":
    case "ascii":
      return "ascii";
    default:
      return "utf-8";
  }
}

function toXml(body: ErrorBody): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<hash>\n` +
    `  <status type="integer">${body.status}</status>\n` +
    `  <error>${escapeXml(body.error)}</error>\n` +
    `</hash>\n`
  );
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
