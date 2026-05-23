import { PATH_INFO, SCRIPT_NAME, SERVER_NAME, SERVER_PORT } from "./constants.js";
import type { RackApp } from "./mock-request.js";

interface Mapping {
  host: string | null;
  location: string;
  matchPrefix: string;
  app: RackApp;
}

export class URLMap {
  private mappings: Mapping[];

  constructor(map: Record<string, RackApp> = {}) {
    this.mappings = [];
    this.remap(map);
  }

  remap(map: Record<string, RackApp>): void {
    this.mappings = [];
    for (const [location, app] of Object.entries(map)) {
      let host: string | null = null;
      let path = location;

      if (path.startsWith("http://") || path.startsWith("https://")) {
        const url = new URL(path);
        host = url.host.toLowerCase();
        path = url.pathname;
      } else if (!path.startsWith("/")) {
        throw new Error(`paths need to start with /`);
      }

      path = path.replace(/\/+$/, "");
      this.mappings.push({ host, location: path, matchPrefix: path.toLowerCase(), app });
    }
    this.mappings.sort((a, b) => {
      const hostDiff = (b.host?.length || 0) - (a.host?.length || 0);
      if (hostDiff !== 0) return hostDiff;
      return b.location.length - a.location.length;
    });
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    const pathInfo = (env[PATH_INFO] || "").toString();
    const scriptName = (env[SCRIPT_NAME] || "").toString();
    const serverName = (env[SERVER_NAME] || "").toString();
    const serverPort = (env[SERVER_PORT] || "").toString();
    const httpHost = (env["HTTP_HOST"] || "").toString();

    for (const mapping of this.mappings) {
      const path = pathInfo.toLowerCase();
      const prefix = mapping.matchPrefix;

      if (path === prefix || path.startsWith(prefix + "/") || prefix === "") {
        if (mapping.host) {
          const hostWithPort = httpHost || `${serverName}:${serverPort}`;
          if (
            !this.isCasecmp(hostWithPort, mapping.host) &&
            !this.isCasecmp(serverName, mapping.host)
          )
            continue;
        }

        const rest = pathInfo.substring(mapping.location.length);
        const newEnv = {
          ...env,
          [SCRIPT_NAME]: scriptName + mapping.location,
          [PATH_INFO]: rest,
        };
        return mapping.app(newEnv);
      }
    }

    return [
      404,
      { "content-type": "text/plain", "content-length": "9", "x-cascade": "pass" },
      ["Not Found"],
    ];
  }

  /** @internal */
  private isCasecmp(v1: string | null | undefined, v2: string | null | undefined): boolean {
    if (v1 === v2) return true;
    if (v1 == null || v2 == null) return false;
    return v1.toLowerCase() === v2.toLowerCase();
  }
}
