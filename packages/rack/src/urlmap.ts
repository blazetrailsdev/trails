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

  constructor(map: Record<string, RackApp>) {
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
    // Sort by specificity (longest host first, then longest path first)
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
          const hostLower = hostWithPort.toLowerCase();
          const serverLower = serverName.toLowerCase();
          if (hostLower !== mapping.host && serverLower !== mapping.host) continue;
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

    return [404, { "content-type": "text/plain", "content-length": "9", "x-cascade": "pass" }, ["Not Found"]];
  }
}
