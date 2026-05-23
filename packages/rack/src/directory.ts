import { getFs, getPath } from "@blazetrails/activesupport";
import type { FsStatResult } from "@blazetrails/activesupport";
import { CONTENT_TYPE, CONTENT_LENGTH } from "./constants.js";
import { mimeType } from "./mime.js";
import { Files } from "./files.js";

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dirPageHeader(showPath: string): string {
  return `<html><head>
  <title>${showPath}</title>
  <meta http-equiv="content-type" content="text/html; charset=utf-8" />
  <style type='text/css'>
table { width:100%; }
.name { text-align:left; }
.size, .mtime { text-align:right; }
.type { width:11em; }
.mtime { width:15em; }
  </style>
</head><body>
<h1>${showPath}</h1>
<hr />
<table>
  <tr>
    <th class='name'>Name</th>
    <th class='size'>Size</th>
    <th class='type'>Type</th>
    <th class='mtime'>Last Modified</th>
  </tr>
`;
}

function formatDirRow(
  url: string,
  name: string,
  size: string,
  type: string,
  mtime: string,
): string {
  return DIR_FILE.replace("%s", escapeHtml(url))
    .replace("%s", escapeHtml(name))
    .replace("%s", escapeHtml(size))
    .replace("%s", escapeHtml(type))
    .replace("%s", escapeHtml(mtime));
}

export class DirectoryBody {
  root: string;
  path: string;
  files: (basename: string) => [string, string, string, string, string] | null;
  private showPath: string;

  constructor(
    root: string,
    path: string,
    files: (basename: string) => [string, string, string, string, string] | null,
    showPath?: string,
  ) {
    this.root = root;
    this.path = path;
    this.files = files;
    this.showPath = showPath ?? escapeHtml(path.replace(root, ""));
  }

  each(cb: (chunk: string) => void): void {
    cb(dirPageHeader(this.showPath));

    if (this.path.replace(/\/$/, "") !== this.root) {
      const parent = this.files("..");
      if (parent) cb(formatDirRow(...parent));
    }

    let entries: string[];
    try {
      entries = getFs()
        .readdirSync(this.path, { withFileTypes: true })
        .map((e: { name: string }) => e.name)
        .filter((n: string) => !n.startsWith("."));
    } catch {
      entries = [];
    }

    for (const basename of entries) {
      const f = this.files(basename);
      if (f) cb(formatDirRow(...f));
    }

    cb(DIR_PAGE_FOOTER);
  }
}

export class Directory {
  root: string;
  private app: any;

  constructor(root: string, app?: any) {
    this.root = getPath().resolve(root);
    this.app = app || new Files(this.root);
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, any>, any]> {
    const method = env["REQUEST_METHOD"];
    const [status, headers, body] = await this.get(env);
    return method === "HEAD" ? [status, headers, []] : [status, headers, body];
  }

  async get(env: Record<string, any>): Promise<[number, Record<string, any>, any]> {
    const scriptName = env["SCRIPT_NAME"] || "";
    let pathInfo: string;
    try {
      pathInfo = decodeURIComponent(env["PATH_INFO"] || "/");
    } catch {
      return this.checkBadRequest("\0")!;
    }

    const clientError = this.checkBadRequest(pathInfo) || this.checkForbidden(pathInfo);
    if (clientError) return clientError;

    const path = getPath().join(this.root, pathInfo);
    return this.listPath(env, path, pathInfo, scriptName);
  }

  checkBadRequest(pathInfo: string): [number, Record<string, any>, any] | null {
    if (!pathInfo.includes("\0")) return null;
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
    const resolved = getPath().resolve(getPath().join(this.root, pathInfo));
    if (resolved === this.root || resolved.startsWith(this.root + getPath().sep)) return null;
    return this.entityNotFound(pathInfo);
  }

  listDirectory(
    pathInfo: string,
    path: string,
    scriptName: string,
  ): [number, Record<string, any>, any] {
    const showPath = escapeHtml(scriptName + pathInfo);
    const urlHead = [...scriptName.split("/"), ...pathInfo.split("/")].map((p) =>
      encodeURIComponent(p),
    );

    const filesCallback = (basename: string): [string, string, string, string, string] | null => {
      const fullEntry = getPath().join(path, basename);
      const s = this.stat(fullEntry);
      if (!s) return null;

      let url = [...urlHead, encodeURIComponent(basename)].join("/").replace(/\/+/g, "/");
      const mtime = s.mtime.toUTCString();

      if (s.isDirectory()) {
        url = url.endsWith("/") ? url : url + "/";
        const displayName = basename === ".." ? "Parent Directory" : basename + "/";
        return [url, displayName, "-", "directory", mtime];
      }

      const type = mimeType(getPath().extname(basename), null) || "text/plain";
      return [url, basename, this.filesizeFormat(s.size), type, mtime];
    };

    const body = new DirectoryBody(this.root, path, filesCallback, showPath);
    return [200, { [CONTENT_TYPE]: "text/html; charset=utf-8" }, body];
  }

  stat(path: string): FsStatResult | null {
    try {
      return getFs().statSync(path);
    } catch {
      return null;
    }
  }

  async listPath(
    env: Record<string, any>,
    path: string,
    pathInfo: string,
    scriptName: string,
  ): Promise<[number, Record<string, any>, any]> {
    const s = this.stat(path);
    if (s) {
      if (s.isFile()) return this.app.call(env);
      if (s.isDirectory()) return this.listDirectory(pathInfo, path, scriptName);
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
