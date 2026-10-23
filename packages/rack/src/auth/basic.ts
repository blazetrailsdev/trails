import type { RackApp } from "../mock-request.js";
import type { RackHeaders } from "../index.js";
import { rbFSend } from "@blazetrails/ruby-compat";
import { AbstractHandler } from "./abstract/handler.js";
import { AbstractRequest } from "./abstract/request.js";

export class Basic extends AbstractHandler {
  declare static Request: typeof Request;

  async call(env: Record<string, any>): Promise<[number, RackHeaders, any]> {
    const auth = new Basic.Request(env);

    if (!auth.provided()) return this.unauthorized();

    if (!auth.basic()) return this.badRequest();

    if (await this.isValid(auth)) {
      env["REMOTE_USER"] = auth.username();

      return rbFSend(this.app, "call", env) as ReturnType<RackApp>;
    }

    return this.unauthorized();
  }

  /** @internal */
  protected challenge(): string {
    return `Basic realm="${this.realm}"`;
  }

  /** @internal */
  private isValid(auth: Request): boolean | Promise<boolean> {
    return this.authenticator(...auth.credentials());
  }
}

export class Request extends AbstractRequest {
  private _credentials?: string[];

  basic(): boolean {
    return "basic" === this.scheme() && this.credentials().length === 2;
  }

  credentials(): string[] {
    if (!this._credentials) {
      const decoded = Buffer.from(this.params(), "base64").toString("utf-8");
      const idx = decoded.indexOf(":");
      this._credentials = idx === -1 ? [decoded] : [decoded.slice(0, idx), decoded.slice(idx + 1)];
    }
    return this._credentials;
  }

  username(): string {
    return this.credentials()[0];
  }
}

Basic.Request = Request;
