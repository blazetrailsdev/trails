import { I18n } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat";
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

    const contentType = this.firstFormat(env);

    const body: ErrorBody = {
      status,
      error: HTTP_STATUS_CODES[status] ?? HTTP_STATUS_CODES[500],
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
    if (sym === ":json") {
      return this.renderFormat(status, contentType!, JSON.stringify(body));
    }
    if (sym === ":xml") {
      return this.renderFormat(status, contentType!, toXml(body));
    }
    return this.renderHtml(status);
  }

  private renderFormat(status: number, contentType: MimeType, body: string): RackResponse {
    const charset = Response.defaultCharset;
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
    const currentLocale = I18n.locale();
    const locale =
      typeof currentLocale === "string" && LOCALE_RE.test(currentLocale) ? currentLocale : null;
    let file: string | null = locale
      ? File.join(this.publicPath, `${status}.${locale}.html`)
      : null;
    let found = file != null && File.isExist(file);
    if (!found) {
      file = File.join(this.publicPath, `${status}.html`);
      found = File.isExist(file);
    }

    if (found && file != null) {
      const html = File.read(file);
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
