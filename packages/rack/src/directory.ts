import * as fs from "fs";
import * as path from "path";
import { CONTENT_TYPE, CONTENT_LENGTH } from "./constants.js";
import { Files } from "./files.js";

export class Directory {
  private root: string;
  private app: any;
  private fileServer: Files;

  constructor(root: string, app?: any) {
    this.root = path.resolve(root);
    this.app = app || new Files(root);
    this.fileServer = new Files(root);
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, any>, any]> {
    const pathInfo = env["PATH_INFO"] || "/";
    const scriptName = env["SCRIPT_NAME"] || "";
    const decodedPath = decodeURIComponent(pathInfo);

    // Null byte check
    if (decodedPath.includes("\0")) {
      return [400, { [CONTENT_TYPE]: "text/plain" }, ["Bad Request"]];
    }

    const fullPath = path.join(this.root, decodedPath);
    const resolved = path.resolve(fullPath);

    // Directory traversal check
    if (!resolved.startsWith(this.root)) {
      return [404, { [CONTENT_TYPE]: "text/plain" }, ["Not Found"]];
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolved);
    } catch {
      return [404, { [CONTENT_TYPE]: "text/plain" }, ["Not Found"]];
    }

    if (stat.isFile()) {
      return this.fileServer.serving(env, pathInfo);
    }

    if (!stat.isDirectory()) {
      return [404, { [CONTENT_TYPE]: "text/plain" }, ["Not Found"]];
    }

    // Directory listing
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(resolved, { withFileTypes: true });
    } catch {
      return [404, { [CONTENT_TYPE]: "text/plain" }, ["Not Found"]];
    }

    const html = this.generateListing(decodedPath, scriptName, resolved, entries);
    return [200, {
      [CONTENT_TYPE]: "text/html; charset=utf-8",
      [CONTENT_LENGTH]: String(Buffer.byteLength(html)),
    }, [html]];
  }

  private generateListing(reqPath: string, scriptName: string, dirPath: string, entries: fs.Dirent[]): string {
    const escapedScript = this.escapeHtml(scriptName);
    const escapedPath = this.escapeHtml(reqPath);
    let body = `<html><head><title>Directory: ${escapedPath}</title>`;
    body += `<style>table { width: 100%; } td { padding: 2px 5px; }</style></head>`;
    body += `<body><h1>Directory: ${escapedScript}${escapedPath}</h1><hr><table>`;

    if (reqPath !== "/") {
      const parent = path.dirname(reqPath);
      const parentUri = encodeURI(scriptName + parent);
      body += `<tr><td><a href="${parentUri}">../</a></td><td></td><td></td></tr>`;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = entry.name;
      const fullEntryPath = path.join(dirPath, name);
      const displayName = entry.isDirectory() ? name + "/" : name;
      const uri = encodeURI(scriptName + path.join(reqPath, name).replace(/\\/g, "/"));

      let size = "";
      let mtime = "";
      try {
        const stat = fs.statSync(fullEntryPath);
        size = entry.isDirectory() ? "-" : String(stat.size);
        mtime = stat.mtime.toISOString();
      } catch {
        size = "-";
        mtime = "-";
      }

      body += `<tr><td><a href="${uri}">${this.escapeHtml(displayName)}</a></td><td>${size}</td><td>${mtime}</td></tr>`;
    }

    body += `</table><hr></body></html>`;
    return body;
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
}
