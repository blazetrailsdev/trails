import { Request as RackRequest } from "@blazetrails/rack";
import { CacheControl } from "./cache-control.js";

export class Request extends RackRequest {
  /** @internal */
  private _cacheControl: CacheControl | undefined;

  override get requestMethod(): string {
    return this.env["REQUEST_METHOD"];
  }

  get cacheControl(): CacheControl {
    return (this._cacheControl ??= new CacheControl(this.env["HTTP_CACHE_CONTROL"]));
  }

  isNoCache(): string | boolean | undefined {
    return this.cacheControl.get("no-cache") ?? this.env["HTTP_PRAGMA"] === "no-cache";
  }
}
