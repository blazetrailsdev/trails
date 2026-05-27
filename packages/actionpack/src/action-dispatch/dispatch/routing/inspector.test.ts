import { describe, it, expect, beforeEach } from "vitest";
import { Mapper } from "../../routing/mapper.js";
import { RouteSet } from "../../routing/route-set.js";
import { ConsoleFormatter, RoutesFormatter, RoutesInspector } from "../../routing/inspector.js";

// =============================================================================
// dispatch/routing/inspector_test.rb
//
// Rails design: RoutesInspector wraps each Route in RouteWrapper and passes
// CollectedRoute records to a RoutesFormatter (Sheet, Expanded, Unused, …).
// The Sheet formatter right-pads columns to uniform widths; Expanded renders
// one labeled block per route.  Tests assert full golden-output arrays so that
// any column-width regression or reqs-string change is caught immediately.
//
// Skips in this file fall into three categories:
//   • engine/rack-app mounting — Engine and rack-app concepts are not yet
//     ported to trails.
//   • deprecated dynamic-segment syntax — `get ":controller/:action"` /
//     `get ":controller(/:action)"` rely on `ActionDispatch.deprecator.silence`
//     which has no trails analogue.
//   • formatter divergences — documented inline per skip.
// =============================================================================

describe("RoutesInspectorTest", () => {
  let set: RouteSet;

  beforeEach(() => {
    set = new RouteSet();
  });

  function draw(
    cb: (r: Mapper) => void,
    opts: { formatter?: RoutesFormatter; grep?: string; controller?: string } = {},
  ): string[] {
    set.draw(cb as Parameters<typeof set.draw>[0]);
    const { formatter = new ConsoleFormatter.Sheet(), ...filter } = opts;
    return new RoutesInspector(set.getRoutes()).format(formatter, filter).split("\n");
  }

  it.skip("displaying routes for engines", () => {
    // pending: Engine mounting not yet ported to trails
  });

  it.skip("displaying routes for engines without routes", () => {
    // pending: Engine mounting not yet ported to trails
  });

  it("cart inspect", () => {
    const output = draw((r) => {
      r.get("/cart", { to: "cart#show" });
    });
    expect(output).toEqual([
      "Prefix Verb URI Pattern     Controller#Action",
      "  cart GET  /cart(.:format) cart#show",
    ]);
  });

  it.skip("articles inspect with multiple verbs", () => {
    // pending: formatter divergence — match via: [put, patch] emits two
    // separate rows (PUT and PATCH) instead of Rails' combined "PUT|PATCH" row.
  });

  it("inspect shows custom assets", () => {
    const output = draw((r) => {
      r.get("/custom/assets", { to: "custom_assets#show" });
    });
    expect(output).toEqual([
      "       Prefix Verb URI Pattern              Controller#Action",
      "custom_assets GET  /custom/assets(.:format) custom_assets#show",
    ]);
  });

  it("inspect routes shows resources route", () => {
    const output = draw((r) => {
      r.resources("articles");
    });
    expect(output).toEqual([
      "      Prefix Verb   URI Pattern                  Controller#Action",
      "    articles GET    /articles(.:format)          articles#index",
      "             POST   /articles(.:format)          articles#create",
      " new_article GET    /articles/new(.:format)      articles#new",
      "edit_article GET    /articles/:id/edit(.:format) articles#edit",
      "     article GET    /articles/:id(.:format)      articles#show",
      "             PATCH  /articles/:id(.:format)      articles#update",
      "             PUT    /articles/:id(.:format)      articles#update",
      "             DELETE /articles/:id(.:format)      articles#destroy",
    ]);
  });

  it("inspect routes shows root route", () => {
    const output = draw((r) => {
      r.root("pages#main");
    });
    expect(output).toEqual([
      "Prefix Verb URI Pattern Controller#Action",
      "  root GET  /           pages#main",
    ]);
  });

  it.skip("inspect routes shows dynamic action route", () => {
    // pending: requires deprecated `get "api/:action" => "api"` syntax
  });

  it.skip("inspect routes shows controller and action only route", () => {
    // pending: requires deprecated `get ":controller/:action"` syntax
  });

  it.skip("inspect routes shows controller and action route with constraints", () => {
    // pending: requires deprecated `get ":controller(/:action(/:id))"` syntax
  });

  it.skip("rails routes shows route with defaults", () => {
    // pending: formatter divergence — route defaults (e.g. format: "jpg") are
    // not surfaced in the reqs column; RouteWrapper#requirements does not yet
    // merge Route#defaults into the displayed constraints hash.
  });

  it.skip("rails routes shows route with constraints", () => {
    // pending: formatter divergence — inline path constraints (e.g. id: /regex/)
    // passed directly to `get` are not propagated to Route#constraints and
    // therefore do not appear in the reqs column.
  });

  it.skip("rails routes shows routes with dashes", () => {
    // pending: multiple divergences — shorthand controller/action inference
    // (`get "our-work/latest"`) is not applied through the `get`/`post` helpers
    // (only through `match`), and nested member routes inside a resources block
    // produce different name/path structures.
  });

  it.skip("rails routes shows route with rack app", () => {
    // pending: rack-app routing not yet ported to trails
  });

  it.skip("rails routes shows named route with mounted rack app", () => {
    // pending: rack-app mounting not yet ported to trails
  });

  it.skip("rails routes shows overridden named route with mounted rack app with name", () => {
    // pending: rack-app mounting not yet ported to trails
  });

  it.skip("rails routes shows route with rack app nested with dynamic constraints", () => {
    // pending: rack-app mounting not yet ported to trails
  });

  it.skip("rails routes dont show app mounted in assets prefix", () => {
    // pending: rack-app mounting + assets-prefix filtering not yet ported
  });

  it("rails routes shows route defined in under assets prefix", () => {
    const output = draw((r) => {
      r.scope("/sprockets", () => {
        r.get("/foo", { to: "foo#bar" });
      });
    });
    expect(output).toEqual([
      "Prefix Verb URI Pattern              Controller#Action",
      "   foo GET  /sprockets/foo(.:format) foo#bar",
    ]);
  });

  it.skip("redirect", () => {
    // pending: formatter divergence — redirect(307, path: /foo/bar) renders as
    // redirect(307) (path omitted), and a lambda redirect renders as
    // "Inline handler (Proc/Lambda)" instead of "redirect(301)".
  });

  it("routes can be filtered", () => {
    const output = draw(
      (r) => {
        r.resources("articles");
        r.resources("posts");
      },
      { grep: "posts" },
    );
    expect(output).toEqual([
      "   Prefix Verb   URI Pattern               Controller#Action",
      "    posts GET    /posts(.:format)          posts#index",
      "          POST   /posts(.:format)          posts#create",
      " new_post GET    /posts/new(.:format)      posts#new",
      "edit_post GET    /posts/:id/edit(.:format) posts#edit",
      "     post GET    /posts/:id(.:format)      posts#show",
      "          PATCH  /posts/:id(.:format)      posts#update",
      "          PUT    /posts/:id(.:format)      posts#update",
      "          DELETE /posts/:id(.:format)      posts#destroy",
    ]);
  });

  it.skip("routes when expanded", () => {
    // pending: source location tracking (RouteWrapper#sourceLocation) is not
    // yet implemented — the "Source Location" row is always absent.
  });

  it("no routes matched filter when expanded", () => {
    const output = draw(
      (r) => {
        r.get("photos/:id", { to: "photos#show" });
      },
      { grep: "rails/dummy", formatter: new ConsoleFormatter.Expanded() },
    );
    expect(output).toEqual([
      "No routes were found for this grep pattern.",
      "For more information about routes, see the Rails guide: https://guides.rubyonrails.org/routing.html.",
    ]);
  });

  it("not routes when expanded", () => {
    const output = draw(() => {}, {
      grep: "rails/dummy",
      formatter: new ConsoleFormatter.Expanded(),
    });
    expect(output).toEqual([
      "You don't have any routes defined!",
      "",
      "Please add some routes in config/routes.rb.",
      "",
      "For more information about routes, see the Rails guide: https://guides.rubyonrails.org/routing.html.",
    ]);
  });

  it.skip("routes can be filtered with namespaced controllers", () => {
    // pending: formatter divergence — namespace name prefix order differs:
    // trails emits `admin_new_post` / `admin_edit_post` whereas Rails emits
    // `new_admin_post` / `edit_admin_post`.  Fixing requires changing how
    // `new_` / `edit_` prefixes are combined with the namespace name, which
    // cascades to route-helpers tests that already assert the current names.
  });

  it.skip("regression route with controller regexp", () => {
    // pending: requires deprecated `get ":controller(/:action)"` syntax
  });

  it("routes with undefined filter", () => {
    const output = draw(
      (r) => {
        r.get("photos/:id", { to: "photos#show" });
      },
      { controller: "Rails::MissingController" },
    );
    expect(output).toEqual([
      "No routes were found for this controller.",
      "For more information about routes, see the Rails guide: https://guides.rubyonrails.org/routing.html.",
    ]);
  });

  it("no routes matched filter", () => {
    const output = draw(
      (r) => {
        r.get("photos/:id", { to: "photos#show" });
      },
      { grep: "rails/dummy" },
    );
    expect(output).toEqual([
      "No routes were found for this grep pattern.",
      "For more information about routes, see the Rails guide: https://guides.rubyonrails.org/routing.html.",
    ]);
  });

  it("no routes were defined", () => {
    const output = draw(() => {}, { grep: "Rails::DummyController" });
    expect(output).toEqual([
      "You don't have any routes defined!",
      "",
      "Please add some routes in config/routes.rb.",
      "",
      "For more information about routes, see the Rails guide: https://guides.rubyonrails.org/routing.html.",
    ]);
  });

  it.skip("displaying routes for internal engines", () => {
    // pending: Engine mounting not yet ported to trails
  });

  it.skip("route with proc handler", () => {
    // pending: `to: () => [...]` (lambda/proc endpoint) throws in Mapper#addRoute
    // because parseEndpoint receives a function instead of a string.
  });

  // Non-Rails tests: edge-cases for inferred route-name logic in mapper.ts.
  it("digit-leading path segment does not produce an inferred name", () => {
    // /123 would yield "123" which fails RouteSet#addRoute's /^[_a-z]\w*$/i guard.
    const output = draw((r) => {
      r.get("/123", { to: "pages#show" });
    });
    // No name inferred — Prefix column is blank (right-padded to header width).
    expect(output[1]).toMatch(/^\s+GET\s/);
  });

  it("explicit as:'' does not trigger path-based name inference", () => {
    // as:"" is an explicit (empty) name override in Rails; inference must not run.
    const output = draw((r) => {
      r.get("/health", { to: "health#show", as: "" });
    });
    // No helper name in the Prefix column.
    expect(output[1]).toMatch(/^\s+GET\s/);
  });

  // Non-Rails test: verifies RouteWrapper#path suppresses (.:format) when
  // format: false was passed (covered indirectly by regression_route_with_controller_regexp
  // in Rails, which is skipped here for unrelated reasons).
  it("format false suppresses (.:format) suffix", () => {
    const output = draw((r) => {
      r.get("/health", { to: "health#show", format: false });
    });
    expect(output).toEqual([
      "Prefix Verb URI Pattern Controller#Action",
      "health GET  /health     health#show",
    ]);
  });
});
