import { Concern, cattrAccessor, extend } from "@blazetrails/activesupport";
import type { InboundEmail } from "./inbound-email.js";
import { Router } from "./router.js";

interface RoutingHost {
  router: Router;
}

export const ClassMethods = {
  routing(this: RoutingHost, routes: Parameters<Router["addRoutes"]>[0]): void {
    this.router.addRoutes(routes);
  },

  async route(this: RoutingHost, inboundEmail: InboundEmail): Promise<unknown> {
    return await this.router.route(inboundEmail);
  },

  async mailboxFor(this: RoutingHost, inboundEmail: InboundEmail): Promise<unknown> {
    return await this.router.mailboxFor(inboundEmail);
  },
};

export const Routing = { ClassMethods };
extend(Routing, Concern);
Concern.included.call(Routing as never, null, function (this: object) {
  cattrAccessor.call(this, "router", { default: new Router() });
});
