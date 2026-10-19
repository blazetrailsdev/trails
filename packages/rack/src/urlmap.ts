import {
  CONTENT_TYPE,
  HTTP_HOST,
  PATH_INFO,
  SCRIPT_NAME,
  SERVER_NAME,
  SERVER_PORT,
} from "./constants.js";
import { ArgumentError, rbFSend, regexpEscape } from "@blazetrails/ruby-compat";
import type { RackApp } from "./mock-request.js";

type Mapping = [string | null, string, RegExp, RackApp | { call: RackApp }];

export class URLMap {
  private knownHosts!: Set<string>;
  private mapping!: Mapping[];

  constructor(map: Record<string, RackApp | { call: RackApp }> = {}) {
    this.remap(map);
  }

  remap(map: Record<string, RackApp | { call: RackApp }>): void {
    this.knownHosts = new Set();
    this.mapping = Object.entries(map)
      .map(([location, app]): Mapping => {
        let host: string | null;
        const m = /^https?:\/\/(.*?)(\/.*)/s.exec(location);
        if (m) {
          [host, location] = [m[1], m[2]];
          this.knownHosts.add(host);
        } else {
          host = null;
        }

        if (location[0] !== "/") {
          throw new ArgumentError("paths need to start with /");
        }

        location = location.endsWith("/") ? location.slice(0, -1) : location;
        const match = new RegExp(`^${regexpEscape(location).replace(/\//g, "/+")}(.*)`, "s");

        return [host, location, match, app];
      })
      .sort(([hostA, locationA], [hostB, locationB]) => {
        const a = hostA ? -hostA.length : Infinity;
        const b = hostB ? -hostB.length : Infinity;
        return a === b ? locationB.length - locationA.length : a < b ? -1 : 1;
      });
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string | string[]>, any]> {
    const path = env[PATH_INFO];
    const scriptName = env[SCRIPT_NAME];
    const httpHost = env[HTTP_HOST];
    const serverName = env[SERVER_NAME];
    const serverPort = env[SERVER_PORT];

    try {
      const isSameServer =
        this.isCasecmp(httpHost, serverName) ||
        this.isCasecmp(httpHost, `${serverName}:${serverPort}`);

      const isHostKnown = this.knownHosts.has(httpHost);

      for (const [host, location, match, app] of this.mapping) {
        if (
          !(
            this.isCasecmp(httpHost, host) ||
            this.isCasecmp(serverName, host) ||
            (!host && isSameServer) ||
            (!host && !isHostKnown)
          )
        ) {
          continue;
        }

        const m = match.exec(path == null ? "" : String(path));
        if (!m) continue;

        const rest = m[1];
        if (!(!rest || rest.length === 0 || rest[0] === "/")) continue;

        env[SCRIPT_NAME] = scriptName + location;
        env[PATH_INFO] = rest;

        return await (rbFSend(app, "call", env) as ReturnType<RackApp>);
      }

      return [404, { [CONTENT_TYPE]: "text/plain", "x-cascade": "pass" }, [`Not Found: ${path}`]];
    } finally {
      env[PATH_INFO] = path;
      env[SCRIPT_NAME] = scriptName;
    }
  }

  /** @internal */
  private isCasecmp(v1: string | null | undefined, v2: string | null | undefined): boolean {
    if (v1 === v2) return true;

    if (v1 == null) return false;
    if (v2 == null) return false;

    return v1.toLowerCase() === v2.toLowerCase();
  }
}
