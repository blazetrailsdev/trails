import type { RackHeaders } from "./index.js";
import { rbFSend, rbInspect, rbObjRespondTo, toI } from "@blazetrails/ruby-compat";
import { CONTENT_TYPE, CONTENT_LENGTH, RACK_SHOWSTATUS_DETAIL } from "./constants.js";
import { HTTP_STATUS_CODES, escapeHtml } from "./utils.js";
import { Request } from "./request.js";
import { BodyProxy } from "./body-proxy.js";
import type { RackApp } from "./mock-request.js";

type TemplateBinding = {
  h: (obj: unknown) => string;
  req: Request;
  message: string;
  status: unknown;
  detail: unknown;
};

export class ShowStatus {
  private app: RackApp;
  private template: (binding: TemplateBinding) => string;

  constructor(app: RackApp) {
    this.app = app;
    this.template = TEMPLATE;
  }

  async call(env: Record<string, any>): Promise<[number, RackHeaders, any]> {
    const response = await (rbFSend(this.app, "call", env) as ReturnType<typeof this.app>);
    const [status, headers, body] = response;
    const empty = Number(toI(headers[CONTENT_LENGTH])) <= 0;

    if ((Number(toI(status)) >= 400 && empty) || env[RACK_SHOWSTATUS_DETAIL]) {
      const req = new Request(env);

      const message = HTTP_STATUS_CODES[Number(toI(status))] || String(status);

      const detail = env[RACK_SHOWSTATUS_DETAIL] || message;

      const html = this.template({ h: (obj) => this.h(obj), req, message, status, detail });
      const size = Buffer.byteLength(html);

      response[2] = new BodyProxy([html], () => {
        if (rbObjRespondTo(body, "close")) body.close();
      });

      headers[CONTENT_TYPE] = "text/html";
      headers[CONTENT_LENGTH] = String(size);
    }

    return response;
  }

  /**
   * @internal
   * @missingRailsName inspect — PERMANENT
   */
  private h(obj: unknown): string {
    if (typeof obj === "string") {
      return escapeHtml(obj);
    } else {
      return escapeHtml(rbInspect(obj));
    }
  }
}

const TEMPLATE = ({ h, req, message, status, detail }: TemplateBinding): string => `\
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html lang="en">
<head>
  <meta http-equiv="content-type" content="text/html; charset=utf-8" />
  <title>${h(message)} at ${h(req.scriptName + req.pathInfo)}</title>
  <meta name="robots" content="NONE,NOARCHIVE" />
  <style type="text/css">
    html * { padding:0; margin:0; }
    body * { padding:10px 20px; }
    body * * { padding:0; }
    body { font:small sans-serif; background:#eee; }
    body>div { border-bottom:1px solid #ddd; }
    h1 { font-weight:normal; margin-bottom:.4em; }
    h1 span { font-size:60%; color:#666; font-weight:normal; }
    table { border:none; border-collapse: collapse; width:100%; }
    td, th { vertical-align:top; padding:2px 3px; }
    th { width:12em; text-align:right; color:#666; padding-right:.5em; }
    #info { background:#f6f6f6; }
    #info ol { margin: 0.5em 4em; }
    #info ol li { font-family: monospace; }
    #summary { background: #ffc; }
    #explanation { background:#eee; border-bottom: 0px none; }
  </style>
</head>
<body>
  <div id="summary">
    <h1>${h(message)} <span>(${toI(status)})</span></h1>
    <table class="meta">
      <tr>
        <th>Request Method:</th>
        <td>${h(req.requestMethod)}</td>
      </tr>
      <tr>
        <th>Request URL:</th>
      <td>${h(req.url)}</td>
      </tr>
    </table>
  </div>
  <div id="info">
    <p>${h(detail)}</p>
  </div>

  <div id="explanation">
    <p>
    You're seeing this error because you use <code>Rack::ShowStatus</code>.
    </p>
  </div>
</body>
</html>
`;
