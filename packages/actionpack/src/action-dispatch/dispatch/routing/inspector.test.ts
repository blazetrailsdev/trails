import { describe, it, expect, beforeEach } from "vitest";
import { Mapper } from "../../routing/mapper.js";
import { RouteSet } from "../../routing/route-set.js";
import { ConsoleFormatter, RoutesFormatter, RoutesInspector } from "../../routing/inspector.js";

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

  it.skip("displaying routes for engines", () => {});

  it.skip("displaying routes for engines without routes", () => {});

  it("cart inspect", () => {
    const output = draw((r) => {
      r.get("/cart", { to: "cart#show" });
    });
    expect(output).toEqual([
      "Prefix Verb URI Pattern     Controller#Action",
      "  cart GET  /cart(.:format) cart#show",
    ]);
  });

  it.skip("articles inspect with multiple verbs", () => {});

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

  it.skip("inspect routes shows dynamic action route", () => {});

  it.skip("inspect routes shows controller and action only route", () => {});

  it.skip("inspect routes shows controller and action route with constraints", () => {});

  it.skip("rails routes shows route with defaults", () => {});

  it.skip("rails routes shows route with constraints", () => {});

  it.skip("rails routes shows routes with dashes", () => {});

  it.skip("rails routes shows route with rack app", () => {});

  it.skip("rails routes shows named route with mounted rack app", () => {});

  it.skip("rails routes shows overridden named route with mounted rack app with name", () => {});

  it.skip("rails routes shows route with rack app nested with dynamic constraints", () => {});

  it.skip("rails routes dont show app mounted in assets prefix", () => {});

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

  it.skip("redirect", () => {});

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

  it.skip("routes when expanded", () => {});

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

  it.skip("routes can be filtered with namespaced controllers", () => {});

  it.skip("regression route with controller regexp", () => {});

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

  it.skip("displaying routes for internal engines", () => {});

  it.skip("route with proc handler", () => {});

  it("digit-leading path segment does not produce an inferred name", () => {
    const output = draw((r) => {
      r.get("/123", { to: "pages#show" });
    });
    expect(output[1]).toMatch(/^\s+GET\s/);
  });

  it("explicit as:'' does not trigger path-based name inference", () => {
    const output = draw((r) => {
      r.get("/health", { to: "health#show", as: "" });
    });
    expect(output[1]).toMatch(/^\s+GET\s/);
  });

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
