import {
  File,
  rbFSend,
  rbInspect,
  rbObjClass,
  rbObjId,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { chomp } from "@blazetrails/ruby-compat";

import { CONTENT_TYPE, CONTENT_LENGTH, RACK_ERRORS } from "./constants.js";
import { Request } from "./request.js";
import { bestQMatch, escapeHtml } from "./utils.js";
import type { RackApp } from "./mock-request.js";

export class Frame {
  private _filename: string | null = null;
  private _lineno: number | null = null;
  private _function: string | null = null;
  private _preContextLineno: number | null = null;
  private _preContext: string[] | null = null;
  private _contextLine: string | null = null;
  private _postContextLineno: number | null = null;
  private _postContext: string[] | null = null;

  get filename(): string | null {
    return this._filename;
  }
  setFilename(filename: string | null): void {
    this._filename = filename;
  }

  get lineno(): number | null {
    return this._lineno;
  }
  setLineno(lineno: number | null): void {
    this._lineno = lineno;
  }

  get function(): string | null {
    return this._function;
  }
  setFunction(func: string | null): void {
    this._function = func;
  }

  get preContextLineno(): number | null {
    return this._preContextLineno;
  }
  setPreContextLineno(preContextLineno: number | null): void {
    this._preContextLineno = preContextLineno;
  }

  get preContext(): string[] | null {
    return this._preContext;
  }
  setPreContext(preContext: string[] | null): void {
    this._preContext = preContext;
  }

  get contextLine(): string | null {
    return this._contextLine;
  }
  setContextLine(contextLine: string | null): void {
    this._contextLine = contextLine;
  }

  get postContextLineno(): number | null {
    return this._postContextLineno;
  }
  setPostContextLineno(postContextLineno: number | null): void {
    this._postContextLineno = postContextLineno;
  }

  get postContext(): string[] | null {
    return this._postContext;
  }
  setPostContext(postContext: string[] | null): void {
    this._postContext = postContext;
  }
}

export class ShowExceptions {
  static readonly CONTEXT = 7;

  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  prefersPlaintext(env: Record<string, any>): boolean {
    return !this.acceptsHtml(env);
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string | string[]>, any]> {
    try {
      return await (rbFSend(this.app, "call", env) as ReturnType<typeof this.app>);
    } catch (e: any) {
      const exceptionString = this.dumpException(e);

      env[RACK_ERRORS].puts(exceptionString);
      env[RACK_ERRORS].flush();

      let contentType: string;
      let body: string;
      if (this.acceptsHtml(env)) {
        contentType = "text/html";
        body = this.pretty(env, e);
      } else {
        contentType = "text/plain";
        body = exceptionString;
      }

      return [
        500,
        { [CONTENT_TYPE]: contentType, [CONTENT_LENGTH]: String(Buffer.byteLength(body)) },
        [body],
      ];
    }
  }

  dumpException(exception: Error): string {
    const message = (exception as any).detailedMessage
      ? (exception as any).detailedMessage()
      : exception.message || "";
    const name = exception.constructor?.name || (exception as any).name || "Error";
    const backtrace = this.backtrace(exception)
      .map((l) => `\t${l}`)
      .join("\n");
    return `${name}: ${message}\n${backtrace}`;
  }

  pretty(env: Record<string, any>, exception: Error): string {
    const req = new Request(env);

    const path = (req.scriptName + req.pathInfo).replace(/\/+/g, "/");

    const frames = this.backtrace(exception)
      .map((line) => {
        const frame = new Frame();
        const m = /(.*?):(\d+)(:in `(.*)')?/.exec(line);
        if (m) {
          frame.setFilename(m[1]);
          frame.setLineno(parseInt(m[2], 10));
          frame.setFunction(m[4] ?? null);

          try {
            const lineno = frame.lineno! - 1;
            const lines = File.readlines(frame.filename!);
            frame.setPreContextLineno(Math.max(lineno - ShowExceptions.CONTEXT, 0));
            frame.setPreContext(lines.slice(frame.preContextLineno!, lineno));
            frame.setContextLine(chomp(lines[lineno]));
            frame.setPostContextLineno(Math.min(lineno + ShowExceptions.CONTEXT, lines.length));
            frame.setPostContext(lines.slice(lineno + 1, frame.postContextLineno! + 1));
          } catch {
            /** @empty */
          }

          return frame;
        } else {
          return null;
        }
      })
      .filter((frame): frame is Frame => frame !== null);

    return this.template()({ h: (obj) => this.h(obj), env, exception, req, path, frames });
  }

  private backtrace(exception: Error): string[] {
    if (!exception.stack) return [];
    return exception.stack
      .split("\n")
      .slice(1)
      .map((line) => {
        const m = /^\s*at (?:(.*?) \()?(.*?):(\d+):\d+\)?$/.exec(line);
        return m ? `${m[2]}:${m[3]}${m[1] ? `:in \`${m[1]}'` : ""}` : line.trim();
      });
  }

  protected template(): (binding: TemplateBinding) => string {
    return TEMPLATE;
  }

  /** @missingRailsName inspect — PERMANENT */
  h(obj: any): string {
    if (typeof obj === "string") {
      return escapeHtml(obj);
    } else {
      return escapeHtml(rbInspect(obj));
    }
  }

  /** @internal */
  private acceptsHtml(env: Record<string, any>): string | null {
    return bestQMatch(env["HTTP_ACCEPT"], ["text/html"]);
  }
}

type TemplateBinding = {
  h: (obj: unknown) => string;
  env: Record<string, any>;
  exception: Error;
  req: Request;
  path: string;
  frames: Frame[];
};

const TEMPLATE = ({ h, env, exception, req, path, frames }: TemplateBinding): string => {
  let noPostData: string | undefined;
  const first = frames[0];
  const postPresent = (() => {
    try {
      return req.POST != null && Object.keys(req.POST).length !== 0;
    } catch {
      noPostData = "Invalid POST data";
      return null;
    }
  })();
  return String.raw`<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html lang="en">
<head>
  <meta http-equiv="content-type" content="text/html; charset=utf-8" />
  <meta name="robots" content="NONE,NOARCHIVE" />
  <title>${h(rbObjClass(exception))} at ${h(path)}</title>
  <style type="text/css">
    html * { padding:0; margin:0; }
    body * { padding:10px 20px; }
    body * * { padding:0; }
    body { font:small sans-serif; }
    body>div { border-bottom:1px solid #ddd; }
    h1 { font-weight:normal; }
    h2 { margin-bottom:.8em; }
    h2 span { font-size:80%; color:#666; font-weight:normal; }
    h3 { margin:1em 0 .5em 0; }
    h4 { margin:0 0 .5em 0; font-weight: normal; }
    table {
        border:1px solid #ccc; border-collapse: collapse; background:white; }
    tbody td, tbody th { vertical-align:top; padding:2px 3px; }
    thead th {
        padding:1px 6px 1px 3px; background:#fefefe; text-align:left;
        font-weight:normal; font-size:11px; border:1px solid #ddd; }
    tbody th { text-align:right; color:#666; padding-right:.5em; }
    table.vars { margin:5px 0 2px 40px; }
    table.vars td, table.req td { font-family:monospace; }
    table td.code { width:100%;}
    table td.code div { overflow:hidden; }
    table.source th { color:#666; }
    table.source td {
        font-family:monospace; white-space:pre; border-bottom:1px solid #eee; }
    ul.traceback { list-style-type:none; }
    ul.traceback li.frame { margin-bottom:1em; }
    div.context { margin: 10px 0; }
    div.context ol {
        padding-left:30px; margin:0 10px; list-style-position: inside; }
    div.context ol li {
        font-family:monospace; white-space:pre; color:#666; cursor:pointer; }
    div.context ol.context-line li { color:black; background-color:#ccc; }
    div.context ol.context-line li span { float: right; }
    div.commands { margin-left: 40px; }
    div.commands a { color:black; text-decoration:none; }
    #summary { background: #ffc; }
    #summary h2 { font-family: monospace; font-weight: normal; color: #666; white-space: pre-wrap; }
    #summary ul#quicklinks { list-style-type: none; margin-bottom: 2em; }
    #summary ul#quicklinks li { float: left; padding: 0 1em; }
    #summary ul#quicklinks>li+li { border-left: 1px #666 solid; }
    #explanation { background:#eee; }
    #template, #template-not-exist { background:#f6f6f6; }
    #template-not-exist ul { margin: 0 0 0 20px; }
    #traceback { background:#eee; }
    #requestinfo { background:#f6f6f6; padding-left:120px; }
    #summary table { border:none; background:transparent; }
    #requestinfo h2, #requestinfo h3 { position:relative; margin-left:-100px; }
    #requestinfo h3 { margin-bottom:-1em; }
    .error { background: #ffc; }
    .specific { color:#cc3300; font-weight:bold; }
  </style>
  <script type="text/javascript">
  //<!--
    function getElementsByClassName(oElm, strTagName, strClassName){
        // Written by Jonathan Snook, http://www.snook.ca/jon;
        // Add-ons by Robert Nyman, http://www.robertnyman.com
        var arrElements = (strTagName == "*" && document.all)? document.all :
        oElm.getElementsByTagName(strTagName);
        var arrReturnElements = new Array();
        strClassName = strClassName.replace(/\-/g, "\\-");
        var oRegExp = new RegExp("(^|\\s)" + strClassName + "(\\s|$$)");
        var oElement;
        for(var i=0; i<arrElements.length; i++){
            oElement = arrElements[i];
            if(oRegExp.test(oElement.className)){
                arrReturnElements.push(oElement);
            }
        }
        return (arrReturnElements)
    }
    function hideAll(elems) {
      for (var e = 0; e < elems.length; e++) {
        elems[e].style.display = 'none';
      }
    }
    window.onload = function() {
      hideAll(getElementsByClassName(document, 'table', 'vars'));
      hideAll(getElementsByClassName(document, 'ol', 'pre-context'));
      hideAll(getElementsByClassName(document, 'ol', 'post-context'));
    }
    function toggle() {
      for (var i = 0; i < arguments.length; i++) {
        var e = document.getElementById(arguments[i]);
        if (e) {
          e.style.display = e.style.display == 'none' ? 'block' : 'none';
        }
      }
      return false;
    }
    function varToggle(link, id) {
      toggle('v' + id);
      var s = link.getElementsByTagName('span')[0];
      var uarr = String.fromCharCode(0x25b6);
      var darr = String.fromCharCode(0x25bc);
      s.innerHTML = s.innerHTML == uarr ? darr : uarr;
      return false;
    }
    //-->
  </script>
</head>
<body>

<div id="summary">
  <h1>${h(rbObjClass(exception))} at ${h(path)}</h1>
${
  rbObjRespondTo(exception, "detailedMessage")
    ? `  <h2>${h((exception as any).detailedMessage({ highlight: false }))}</h2>`
    : `  <h2>${h(exception.message)}</h2>`
}
  <table><tr>
    <th>Ruby</th>
    <td>
${
  first
    ? `      <code>${h(first.filename)}</code>: in <code>${h(first.function)}</code>, line ${h(frames[0].lineno)}`
    : `      unknown location`
}
    </td>
  </tr><tr>
    <th>Web</th>
    <td><code>${h(req.requestMethod)} ${h(req.host + path)}</code></td>
  </tr></table>

  <h3>Jump to:</h3>
  <ul id="quicklinks">
    <li><a href="#get-info">GET</a></li>
    <li><a href="#post-info">POST</a></li>
    <li><a href="#cookie-info">Cookies</a></li>
    <li><a href="#env-info">ENV</a></li>
  </ul>
</div>

<div id="traceback">
  <h2>Traceback <span>(innermost first)</span></h2>
  <ul class="traceback">
${frames
  .map(
    (frame) => `      <li class="frame">
        <code>${h(frame.filename)}</code>: in <code>${h(frame.function)}</code>

          ${
            frame.contextLine
              ? `<div class="context" id="c${h(rbObjId(frame))}">
              ${
                frame.preContext
                  ? `<ol start="${h(frame.preContextLineno! + 1)}" class="pre-context" id="pre${h(rbObjId(frame))}">
                ${frame.preContext
                  .map(
                    (line) =>
                      `<li onclick="toggle('pre${h(rbObjId(frame))}', 'post${h(rbObjId(frame))}')">${h(line)}</li>`,
                  )
                  .join("\n")}
              </ol>`
                  : ""
              }

            <ol start="${h(frame.lineno)}" class="context-line">
              <li onclick="toggle('pre${h(rbObjId(frame))}', 'post${h(rbObjId(frame))}')">${h(frame.contextLine)}<span>...</span></li></ol>

              ${
                frame.postContext
                  ? `<ol start='${h(frame.lineno! + 1)}' class="post-context" id="post${h(rbObjId(frame))}">
                ${frame.postContext
                  .map(
                    (line) =>
                      `<li onclick="toggle('pre${h(rbObjId(frame))}', 'post${h(rbObjId(frame))}')">${h(line)}</li>`,
                  )
                  .join("\n")}
              </ol>`
                  : ""
              }
          </div>`
              : ""
          }
      </li>`,
  )
  .join("\n")}
  </ul>
</div>

<div id="requestinfo">
  <h2>Request information</h2>

  <h3 id="get-info">GET</h3>
  ${
    req.GET && Object.keys(req.GET).length !== 0
      ? `<table class="req">
      <thead>
        <tr>
          <th>Variable</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
          ${Object.entries(req.GET)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(
              ([key, val]) => `<tr>
            <td>${h(key)}</td>
            <td class="code"><div>${h(rbInspect(val))}</div></td>
          </tr>`,
            )
            .join("\n")}
      </tbody>
    </table>`
      : `<p>No GET data.</p>`
  }

  <h3 id="post-info">POST</h3>
  ${
    postPresent
      ? `<table class="req">
      <thead>
        <tr>
          <th>Variable</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
          ${Object.entries(req.POST)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(
              ([key, val]) => `<tr>
            <td>${h(key)}</td>
            <td class="code"><div>${h(rbInspect(val))}</div></td>
          </tr>`,
            )
            .join("\n")}
      </tbody>
    </table>`
      : `<p>${noPostData || "No POST data"}.</p>`
  }


  <h3 id="cookie-info">COOKIES</h3>
  ${
    Object.keys(req.cookies).length !== 0
      ? `<table class="req">
      <thead>
        <tr>
          <th>Variable</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(req.cookies)
          .map(
            ([key, val]) => `<tr>
            <td>${h(key)}</td>
            <td class="code"><div>${h(rbInspect(val))}</div></td>
          </tr>`,
          )
          .join("\n")}
      </tbody>
    </table>`
      : `<p>No cookie data.</p>`
  }

  <h3 id="env-info">Rack ENV</h3>
    <table class="req">
      <thead>
        <tr>
          <th>Variable</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
          ${Object.entries(env)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(
              ([key, val]) => `<tr>
            <td>${h(key)}</td>
            <td class="code"><div>${h(rbInspect(val))}</div></td>
          </tr>`,
            )
            .join("\n")}
      </tbody>
    </table>

</div>

<div id="explanation">
  <p>
    You're seeing this error because you use <code>Rack::ShowExceptions</code>.
  </p>
</div>

</body>
</html>
`;
};
