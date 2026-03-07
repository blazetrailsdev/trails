import type { RackApp } from "./mock-request.js";

export class AuthBasic {
  private app: RackApp;
  realm: string;
  private authenticator: (username: string, password: string) => boolean | Promise<boolean>;

  constructor(app: RackApp, realmOrAuth?: string | ((u: string, p: string) => boolean | Promise<boolean>), authenticator?: (u: string, p: string) => boolean | Promise<boolean>) {
    this.app = app;
    if (typeof realmOrAuth === "function") {
      this.realm = "Restricted Area";
      this.authenticator = realmOrAuth;
    } else {
      this.realm = realmOrAuth || "Restricted Area";
      this.authenticator = authenticator || (() => false);
    }
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    const auth = env["HTTP_AUTHORIZATION"];

    if (auth == null) {
      return this.unauthorized();
    }

    if (!auth || !auth.startsWith("Basic ")) {
      return [400, { "content-type": "text/plain" }, ["Bad Request"]];
    }

    let decoded: string;
    try {
      decoded = Buffer.from(auth.substring(6).trim(), "base64").toString("utf-8");
    } catch {
      return [400, { "content-type": "text/plain" }, ["Bad Request"]];
    }

    if (!decoded.includes(":")) {
      return [400, { "content-type": "text/plain" }, ["Bad Request"]];
    }

    const [username, ...rest] = decoded.split(":");
    const password = rest.join(":");

    if (await this.authenticator(username, password)) {
      env["REMOTE_USER"] = username;
      return this.app(env);
    }

    return this.unauthorized();
  }

  private unauthorized(): [number, Record<string, string>, any] {
    return [
      401,
      {
        "content-type": "text/plain",
        "www-authenticate": `Basic realm="${this.realm}"`,
      },
      [],
    ];
  }
}
