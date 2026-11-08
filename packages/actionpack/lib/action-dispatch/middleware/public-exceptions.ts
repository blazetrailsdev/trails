import { I18n, camelize } from "@blazetrails/activesupport";
import { fetch, File, rbFSend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { HTTP_STATUS_CODES } from "@blazetrails/rack";
import { X_CASCADE } from "../constants.js";
import { Mime, MimeType } from "../http/mime-type.js";
import { InvalidType } from "../http/mime-negotiation.js";
import { Request } from "../http/request.js";
import { Response } from "../http/response.js";

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
      return this.renderFormat(status, contentType!, rbFSend(body, format) as string);
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
    let path = `${this.publicPath}/${status}.${I18n.locale()}.html`;
    let found: boolean;
    if (!(found = File.isExist(path))) path = `${this.publicPath}/${status}.html`;

    if (found || File.isExist(path)) {
      return this.renderFormat(status, "text/html", File.read(path));
    }
    return [404, { [X_CASCADE]: "pass" }, []];
  }
}
