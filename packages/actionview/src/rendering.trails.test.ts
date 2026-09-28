import { describe, expect, it } from "vitest";
import {
  AbstractController,
  ActionController,
  Request,
  Response,
  RouteSet,
  UrlFor,
} from "@blazetrails/actionpack";
import { include } from "@blazetrails/ruby-compat";
import { RoutingUrlFor } from "./routing-url-for.js";

include(RoutingUrlFor as unknown as new (...args: never[]) => unknown, UrlFor);

describe("ActionView::Rendering::ClassMethods#build_view_context_class", () => {
  it("includes RoutingUrlFor through routes.url_helpers' UrlFor included hook", async () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/other", { to: "foo#other" });
    });
    class FooController extends ActionController.Base {
      async other(): Promise<void> {
        await this.render({ plain: "" });
      }
    }
    AbstractController.withRoutesHelpers(routes as never)(FooController as never);
    const controller = new FooController();
    await controller.dispatch(
      "other",
      new Request({ REQUEST_METHOD: "GET", PATH_INFO: "/other", HTTP_HOST: "example.com" }),
      new Response(),
    );

    const view = controller.viewContext() as unknown as {
      urlFor(options?: unknown): string;
    };

    expect(view.urlFor).toBe(RoutingUrlFor.prototype.urlFor);
    expect(view.urlFor({ controller: "foo", action: "other" })).toBe("/other");
  });
});
