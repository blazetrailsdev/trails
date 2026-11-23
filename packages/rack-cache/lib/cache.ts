import { Rack } from "@blazetrails/rack";
import * as Cache from "./cache.js";

import { Context } from "./context.js";

export { CacheControl } from "./cache-control.js";
export { EntityStore } from "./entity-store.js";
export { Headers } from "./headers.js";
export { Key } from "./key.js";
export { MetaStore } from "./meta-store.js";
export { Options } from "./options.js";
export { Context };
export { Request } from "./request.js";
export { Response } from "./response.js";
export { Storage } from "./storage.js";

Rack.Cache = Cache;

function _new(
  backend: unknown,
  options: Record<string, unknown> = {},
  b?: (context: Context) => void,
): Context {
  return new Context(backend, options, b);
}
export { _new as new };
