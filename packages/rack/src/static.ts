import { Dir, File, Hash, rbObjIsKindOf, rbFSend } from "@blazetrails/ruby-compat";
import { CACHE_CONTROL, CONTENT_TYPE } from "./constants.js";
import { Files } from "./files.js";
import { mimeType } from "./mime.js";
import { cleanPathInfo, unescape, unescapePath } from "./utils.js";

export interface StaticOptions {
  urls?: string[] | Record<string, string>;
  root?: string;
  index?: string;
  cascade?: boolean;
  header_rules?: [unknown, Record<string, string>][];
  cache_control?: string;
  gzip?: boolean;
}

export class Static {
  private app: any;
  private urls: string[] | Record<string, string>;
  private index: string | undefined;
  private cascade: boolean;
  private gzip: boolean;
  private headerRules: [unknown, Record<string, string>][];
  private fileServer: Files;

  constructor(app: any, options: StaticOptions = {}) {
    this.app = app;
    this.urls = options.urls ?? ["/favicon.ico"];
    this.index = options.index;
    this.cascade = options.cascade ?? false;
    this.gzip = options.gzip ?? false;
    const root = options.root ? File.expandPath(options.root) : Dir.pwd();
    this.headerRules = options.header_rules ? [...options.header_rules] : [];
    if (options.cache_control) {
      this.headerRules.unshift(["all", { [CACHE_CONTROL]: options.cache_control }]);
    }
    this.fileServer = new Files(root, {});
  }

  isAddIndexRoot(path: string): boolean {
    return !!(this.index && this.routeFile(path) && path.endsWith("/"));
  }

  overwriteFilePath(path: string): boolean {
    return (
      (rbObjIsKindOf(this.urls, Hash) && Object.hasOwn(this.urls, path)) ||
      this.isAddIndexRoot(path)
    );
  }

  routeFile(path: string): boolean {
    return (
      rbObjIsKindOf(this.urls, Array) &&
      (this.urls as string[]).some((url) => path.indexOf(url) === 0)
    );
  }

  canServe(path: string): boolean {
    return this.routeFile(path) || this.overwriteFilePath(path);
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, any>, any]> {
    let path = (env["PATH_INFO"] || "/") as string;
    const actualPath = cleanPathInfo(unescapePath(path));

    if (!this.canServe(actualPath)) {
      return rbFSend(this.app, "call", env) as ReturnType<typeof this.app>;
    }

    let response: [number, Record<string, any>, any] | null = null;

    if (this.overwriteFilePath(path)) {
      env["PATH_INFO"] = this.isAddIndexRoot(path)
        ? path + this.index!
        : (this.urls as Record<string, string>)[path];
    } else if (
      this.gzip &&
      env["HTTP_ACCEPT_ENCODING"] &&
      /\bgzip\b/.test(env["HTTP_ACCEPT_ENCODING"])
    ) {
      path = env["PATH_INFO"] as string;
      env["PATH_INFO"] += ".gz";
      response = await this.fileServer.call(env);
      env["PATH_INFO"] = path;

      if (response[0] === 404) {
        response = null;
      } else if (response[0] === 304) {
        /** @empty */
      } else {
        response[1][CONTENT_TYPE] = mimeType(File.extname(path), "text/plain");
        response[1]["content-encoding"] = "gzip";
      }
    }

    path = env["PATH_INFO"] as string;
    response ??= await this.fileServer.call(env);

    if (this.cascade && response[0] === 404) {
      return rbFSend(this.app, "call", env) as ReturnType<typeof this.app>;
    }

    const headers = response[1];
    for (const [_rule, newHeaders] of this.applicableRules(path)) {
      for (const [field, content] of Object.entries(newHeaders)) {
        headers[field] = content;
      }
    }

    return response;
  }

  applicableRules(path: string): [unknown, Record<string, string>][] {
    return this.headerRules.filter(([rule]) => {
      if (rule === "all") return true;
      if (rule === "fonts") return /\.(?:ttf|otf|eot|woff2|woff|svg)$/.test(path);
      if (typeof rule === "string") {
        path = unescape(path);
        return path.startsWith(rule) || path.startsWith("/" + rule);
      }
      if (Array.isArray(rule)) return new RegExp(`\\.(${rule.join("|")})$`).test(path);
      if (rule instanceof RegExp) return rule.test(path);
      return false;
    });
  }
}
