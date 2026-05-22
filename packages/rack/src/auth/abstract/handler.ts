import { CONTENT_LENGTH, CONTENT_TYPE } from "../../constants.js";
import type { RackApp } from "../../mock-request.js";

export class AbstractHandler {
  realm: string;
  protected app: RackApp;
  protected authenticator: (...args: any[]) => boolean | Promise<boolean>;

  constructor(
    app: RackApp,
    realm?: string,
    authenticator?: (...args: any[]) => boolean | Promise<boolean>,
  ) {
    this.app = app;
    this.realm = realm ?? "";
    this.authenticator = authenticator ?? (() => false);
  }

  protected challenge(): string {
    return "";
  }

  protected unauthorized(
    wwwAuthenticate = this.challenge(),
  ): [number, Record<string, string>, any] {
    return [
      401,
      { [CONTENT_TYPE]: "text/plain", [CONTENT_LENGTH]: "0", "www-authenticate": wwwAuthenticate },
      [],
    ];
  }

  protected badRequest(): [number, Record<string, string>, any] {
    return [400, { [CONTENT_TYPE]: "text/plain", [CONTENT_LENGTH]: "0" }, []];
  }
}
