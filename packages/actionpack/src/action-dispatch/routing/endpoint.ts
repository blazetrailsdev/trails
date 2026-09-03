import type { Request } from "../http/request.js";

/** @internal */
export class Endpoint {
  dispatcher(): boolean {
    return false;
  }

  redirect(): boolean {
    return false;
  }

  matches(_req: Request): boolean {
    return true;
  }

  app(): unknown {
    return this;
  }

  rackApp(): unknown {
    return this.app();
  }

  engine(): boolean {
    return false;
  }
}
