import { getPath } from "@blazetrails/activesupport";
import { cwd } from "@blazetrails/activesupport/process-adapter";
import { CACHE_CONTROL, CONTENT_TYPE } from "./constants.js";
import { Files } from "./files.js";
import { mimeType } from "./mime.js";
import { cleanPathInfo, unescapePath } from "./utils.js";

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

  constructor(app: any, opts: StaticOptions = {}) {
    this.app = app;
    this.urls = opts.urls ?? ["/favicon.ico"];
    this.index = opts.index;
    this.cascade = opts.cascade ?? false;
    this.gzip = opts.gzip ?? false;
    const root = opts.root ? getPath().resolve(opts.root) : cwd();
    this.headerRules = opts.header_rules ? [...opts.header_rules] : [];
    if (opts.cache_control) {
      this.headerRules.unshift(["all", { [CACHE_CONTROL]: opts.cache_control }]);
    }
    this.fileServer = new Files(root, {});
  }

  isAddIndexRoot(path: string): boolean {
    return !!(this.index && this.routeFile(path) && path.endsWith("/"));
  }

  overwriteFilePath(path: string): boolean {
    return (
      (!Array.isArray(this.urls) && Object.prototype.hasOwnProperty.call(this.urls, path)) ||
      this.isAddIndexRoot(path)
    );
  }

  routeFile(path: string): boolean {
    return Array.isArray(this.urls) && this.urls.some((url) => path.indexOf(url) === 0);
  }

  canServe(path: string): boolean {
    return this.routeFile(path) || this.overwriteFilePath(path);
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, any>, any]> {
    const path = (env["PATH_INFO"] || "/") as string;
    const actualPath = cleanPathInfo(unescapePath(path));

    if (!this.canServe(actualPath)) {
      return this.app(env);
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
      const origPath = env["PATH_INFO"] as string;
      env["PATH_INFO"] = origPath + ".gz";
      response = await this.fileServer.call(env);
      env["PATH_INFO"] = origPath;

      if (response[0] === 404) {
        response = null;
      } else if (response[0] === 304) {
        // leave headers as-is
      } else {
        response[1][CONTENT_TYPE] = mimeType(getPath().extname(origPath), "text/plain");
        response[1]["content-encoding"] = "gzip";
      }
    }

    const servePath = env["PATH_INFO"] as string;
    response ??= await this.fileServer.call(env);

    if (this.cascade && response[0] === 404) {
      return this.app(env);
    }

    const headers = response[1];
    for (const [_rule, newHeaders] of this.applicableRules(servePath)) {
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
        const decoded = unescapePath(path);
        return decoded.startsWith(rule) || decoded.startsWith("/" + rule);
      }
      if (Array.isArray(rule)) return new RegExp(`\\.(${rule.join("|")})$`).test(path);
      if (rule instanceof RegExp) return rule.test(path);
      return false;
    });
  }
}
