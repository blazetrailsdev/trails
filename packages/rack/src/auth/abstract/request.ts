import { Request } from "../../request.js";

const AUTHORIZATION_KEYS = ["HTTP_AUTHORIZATION", "X-HTTP_AUTHORIZATION", "X_HTTP_AUTHORIZATION"];

export class AbstractRequest {
  protected env: Record<string, any>;
  private _request?: Request;
  private _authKey: string | null | undefined;
  private _parts?: [string, string];
  private _scheme?: string;
  private _params?: string;

  constructor(env: Record<string, any>) {
    this.env = env;
  }

  get request(): Request {
    this._request ??= new Request(this.env);
    return this._request;
  }

  provided(): boolean {
    return this.authorizationKey() !== null && this.valid();
  }

  valid(): boolean {
    const key = this.authorizationKey();
    return key !== null && this.env[key!] != null;
  }

  parts(): [string, string] {
    if (!this._parts) {
      const key = this.authorizationKey();
      const raw: string = key ? (this.env[key] ?? "") : "";
      const idx = raw.indexOf(" ");
      this._parts = idx === -1 ? [raw, ""] : [raw.slice(0, idx), raw.slice(idx + 1)];
    }
    return this._parts;
  }

  scheme(): string | undefined {
    this._scheme ??= this.parts()[0]?.toLowerCase();
    return this._scheme;
  }

  params(): string {
    this._params ??= this.parts()[1] ?? "";
    return this._params;
  }

  private authorizationKey(): string | null {
    if (this._authKey === undefined) {
      this._authKey =
        AUTHORIZATION_KEYS.find((k) => Object.prototype.hasOwnProperty.call(this.env, k)) ?? null;
    }
    return this._authKey;
  }
}
