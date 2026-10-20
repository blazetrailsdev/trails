import "./test-helpers/abstract-unit.js";
import { describe, expect, it } from "vitest";
import {
  AbstractController,
  ActionController,
  Request,
  Response,
  RouteSet,
} from "@blazetrails/actionpack";
import { urlFor } from "./routing-url-for.js";

describe("ActionView::Rendering::ClassMethods#build_view_context_class", () => {
  it("includes RoutingUrlFor through routes.url_helpers' UrlFor included hook", async () => {
    const routes = new RouteSet();
    routes.draw(function () {
      this.get("/other", { to: "foo#other" });
    });
    class FooController extends ActionController.Base {
      async other(): Promise<void> {
        await this.render({ plain: "" });
      }
    }
    AbstractController.Trailties.RoutesHelpers.with(routes as never)(FooController as never);
    const controller = new FooController();
    await controller.dispatch(
      "other",
      new Request({ REQUEST_METHOD: "GET", PATH_INFO: "/other", HTTP_HOST: "example.com" }),
      new Response(),
    );

    const view = controller.viewContext() as unknown as {
      urlFor(options?: unknown): string;
    };

    expect(view.urlFor).toBe(urlFor);
    expect(view.urlFor({ controller: "foo", action: "other" })).toBe("/other");
  });
});
