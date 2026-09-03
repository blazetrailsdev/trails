import { getPath } from "@blazetrails/ruby-compat";
import { RACK_ERRORS } from "./constants.js";
import type { RackApp } from "./mock-request.js";
import { escapePath } from "./utils.js";

export class Sendfile {
  private app: RackApp;
  private variation: string | null;
  private mappings: [string, string][];

  constructor(app: RackApp, variation?: string | null, mappings?: [string, string][]) {
    this.app = app;
    this.variation = variation || null;
    this.mappings = mappings || [];
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    const response = await this.app(env);
    const [, headers, body] = response;

    if (body && typeof body.toPath === "function") {
      const type = this.variation || env["sendfile.type"] || null;
      if (type != null && /x-accel-redirect/i.test(type)) {
        const path = getPath().resolve(body.toPath());
        const url = this.mapAccelPath(env, path);
        if (url != null) {
          headers["content-length"] = "0";
          // '?' must be percent-encoded because it is not query string but a part of path
          headers[type.toLowerCase()] = escapePath(url).replace(/\?/g, "%3F");
          const obody = body;
          if (typeof obody.close === "function") obody.close();
          response[2] = [];
        } else {
          env[RACK_ERRORS].puts("x-accel-mapping header missing");
        }
      } else if (type != null && /x-sendfile|x-lighttpd-send-file/i.test(type)) {
        const path = getPath().resolve(body.toPath());
        headers["content-length"] = "0";
        headers[type.toLowerCase()] = path;
        const obody = body;
        if (typeof obody.close === "function") obody.close();
        response[2] = [];
      } else if (type === "" || type == null) {
        // Rails' `when '', nil` arm is empty (`rack/sendfile.rb:138`).
      } else {
        env[RACK_ERRORS].puts(`Unknown x-sendfile variation: "${type}"`);
      }
    }

    return response;
  }

  /** @internal */
  private mapAccelPath(env: Record<string, any>, path: string): string | undefined {
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const literal = (replacement: string) => () => replacement;
    if (this.mappings.length > 0) {
      const internalMapping = this.mappings.find(([internal]) =>
        new RegExp("^" + escape(internal)).test(path),
      );
      if (internalMapping) {
        return path.replace(
          new RegExp("^" + escape(internalMapping[0])),
          literal(internalMapping[1]),
        );
      }
      return undefined;
    }
    const headerMapping = env["HTTP_X_ACCEL_MAPPING"];
    if (headerMapping) {
      for (const m of String(headerMapping)
        .split(",")
        .map((s: string) => s.trim())) {
        const [internal, external] = m.split("=", 2).map((s: string) => s.trim());
        const newPath = path.replace(new RegExp("^" + escape(internal), "i"), literal(external));
        if (newPath !== path) return newPath;
      }
      return path;
    }
    return undefined;
  }
}
