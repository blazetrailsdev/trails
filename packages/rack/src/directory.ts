import { Dir, File, rbObjMethod, sprintf } from "@blazetrails/ruby-compat";
import type { FsStatResult } from "@blazetrails/ruby-compat";
import { CONTENT_TYPE, CONTENT_LENGTH, PATH_INFO, SCRIPT_NAME } from "./constants.js";
import { escapeHtml, escapePath, unescapePath, validPath } from "./utils.js";
import { mimeType } from "./mime.js";
import { Files } from "./files.js";
import { Head } from "./head.js";
import type { RackApp } from "./mock-request.js";

const DIR_FILE =
  "<tr><td class='name'><a href='%s'>%s</a></td><td class='size'>%s</td><td class='type'>%s</td><td class='mtime'>%s</td></tr>\n";
const DIR_PAGE_FOOTER = `</table>
<hr />
</body></html>
`;

const FILESIZE_FORMAT: [string, number][] = [
  ["%.1fT", 2 ** 40],
  ["%.1fG", 2 ** 30],
  ["%.1fM", 2 ** 20],
  ["%.1fK", 2 ** 10],
];

const DIR_PAGE_HEADER = `<html><head>
  <title>%s</title>
  <meta http-equiv="content-type" content="text/html; charset=utf-8" />
  <style type='text/css'>
table { width:100%%; }
.name { text-align:left; }
.size, .mtime { text-align:right; }
.type { width:11em; }
.mtime { width:15em; }
  </style>
</head><body>
<h1>%s</h1>
<hr />
<table>
  <tr>
    <th class='name'>Name</th>
    <th class='size'>Size</th>
    <th class='type'>Type</th>
    <th class='mtime'>Last Modified</th>
  </tr>
`;

export class DirectoryBody {
  root: string;
  path: string;
  files: (basename: string) => [string, string, string, string, string] | null;

  constructor(
    root: string,
    path: string,
    files: (basename: string) => [string, string, string, string, string] | null,
  ) {
    this.root = root;
    this.path = path;
    this.files = files;
  }

  /** @missingRailsName sub — PERMANENT */
  each(cb: (chunk: string) => void): void {
    const showPath = escapeHtml(this.path.replace(new RegExp(`^${this.root}`), ""));
    cb(sprintf(DIR_PAGE_HEADER, showPath, showPath));

    if (this.path.replace(/\/$/, "") !== this.root) {
      cb(sprintf(DIR_FILE, ...this.DIRFILEEscape(this.files("..")!)));
    }

    Dir.foreach(this.path, (basename) => {
      if (basename.startsWith(".")) return;
      const f = this.files(basename);
      if (!f) return;
      cb(sprintf(DIR_FILE, ...this.DIRFILEEscape(f)));
    });

    cb(DIR_PAGE_FOOTER);
  }

  /** @internal */
  private DIRFILEEscape(htmls: string[]): string[] {
    return htmls.map((e) => escapeHtml(e));
  }
}

export class Directory {
  root: string;
  private app: any;
  private head: Head;

  /** @missingRailsName method — PERMANENT */
  constructor(root: string, app?: any) {
    this.root = File.expandPath(root);
    this.app = app || new Files(this.root);
    this.head = new Head(rbObjMethod(this, ":get") as unknown as RackApp);
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, any>, any]> {
    return this.head.call(env);
  }

  async get(env: Record<string, any>): Promise<[number, Record<string, any>, any]> {
    const scriptName = env[SCRIPT_NAME];
    const pathInfo = unescapePath(env[PATH_INFO]);

    const clientErrorResponse = this.checkBadRequest(pathInfo) || this.checkForbidden(pathInfo);
    if (clientErrorResponse) {
      return clientErrorResponse;
    } else {
      const path = File.join(this.root, pathInfo);
      return this.listPath(env, path, pathInfo, scriptName);
    }
  }

  checkBadRequest(pathInfo: string): [number, Record<string, any>, any] | null {
    if (validPath(pathInfo)) return null;

    const body = "Bad Request\n";
    return [
      400,
      {
        [CONTENT_TYPE]: "text/plain",
        [CONTENT_LENGTH]: String(Buffer.byteLength(body)),
        "x-cascade": "pass",
      },
      [body],
    ];
  }

  checkForbidden(pathInfo: string): [number, Record<string, any>, any] | null {
    if (!pathInfo.includes("..")) return null;
    if (File.expandPath(File.join(this.root, pathInfo)).startsWith(this.root)) return null;

    const body = "Forbidden\n";
    return [
      403,
      {
        [CONTENT_TYPE]: "text/plain",
        [CONTENT_LENGTH]: String(Buffer.byteLength(body)),
        "x-cascade": "pass",
      },
      [body],
    ];
  }

  listDirectory(
    pathInfo: string,
    path: string,
    scriptName: string,
  ): [number, Record<string, any>, any] {
    const urlHead = [...scriptName.split("/"), ...pathInfo.split("/")].map((part) =>
      escapePath(part),
    );

    const body = new DirectoryBody(this.root, path, (basename) => {
      const stat = this.stat(File.join(path, basename));
      if (!stat) return null;

      let url = File.join(...urlHead, escapePath(basename));
      const mtime = stat.mtime.toUTCString();
      let type: string;
      let size: string;
      if (stat.isDirectory()) {
        type = "directory";
        size = "-";
        url += "/";
        if (basename === "..") {
          basename = "Parent Directory";
        } else {
          basename += "/";
        }
      } else {
        type = mimeType(File.extname(basename))!;
        size = this.filesizeFormat(stat.size);
      }

      return [url, basename, size, type, mtime];
    });

    return [200, { [CONTENT_TYPE]: "text/html; charset=utf-8" }, body];
  }

  stat(path: string): FsStatResult | null {
    try {
      return File.stat(path);
    } catch (error) {
      const code = (error as { code?: unknown } | null | undefined)?.code;
      if (code !== "ENOENT" && code !== "ELOOP") throw error;
      return null;
    }
  }

  async listPath(
    env: Record<string, any>,
    path: string,
    pathInfo: string,
    scriptName: string,
  ): Promise<[number, Record<string, any>, any]> {
    let stat: FsStatResult | null;
    if ((stat = this.stat(path)) && File.isReadable(path)) {
      if (stat.isFile()) return this.app.call(env);
      if (stat.isDirectory()) return this.listDirectory(pathInfo, path, scriptName);
    }

    return this.entityNotFound(pathInfo);
  }

  entityNotFound(pathInfo: string): [number, Record<string, any>, any] {
    const body = `Entity not found: ${pathInfo}\n`;
    return [
      404,
      {
        [CONTENT_TYPE]: "text/plain",
        [CONTENT_LENGTH]: String(Buffer.byteLength(body)),
        "x-cascade": "pass",
      },
      [body],
    ];
  }

  filesizeFormat(int: number): string {
    for (const [fmt, size] of FILESIZE_FORMAT) {
      if (int >= size) {
        return fmt.replace("%.1f", (int / size).toFixed(1));
      }
    }
    return `${int}B`;
  }
}
