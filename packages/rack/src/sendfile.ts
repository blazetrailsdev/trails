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
    const [status, headers, body] = response;

    // Get the file path from body.toPath()
    const path = body && typeof body.toPath === "function" ? body.toPath() : null;
    if (!path) return response;

    // Determine variation - from constructor or from env (not from HTTP headers for security)
    const variation = this.variation || env["sendfile.type"] || null;
    if (!variation) return response;

    // Validate variation
    if (!KNOWN_VARIATIONS.some(v => v.toLowerCase() === variation.toLowerCase())) {
      const errors = env["rack.errors"];
      if (errors && typeof errors.write === "function") {
        errors.write(`Unknown x-sendfile variation: "${variation}"\n`);
      }
      return response;
    }

    const headerName = variation.toLowerCase();

    if (variation.toLowerCase() === "x-accel-redirect") {
      // Need mappings for X-Accel-Redirect
      let accelMappings = this.mappings;
      if (accelMappings.length === 0) {
        // Fall back to HTTP_X_ACCEL_MAPPING header
        const headerMapping = env["HTTP_X_ACCEL_MAPPING"];
        if (headerMapping) {
          accelMappings = headerMapping.split(",").map((m: string) => {
            const [from, to] = m.trim().split("=");
            return [from, to];
          });
        }
      }

      if (accelMappings.length === 0) {
        const errors = env["rack.errors"];
        if (errors && typeof errors.write === "function") {
          errors.write("x-accel-mapping header missing\n");
        }
        return response;
      }

      for (const [from, to] of accelMappings) {
        if (path.startsWith(from)) {
          const rest = path.substring(from.length);
          // Percent-encode the mapped path
          const encodedTo = to.replace(/%/g, "%25");
          const encodedRest = rest.replace(/%/g, "%25").replace(/\?/g, "%3F");
          headers[headerName] = encodedTo + encodedRest;
          headers["content-length"] = "0";
          if (body && typeof body.close === "function") body.close();
          response[2] = [];
          return response;
        }
      }

      // No mapping matched - use path directly
      headers[headerName] = path;
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
}
