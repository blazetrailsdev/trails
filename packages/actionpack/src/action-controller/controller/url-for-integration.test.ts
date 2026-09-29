/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging --
   Ruby `include RoutingTestHelpers` / `include ActionDispatch::RoutingVerbs`; the class/interface
   merge is how `include()` surfaces those members on the type side. */
import { beforeEach, describe, expect, it } from "vitest";
import { include, type Included } from "@blazetrails/activesupport";
import { rbInspect, URI } from "@blazetrails/ruby-compat";

import type { Base } from "../base.js";
import { deprecator } from "../../action-dispatch/deprecator.js";
import type { Mapper } from "../../action-dispatch/routing/mapper.js";
import type { RouteSet } from "../../action-dispatch/routing/route-set.js";
import { RoutingTestHelpers, RoutingVerbs } from "../../test-helpers/abstract-unit.js";

class Model {
  constructor(private readonly _toParam: unknown) {}

  toParam(): unknown {
    return this._toParam;
  }
}

const Mapping = (r: Mapper) => {
  r.namespace("admin", () => {
    r.resources("users");
    r.resources("posts");
  });

  r.namespace("api", () => {
    r.root({ to: "users#index" });
  });

  r.get("/blog(/:year(/:month(/:day)))", {
    to: "posts#show_date",
    constraints: {
      year: /(19|20)\d\d/,
      month: /[01]?\d/,
      day: /[0-3]?\d/,
    },
    day: null,
    month: null,
  });

  r.get("archive/:year", {
    controller: "archive",
    action: "index",
    defaults: { year: null },
    constraints: { year: /\d{4}/ },
    as: "blog",
  });

  r.resources("people");

  r.get("symbols", { controller: "symbols", action: "show", name: "as_symbol" });
  r.get("id_default(/:id)", { to: "foo#id_default", id: 1 });
  r.match("get_or_post", { to: "foo#get_or_post", via: ["get", "post"] });
  r.get("optional/:optional", { to: "posts#index" });
  r.get("projects/:project_id", { to: "project#index", as: "project" });
  r.get("clients", { to: "projects#index" });

  r.get("ignorecase/geocode/:postalcode", {
    to: "geocode#show",
    postalcode: /hx\d\d-\d[a-z]{2}/i,
  });
  r.get("extended/geocode/:postalcode", {
    to: "geocode#show",
    constraints: {
      postalcode: /\d{5}(-\d{4})?/,
    },
    as: "geocode",
  });

  r.get("news(.:format)", { to: "news#index" });

  deprecator().silence(() => {
    r.get("comment/:id(/:action)", { to: "comments#show" });
    r.get("ws/:controller(/:action(/:id))", { ws: true });
    r.get("account(/:action)", { to: "account#subscription" });
    r.get("pages/:page_id/:controller(/:action(/:id))");
    r.get(":controller/ping", { action: "ping" });
    r.get(":controller(/:action(/:id))(.:format)");
  });

  r.root({ to: "news#index" });
};

class URLForIntegrationTest {
  routes!: RouteSet;
  controller: Base | null = null;
}
interface URLForIntegrationTest
  extends Included<typeof RoutingTestHelpers>, Included<typeof RoutingVerbs> {}
include(URLForIntegrationTest, RoutingTestHelpers);
include(URLForIntegrationTest, RoutingVerbs);

type Params = [Record<string, unknown>, Record<string, unknown>?, string?];

// prettier-ignore
const TABLE: [string, Params][] = [
  ["/admin/users", [{ useRoute: "admin_users" }]],
  ["/admin/users", [{ controller: "admin/users" }]],
  ["/admin/users", [{ controller: "admin/users", action: "index" }]],
  ["/admin/users", [{ action: "index" }, { controller: "admin/users", action: "index" }, "/admin/users"]],
  ["/admin/users", [{ controller: "users", action: "index" }, { controller: "admin/accounts", action: "show", id: "1" }, "/admin/accounts/show/1"]],
  ["/people", [{ controller: "/people", action: "index" }, { controller: "admin/accounts", action: "foo", id: "bar" }, "/admin/accounts/foo/bar"]],

  ["/admin/posts", [{ controller: "admin/posts" }]],
  ["/admin/posts/new", [{ controller: "admin/posts", action: "new" }]],

  ["/blog/2009", [{ controller: "posts", action: "show_date", year: 2009 }]],
  ["/blog/2009/1", [{ controller: "posts", action: "show_date", year: 2009, month: 1 }]],
  ["/blog/2009/1/1", [{ controller: "posts", action: "show_date", year: 2009, month: 1, day: 1 }]],
  ["/blog/2009/1/1", [{ controller: "posts", action: "show_date", pathParams: { year: 2009, month: 1, day: 1 } }]],
  ["/blog/2009", [{ controller: "posts", action: "show_date", year: 2009, pathParams: { year: 2024 } }]],
  ["/blog/2009", [{ controller: "posts", action: "show_date", year: 2009, pathParams: "ignores_a_string" }]],

  ["/archive/2010", [{ controller: "archive", action: "index", year: "2010" }]],
  ["/archive", [{ controller: "archive", action: "index" }]],
  ["/archive?year=january", [{ controller: "archive", action: "index", year: "january" }]],

  ["/people", [{ controller: "people", action: "index" }]],
  ["/people", [{ action: "index" }, { controller: "people", action: "index" }, "/people"]],
  ["/people", [{ action: "index" }, { controller: "people", action: "show", id: "1" }, "/people/show/1"]],
  ["/people", [{ controller: "people", action: "index" }, { controller: "people", action: "show", id: "1" }, "/people/show/1"]],
  ["/people", [{}, { controller: "people", action: "index" }, "/people"]],
  ["/people/1", [{ controller: "people", action: "show" }, { controller: "people", action: "show", id: "1" }, "/people/show/1"]],
  ["/people/new", [{ useRoute: "new_person" }]],
  ["/people/new", [{ controller: "people", action: "new" }]],
  ["/people/1", [{ useRoute: "person", id: "1" }]],
  ["/people/1", [{ controller: "people", action: "show", id: "1" }]],
  ["/people/1.xml", [{ controller: "people", action: "show", id: "1", format: "xml" }]],
  ["/people/1", [{ controller: "people", action: "show", id: 1 }]],
  ["/people/1", [{ controller: "people", action: "show", id: new Model("1") }]],
  ["/people/1", [{ action: "show", id: "1" }, { controller: "people", action: "index" }, "/people"]],
  ["/people/1", [{ action: "show", id: 1 }, { controller: "people", action: "show", id: "1" }, "/people/show/1"]],
  ["/people", [{ controller: "people", action: "index" }, { controller: "people", action: "show", id: "1" }, "/people/show/1"]],
  ["/people/1", [{}, { controller: "people", action: "show", id: "1" }, "/people/show/1"]],
  ["/people/1", [{ controller: "people", action: "show" }, { controller: "people", action: "index", id: "1" }, "/people/index/1"]],
  ["/people/1/edit", [{ controller: "people", action: "edit", id: "1" }]],
  ["/people/1/edit.xml", [{ controller: "people", action: "edit", id: "1", format: "xml" }]],
  ["/people/1/edit", [{ useRoute: "edit_person", id: "1" }]],
  ["/people/1?legacy=true", [{ controller: "people", action: "show", id: "1", legacy: "true" }]],
  ["/people?legacy=true", [{ controller: "people", action: "index", legacy: "true" }]],

  ["/id_default/2", [{ controller: "foo", action: "id_default", id: "2" }]],
  ["/id_default", [{ controller: "foo", action: "id_default", id: "1" }]],
  ["/id_default", [{ controller: "foo", action: "id_default", id: 1 }]],
  ["/id_default", [{ controller: "foo", action: "id_default" }]],
  ["/optional/bar", [{ controller: "posts", action: "index", optional: "bar" }]],
  ["/posts", [{ controller: "posts", action: "index" }]],

  ["/project", [{ controller: "project", action: "index" }]],
  ["/projects/1", [{ controller: "project", action: "index", project_id: "1" }]],
  ["/projects/1", [{ controller: "project", action: "index" }, { project_id: "1", controller: "project", action: "index" }, "/projects/1"]],
  ["/projects/1", [{ useRoute: "project", controller: "project", action: "index", project_id: "1" }]],
  ["/projects/1", [{ useRoute: "project", controller: "project", action: "index" }, { controller: "project", action: "index", project_id: "1" }, "/projects/1"]],

  ["/clients", [{ controller: "projects", action: "index" }]],
  ["/clients?project_id=1", [{ controller: "projects", action: "index", project_id: "1" }]],
  ["/clients", [{ controller: "projects", action: "index" }, { project_id: "1", controller: "project", action: "index" }, "/projects/1"]],

  ["/comment/20", [{ id: 20 }, { controller: "comments", action: "show" }, "/comments/show"]],
  ["/comment/20", [{ controller: "comments", id: 20, action: "show" }]],
  ["/comments/boo", [{ controller: "comments", action: "boo" }]],

  ["/ws/posts/show/1", [{ controller: "posts", action: "show", id: "1", ws: true }]],
  ["/ws/posts", [{ controller: "posts", action: "index", ws: true }]],

  ["/account", [{ controller: "account", action: "subscription" }]],
  ["/account/billing", [{ controller: "account", action: "billing" }]],

  ["/pages/1/notes/show/1", [{ page_id: "1", controller: "notes", action: "show", id: "1" }]],
  ["/pages/1/notes/list", [{ page_id: "1", controller: "notes", action: "list" }]],
  ["/pages/1/notes", [{ page_id: "1", controller: "notes", action: "index" }]],
  ["/pages/1/notes", [{ page_id: "1", controller: "notes" }]],
  ["/notes", [{ page_id: null, controller: "notes" }]],
  ["/notes", [{ controller: "notes" }]],
  ["/notes/print", [{ controller: "notes", action: "print" }]],
  ["/notes/print", [{}, { controller: "notes", action: "print" }, "/notes/print"]],

  ["/notes/index/1", [{ controller: "notes" }, { controller: "notes", action: "index", id: "1" }, "/notes/index/1"]],
  ["/notes/index/1", [{ controller: "notes" }, { controller: "notes", id: "1", action: "index" }, "/notes/index/1"]],
  ["/notes/index/1", [{ action: "index" }, { controller: "notes", id: "1", action: "index" }, "/notes/index/1"]],
  ["/notes/index/1", [{}, { controller: "notes", id: "1", action: "index" }, "/notes/index/1"]],
  ["/notes/show/1", [{}, { controller: "notes", action: "show", id: "1" }, "/notes/show/1"]],
  ["/posts", [{ controller: "posts" }, { controller: "notes", action: "show", id: "1" }, "/notes/show/1"]],
  ["/notes/list", [{ action: "list" }, { controller: "notes", action: "show", id: "1" }, "/notes/show/1"]],

  ["/posts/ping", [{ controller: "posts", action: "ping" }]],
  ["/posts/show/1", [{ controller: "posts", action: "show", id: "1" }]],
  ["/posts/show/1", [{ controller: "posts", action: "show", id: "1", format: "" }]],
  ["/posts", [{ controller: "posts" }]],
  ["/posts", [{ controller: "posts", action: "index" }]],
  ["/posts/create", [{ action: "create" }, { day: null, month: null, controller: "posts", action: "show_date" }, "/blog"]],
  ["/posts?foo=bar", [{ controller: "posts", foo: "bar" }]],
  ["/posts?foo%5B%5D=bar&foo%5B%5D=baz", [{ controller: "posts", foo: ["bar", "baz"] }]],
  ["/posts?page=2", [{ controller: "posts", page: 2 }]],
  ["/posts?q%5Bfoo%5D%5Ba%5D=b", [{ controller: "posts", q: { foo: { a: "b" } } }]],

  ["/news.rss", [{ controller: "news", action: "index", format: "rss" }]],
];

describe("URLForIntegrationTest", () => {
  let tc: URLForIntegrationTest;

  beforeEach(() => {
    tc = new URLForIntegrationTest();
    tc.routes = tc.makeSet(false);
    tc.routes.draw(Mapping);
  });

  for (const [i, [url, params]] of TABLE.entries()) {
    const dispatched = async () => {
      const [hash, pathParams, route] = params;
      hash.onlyPath = true;

      await tc.get(URI.parse("http://test.host" + String(route)));
      expect(tc.controller!.request.pathParameters).toEqual(pathParams);
      expect(tc.controller!.urlFor(hash), rbInspect(params)).toBe(url);
    };
    const generated = () => {
      expect(tc.urlFor(tc.routes, params[0]), rbInspect(params)).toBe(url);
    };

    it(
      `${url.replaceAll(/\W/g, "_").replaceAll("_", " ")} ${i}`,
      params.length > 1 ? dispatched : generated,
    );
  }
});
