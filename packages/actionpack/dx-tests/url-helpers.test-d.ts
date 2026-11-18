import { describe, it, expectTypeOf } from "vitest";
import { RouteSet } from "@blazetrails/actionpack";

const routes = new RouteSet();
routes.draw(function () {
  this.resources("posts");
  this.get("/about", { to: "pages#about", as: "about" });
});

describe("ActionDispatch::Routing::RouteSet url helpers", () => {
  const helpers = routes.urlHelpers();

  it("a named _url helper answers a string", () => {
    expectTypeOf(helpers.postsUrl()).toEqualTypeOf<string>();
    expectTypeOf(helpers.aboutUrl).toBeFunction();
  });

  it("url_for answers a string", () => {
    expectTypeOf(helpers.urlFor({ controller: "posts", action: "index" })).toEqualTypeOf<string>();
  });

  it("route_set path_for answers a string", () => {
    expectTypeOf(routes.pathFor({ controller: "posts", action: "index" })).toEqualTypeOf<string>();
  });
});
