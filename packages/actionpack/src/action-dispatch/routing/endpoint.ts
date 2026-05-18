/**
 * Port of ActionDispatch::Routing::Endpoint
 * (Rails actionpack/lib/action_dispatch/routing/endpoint.rb)
 *
 * Base class for objects that can serve as the terminating end of a route:
 * dispatchers (controller#action), redirects, and mounted Rack apps. Subclasses
 * override the predicates (`dispatcher`, `redirect`, `engine`) and `matches`
 * to participate in route matching.
 */

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
