import type { RackApp } from "./mock-request.js";

const KNOWN_VARIATIONS = ["X-Sendfile", "X-Lighttpd-Send-File", "X-Accel-Redirect"];

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
    const [_status, headers, body] = response;

    // Get the file path from body.toPath()
    const path = body && typeof body.toPath === "function" ? body.toPath() : null;
    if (!path) return response;

    // Determine variation - from constructor or from env (not from HTTP headers for security)
    const variation = this.variation || env["sendfile.type"] || null;
    if (!variation) return response;

    // Validate variation
    if (!KNOWN_VARIATIONS.some((v) => v.toLowerCase() === variation.toLowerCase())) {
      const errors = env["rack.errors"];
      if (errors && typeof errors.write === "function") {
        errors.write(`Unknown x-sendfile variation: "${variation}"\n`);
      }
      return response;
    }

    const headerName = variation.toLowerCase();

    if (variation.toLowerCase() === "x-accel-redirect") {
      const mappedPath = this.mapAccelPath(env, path);
      if (mappedPath == null) {
        const errors = env["rack.errors"];
        if (errors && typeof errors.write === "function") {
          errors.write("x-accel-mapping header missing\n");
        }
        return response;
      }
      headers[headerName] = mappedPath.replace(/%/g, "%25").replace(/\?/g, "%3F");
      headers["content-length"] = "0";
      if (body && typeof body.close === "function") body.close();
      response[2] = [];
    } else {
      headers[headerName] = path;
      headers["content-length"] = "0";
      if (body && typeof body.close === "function") body.close();
      response[2] = [];
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
