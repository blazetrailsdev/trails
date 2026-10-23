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

describe("ActionView::Rendering::ClassMethods#eager_load!", () => {
  it("calls super, then builds the view context class", () => {
    class EagerController extends ActionController.Base {}
    const klass = EagerController as unknown as {
      eagerLoadBang(): null;
      _actionMethodCache?: unknown;
      _viewContextClass?: unknown;
    };
    expect(klass.eagerLoadBang()).toBeNull();
    expect(Object.hasOwn(klass, "_actionMethodCache")).toBe(true);
    expect(Object.hasOwn(klass, "_viewContextClass")).toBe(true);
  });
});
