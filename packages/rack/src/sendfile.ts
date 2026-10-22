import type { RackHeaders } from "./index.js";
import { File, rbFSend, rbStrSub } from "@blazetrails/ruby-compat";
import { RACK_ERRORS } from "./constants.js";
import type { RackApp } from "./mock-request.js";
import { BodyProxy } from "./body-proxy.js";
import { escapePath } from "./utils.js";

export class Sendfile {
  private app: RackApp;
  private _variation: string | null;
  private mappings: [RegExp, string][];

  constructor(app: RackApp, variation?: string | null, mappings?: [string, string][]) {
    this.app = app;
    this._variation = variation ?? null;
    this.mappings = (mappings || []).map(([internal, external]) => [
      new RegExp("^" + internal, "im"),
      external,
    ]);
  }

  async call(env: Record<string, any>): Promise<[number, RackHeaders, any]> {
    const response = await (rbFSend(this.app, "call", env) as ReturnType<typeof this.app>);
    const [, headers, body] = response;

    if (body && typeof body.toPath === "function") {
      const type = this.variation(env);
      if (type != null && /x-accel-redirect/i.test(type)) {
        const path = File.expandPath(body.toPath());
        const url = this.mapAccelPath(env, path);
        if (url != null) {
          headers["content-length"] = "0";
          headers[type.toLowerCase()] = escapePath(url).replace(/\?/g, "%3F");
          const obody = body;
          response[2] = new BodyProxy([], () => {
            if (typeof obody.close === "function") obody.close();
          });
        } else {
          env[RACK_ERRORS].puts("x-accel-mapping header missing");
        }
      } else if (type != null && /x-sendfile|x-lighttpd-send-file/i.test(type)) {
        const path = File.expandPath(body.toPath());
        headers["content-length"] = "0";
        headers[type.toLowerCase()] = path;
        const obody = body;
        response[2] = new BodyProxy([], () => {
          if (typeof obody.close === "function") obody.close();
        });
      } else if (type === "" || type == null) {
        /** @empty */
      } else {
        env[RACK_ERRORS].puts(`Unknown x-sendfile variation: "${type}"`);
      }
    }

    return response;
  }

  /** @internal */
  private variation(env: Record<string, any>): string | null {
    return this._variation ?? env["sendfile.type"] ?? env["HTTP_X_SENDFILE_TYPE"] ?? null;
  }

  /** @internal */
  private mapAccelPath(env: Record<string, any>, path: string): string | undefined {
    let mapping: [RegExp, string] | string | undefined = this.mappings.find(([internal]) =>
      internal.test(path),
    );
    if (mapping !== undefined) {
      return rbStrSub({ string: path }, ...mapping);
    } else if ((mapping = env["HTTP_X_ACCEL_MAPPING"] as string | undefined) != null) {
      for (const m of mapping.split(",").map((s) => s.trim())) {
        const [internal, external] = m.split("=", 2).map((s) => s.trim());
        const newPath = rbStrSub({ string: path }, new RegExp("^" + internal, "im"), external);
        if (newPath !== path) return newPath;
      }
      return path;
    }
    return undefined;
  }
}
