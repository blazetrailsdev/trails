import { I18n, camelize } from "@blazetrails/activesupport";
import { fetch, File, rbFPublicSend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { HTTP_STATUS_CODES } from "@blazetrails/rack";
import { X_CASCADE } from "../constants.js";
import { Mime, MimeType } from "../http/mime-type.js";
import { InvalidType } from "../http/mime-negotiation.js";
import { Request } from "../http/request.js";
import { Response } from "../http/response.js";

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

    const request = new Request(env);
    let contentType: MimeType | undefined;
    try {
      contentType = request.formats[0] as MimeType | undefined;
    } catch (e) {
      if (!(e instanceof InvalidType)) throw e;
      contentType = Mime.get(":text");
    }

    const body: ErrorBody = {
      status,
      error: fetch<string>(HTTP_STATUS_CODES, String(status), HTTP_STATUS_CODES[500]),
    };

    return this.render(status, contentType, body);
  }

  private render(status: number, contentType: MimeType | undefined, body: ErrorBody): RackResponse {
    const format = contentType
      ? camelize(`to_${contentType.toSym()?.slice(1) ?? ""}`, false)
      : null;
    if (format != null && rbObjRespondTo(body, format)) {
      return this.renderFormat(status, contentType!, rbFPublicSend(body, format) as string);
    } else {
      return this.renderHtml(status);
    }
  }

  private renderFormat(status: number, contentType: MimeType | string, body: string): RackResponse {
    const encoded = Buffer.from(body, "utf-8");
    return [
      status,
      {
        "content-type": `${contentType}; charset=${Response.defaultCharset ?? ""}`,
        "content-length": String(encoded.byteLength),
      },
      [body],
    ];
  }

  private renderHtml(status: number): RackResponse {
    const currentLocale = I18n.locale();
    const locale =
      typeof currentLocale === "string" && LOCALE_RE.test(currentLocale) ? currentLocale : null;
    let path: string | null = locale
      ? File.join(this.publicPath, `${status}.${locale}.html`)
      : null;
    let found = path != null && File.isExist(path);
    if (!found) {
      path = File.join(this.publicPath, `${status}.html`);
      found = File.isExist(path);
    }

    if (found && path != null) {
      return this.renderFormat(status, "text/html", File.read(path));
    }
    return [404, { [X_CASCADE]: "pass" }, []];
  }
}
