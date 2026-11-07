import { StandardError } from "@blazetrails/ruby-compat";
import { ActionMailbox } from "./action-mailbox.js";
import type { InboundEmail } from "./inbound-email.js";
import { Route, type RouteAddress } from "./router/route.js";

class RoutingError extends StandardError {}

interface Mailbox {
  receive(inboundEmail: InboundEmail): unknown;
}

export class Router {
  static RoutingError = RoutingError;
  static Route = Route;

  /** @internal */
  private readonly routes: Route[];

  constructor() {
    this.routes = [];
  }

  addRoutes(routes: Iterable<[RouteAddress, string]> | Record<string, string>): void {
    const entries = Symbol.iterator in routes ? routes : Object.entries(routes);
    for (const [address, mailboxName] of entries) {
      this.addRoute(address, { to: mailboxName });
    }
  }

  addRoute(address: RouteAddress, { to }: { to: string }): void {
    this.routes.push(new Route(address, { to: to }));
  }

  async route(inboundEmail: InboundEmail): Promise<unknown> {
    const mailbox = (await this.mailboxFor(inboundEmail)) as Mailbox | null;
    if (mailbox != null) {
      return await mailbox.receive(inboundEmail);
    } else {
      await inboundEmail.bouncedBang();

      throw new RoutingError();
    }
  }

  async mailboxFor(inboundEmail: InboundEmail): Promise<unknown> {
    for (const route of this.routes) {
      const match = await route.isMatch(inboundEmail);
      if (match != null && match !== false) {
        return route.mailboxClass();
      }
    }
    return null;
  }
}

ActionMailbox.Router = Router;
