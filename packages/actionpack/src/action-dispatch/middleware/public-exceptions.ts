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
import { bodyFromString, HTTP_STATUS_CODES } from "@blazetrails/rack";
import { X_CASCADE } from "../constants.js";
import { MimeType } from "../http/mime-type.js";
import { Response } from "../http/response.js";

async function* emptyBody(): RackBody {}

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
    if (accept === "") return MimeType.lookup("html");
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
    const bytes = Buffer.byteLength(body, "utf-8");
    return [
      status,
      {
        "content-type": `${contentType}; charset=${Response.defaultCharset}`,
        "content-length": String(bytes),
      },
      bodyFromString(body),
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
      const htmlType = MimeType.lookup("html") ?? new MimeType("text/html", "html");
      return this.renderFormat(status, htmlType, html);
    }
    return [404, { [X_CASCADE]: "pass" }, emptyBody()];
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
