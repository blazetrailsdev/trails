import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BacktraceCleaner, callerLocations, TopLevel } from "@blazetrails/activesupport";
import { File, rbInspect, stringSplit } from "@blazetrails/ruby-compat";
import { Engine } from "@blazetrails/trailties/engine";
import { Trailtie } from "@blazetrails/trailties/trailtie";
import { Mapper, type MountableApp } from "../../routing/mapper.js";
import { deprecator } from "../../deprecator.js";
import { RouteSet, type DrawCallback } from "../../routing/route-set.js";
import { ConsoleFormatter, RoutesFormatter, RoutesInspector } from "../../routing/inspector.js";
import { FIXTURE_LOAD_PATH } from "../../../test-helpers/abstract-unit.js";

class MountedRackApp {
  static call(_env: Record<string, unknown>): void {}
}
const mountedRackApp = MountedRackApp as unknown as MountableApp;

function engineClass(): typeof Engine & { routes(): RouteSet } {
  const engine = class extends Engine {
    static inspect(): string {
      return "Blog::Engine";
    }
  };
  Engine.register(engine, File.dirname(FIXTURE_LOAD_PATH));
  return engine as unknown as typeof Engine & { routes(): RouteSet };
}

describe("RoutesInspectorTest", () => {
  let set: RouteSet;
  let trails: typeof TopLevel.Trails;

  beforeEach(() => {
    set = new RouteSet();
    trails = TopLevel.Trails;
    TopLevel.Trails = { Engine, Trailtie } as never;
  });

  afterEach(() => {
    TopLevel.Trails = trails;
  });

  function draw(
    cb: DrawCallback,
    opts: { formatter?: RoutesFormatter; grep?: string; controller?: string } = {},
  ): string[] {
    set.draw(cb);
    const { formatter = new ConsoleFormatter.Sheet(), ...filter } = opts;
    return stringSplit(new RoutesInspector(set.routes).format(formatter, filter), "\n");
  }

  it("displaying routes for engines", () => {
    const engine = engineClass();
    engine.routes().draw(function () {
      this.get("/cart", { to: "cart#show" });
    });

    const output = draw(function () {
      this.get("/custom/assets", { to: "custom_assets#show" });
      this.mount(engine as unknown as MountableApp, { at: "/blog", as: "blog" });
    });

    expect(output).toEqual([
      "       Prefix Verb URI Pattern              Controller#Action",
      "custom_assets GET  /custom/assets(.:format) custom_assets#show",
      "         blog      /blog                    Blog::Engine",
      "",
      "Routes for Blog::Engine:",
      "  cart GET  /cart(.:format) cart#show",
    ]);
  });

  it("displaying routes for engines without routes", () => {
    const engine = engineClass();
    engine.routes().draw(function () {});

    const output = draw(function () {
      this.mount(engine as unknown as MountableApp, { at: "/blog", as: "blog" });
    });

    expect(output).toEqual([
      "Prefix Verb URI Pattern Controller#Action",
      "  blog      /blog       Blog::Engine",
      "",
      "Routes for Blog::Engine:",
    ]);
  });

  it("cart inspect", () => {
    const output = draw(function () {
      this.get("/cart", { to: "cart#show" });
    });
    expect(output).toEqual([
      "Prefix Verb URI Pattern     Controller#Action",
      "  cart GET  /cart(.:format) cart#show",
    ]);
  });

  it("articles inspect with multiple verbs", () => {
    const output = draw(function () {
      this.match("articles/:id", { to: "articles#update", via: ["put", "patch"] });
    });

    expect(output).toEqual([
      "Prefix Verb      URI Pattern             Controller#Action",
      "       PUT|PATCH /articles/:id(.:format) articles#update",
    ]);
  });

  it("inspect shows custom assets", () => {
    const output = draw(function () {
      this.get("/custom/assets", { to: "custom_assets#show" });
    });
    expect(output).toEqual([
      "       Prefix Verb URI Pattern              Controller#Action",
      "custom_assets GET  /custom/assets(.:format) custom_assets#show",
    ]);
  });

  it("inspect routes shows resources route", () => {
    const output = draw(function () {
      this.resources("articles");
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
    const output = draw(function () {
      this.root("pages#main");
    });
    expect(output).toEqual([
      "Prefix Verb URI Pattern Controller#Action",
      "  root GET  /           pages#main",
    ]);
  });

  it("inspect routes shows dynamic action route", () => {
    const output = draw(function () {
      deprecator().silence(() => {
        this.get({ "api/:action": "api" });
      });
    });

    expect(output).toEqual([
      "Prefix Verb URI Pattern            Controller#Action",
      "       GET  /api/:action(.:format) api#:action",
    ]);
  });

  it("inspect routes shows controller and action only route", () => {
    const output = draw(function () {
      deprecator().silence(() => {
        this.get(":controller/:action");
      });
    });

    expect(output).toEqual([
      "Prefix Verb URI Pattern                    Controller#Action",
      "       GET  /:controller/:action(.:format) :controller#:action",
    ]);
  });

  it("inspect routes shows controller and action route with constraints", () => {
    const output = draw(function () {
      deprecator().silence(() => {
        this.get(":controller(/:action(/:id))", { id: /\d+/ });
      });
    });

    expect(output).toEqual([
      "Prefix Verb URI Pattern                            Controller#Action",
      `       GET  /:controller(/:action(/:id))(.:format) :controller#:action ${rbInspect({ id: /\d+/ })}`,
    ]);
  });

  it("rails routes shows route with defaults", () => {
    const output = draw(function () {
      this.get({ "photos/:id": "photos#show", defaults: { format: "jpg" } });
    });

    expect(output).toEqual([
      "Prefix Verb URI Pattern           Controller#Action",
      `       GET  /photos/:id(.:format) photos#show ${rbInspect({ format: "jpg" })}`,
    ]);
  });

  it("rails routes shows route with constraints", () => {
    const output = draw(function () {
      this.get({ "photos/:id": "photos#show", id: /[A-Z]\d{5}/ });
    });

    expect(output).toEqual([
      "Prefix Verb URI Pattern           Controller#Action",
      `       GET  /photos/:id(.:format) photos#show ${rbInspect({ id: /[A-Z]\d{5}/ })}`,
    ]);
  });

  it("rails routes shows routes with dashes", () => {
    const output = draw(function () {
      this.get({ "about-us": "pages#about_us" });
      this.get("our-work/latest");

      this.resources("photos", { only: ["show"] }, () => {
        this.get("user-favorites", { on: "collection" });
        this.get("preview-photo", { on: "member" });
        this.get("summary-text");
      });
    });

    expect(output).toEqual([
      "               Prefix Verb URI Pattern                              Controller#Action",
      "             about_us GET  /about-us(.:format)                      pages#about_us",
      "      our_work_latest GET  /our-work/latest(.:format)               our_work#latest",
      "user_favorites_photos GET  /photos/user-favorites(.:format)         photos#user_favorites",
      "  preview_photo_photo GET  /photos/:id/preview-photo(.:format)      photos#preview_photo",
      "   photo_summary_text GET  /photos/:photo_id/summary-text(.:format) photos#summary_text",
      "                photo GET  /photos/:id(.:format)                    photos#show",
    ]);
  });

  it("rails routes shows route with rack app", () => {
    const output = draw(function () {
      this.get({ "foo/:id": mountedRackApp, id: /[A-Z]\d{5}/ });
    });

    expect(output).toEqual([
      "Prefix Verb URI Pattern        Controller#Action",
      `       GET  /foo/:id(.:format) MountedRackApp ${rbInspect({ id: /[A-Z]\d{5}/ })}`,
    ]);
  });

  it("rails routes shows named route with mounted rack app", () => {
    const output = draw(function () {
      this.mount(mountedRackApp, { at: "/foo" });
    });
    expect(output).toEqual([
      "          Prefix Verb URI Pattern Controller#Action",
      "mounted_rack_app      /foo        MountedRackApp",
    ]);
  });

  it("rails routes shows overridden named route with mounted rack app with name", () => {
    const output = draw(function () {
      this.mount(mountedRackApp, { at: "/foo", as: "blog" });
    });
    expect(output).toEqual([
      "Prefix Verb URI Pattern Controller#Action",
      "  blog      /foo        MountedRackApp",
    ]);
  });

  it("rails routes shows route with rack app nested with dynamic constraints", () => {
    const constraint = class {
      inspect(): string {
        return "( my custom constraint )";
      }
    };

    const output = draw(function () {
      this.scope({ constraint: new constraint() }, () => {
        this.mount(mountedRackApp, { at: "/foo" });
      });
    });

    expect(output).toEqual([
      "          Prefix Verb URI Pattern Controller#Action",
      `mounted_rack_app      /foo        MountedRackApp ${rbInspect({ constraint: new constraint() })}`,
    ]);
  });

  it("rails routes dont show app mounted in assets prefix", () => {
    const output = draw(function () {
      this.get({ "/sprockets": mountedRackApp });
    });
    expect(output[0]).not.toMatch(/MountedRackApp/);
    expect(output[0]).not.toMatch(/\/sprockets/);
  });

  it("rails routes shows route defined in under assets prefix", () => {
    const output = draw(function () {
      this.scope("/sprockets", () => {
        this.get("/foo", { to: "foo#bar" });
      });
    });
    expect(output).toEqual([
      "Prefix Verb URI Pattern              Controller#Action",
      "   foo GET  /sprockets/foo(.:format) foo#bar",
    ]);
  });

  it("redirect", () => {
    const output = draw(function () {
      this.get({ "/foo": this.redirect("/foo/bar"), constraints: { subdomain: "admin" } });
      this.get({ "/bar": this.redirect({ path: "/foo/bar", status: 307 }) });
      this.get({ "/foobar": this.redirect(() => "/foo/bar") });
    });

    expect(output).toEqual([
      "Prefix Verb URI Pattern       Controller#Action",
      `   foo GET  /foo(.:format)    redirect(301, /foo/bar) ${rbInspect({ subdomain: "admin" })}`,
      "   bar GET  /bar(.:format)    redirect(307, path: /foo/bar)",
      "foobar GET  /foobar(.:format) redirect(301)",
    ]);
  });

  it("routes can be filtered", () => {
    const output = draw(
      function () {
        this.resources("articles");
        this.resources("posts");
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
    try {
      Mapper.routeSourceLocations = true;
      const engine = engineClass();
      const fileName = new BacktraceCleaner().clean([callerLocations(0, 1)[0].path])[0];
      const lineno = callerLocations(0, 1)[0].lineno;
      engine.routes().draw(function () {
        this.get("/cart", { to: "cart#show" });
      });

      const output = draw(
        function () {
          this.get("/custom/assets", { to: "custom_assets#show" });
          this.get("/custom/furnitures", { to: "custom_furnitures#show" });
          this.mount(engine as unknown as MountableApp, { at: "/blog", as: "blog" });
        },
        { formatter: new ConsoleFormatter.Expanded(23) },
      );

      const expected = [
        "--[ Route 1 ]----------",
        "Prefix            | custom_assets",
        "Verb              | GET",
        "URI               | /custom/assets(.:format)",
        "Controller#Action | custom_assets#show",
        `Source Location   | ${fileName}:${lineno + 7}`,
        "--[ Route 2 ]----------",
        "Prefix            | custom_furnitures",
        "Verb              | GET",
        "URI               | /custom/furnitures(.:format)",
        "Controller#Action | custom_furnitures#show",
        `Source Location   | ${fileName}:${lineno + 8}`,
        "--[ Route 3 ]----------",
        "Prefix            | blog",
        "Verb              | ",
        "URI               | /blog",
        "Controller#Action | Blog::Engine",
        `Source Location   | ${fileName}:${lineno + 9}`,
        "",
        "[ Routes for Blog::Engine ]",
        "--[ Route 1 ]----------",
        "Prefix            | cart",
        "Verb              | GET",
        "URI               | /cart(.:format)",
        "Controller#Action | cart#show",
        `Source Location   | ${fileName}:${lineno + 2}`,
      ];

      expect(output).toEqual(expected);
    } finally {
      Mapper.routeSourceLocations = false;
    }
  });

  it("no routes matched filter when expanded", () => {
    const output = draw(
      function () {
        this.get("photos/:id", { to: "photos#show" });
      },
      { grep: "rails/dummy", formatter: new ConsoleFormatter.Expanded() },
    );
    expect(output).toEqual([
      "No routes were found for this grep pattern.",
      "For more information about routes, see the Rails guide: https://guides.rubyonrails.org/routing.html.",
    ]);
  });

  it("not routes when expanded", () => {
    const output = draw(function () {}, {
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

  it("routes can be filtered with namespaced controllers", () => {
    const output = draw(
      function () {
        this.resources("articles");
        this.namespace("admin", () => {
          this.resources("posts");
        });
      },
      { grep: "admin/posts" },
    );

    expect(output).toEqual([
      "         Prefix Verb   URI Pattern                     Controller#Action",
      "    admin_posts GET    /admin/posts(.:format)          admin/posts#index",
      "                POST   /admin/posts(.:format)          admin/posts#create",
      " new_admin_post GET    /admin/posts/new(.:format)      admin/posts#new",
      "edit_admin_post GET    /admin/posts/:id/edit(.:format) admin/posts#edit",
      "     admin_post GET    /admin/posts/:id(.:format)      admin/posts#show",
      "                PATCH  /admin/posts/:id(.:format)      admin/posts#update",
      "                PUT    /admin/posts/:id(.:format)      admin/posts#update",
      "                DELETE /admin/posts/:id(.:format)      admin/posts#destroy",
    ]);
  });

  it("regression route with controller regexp", () => {
    const output = draw(function () {
      deprecator().silence(() => {
        this.get(":controller(/:action)", { controller: /api\/[^/]+/, format: false });
      });
    });

    expect(output).toEqual([
      "Prefix Verb URI Pattern            Controller#Action",
      "       GET  /:controller(/:action) :controller#:action",
    ]);
  });

  it("routes with undefined filter", () => {
    const output = draw(
      function () {
        this.get("photos/:id", { to: "photos#show" });
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
      function () {
        this.get("photos/:id", { to: "photos#show" });
      },
      { grep: "rails/dummy" },
    );
    expect(output).toEqual([
      "No routes were found for this grep pattern.",
      "For more information about routes, see the Rails guide: https://guides.rubyonrails.org/routing.html.",
    ]);
  });

  it("no routes were defined", () => {
    const output = draw(function () {}, { grep: "Rails::DummyController" });
    expect(output).toEqual([
      "You don't have any routes defined!",
      "",
      "Please add some routes in config/routes.rb.",
      "",
      "For more information about routes, see the Rails guide: https://guides.rubyonrails.org/routing.html.",
    ]);
  });

  it("displaying routes for internal engines", () => {
    const engine = engineClass();
    engine.routes().draw(function () {
      this.get("/cart", { to: "cart#show" });
      this.post("/cart", { to: "cart#create" });
      this.patch("/cart", { to: "cart#update" });
    });

    const output = draw(function () {
      this.get("/custom/assets", { to: "custom_assets#show" });
      this.mount(engine as unknown as MountableApp, { at: "/blog", as: "blog", internal: true });
    });

    expect(output).toEqual([
      "       Prefix Verb URI Pattern              Controller#Action",
      "custom_assets GET  /custom/assets(.:format) custom_assets#show",
    ]);
  });

  it("route with proc handler", () => {
    const output = draw(function () {
      this.get("/health", { to: () => [200, {}, ["OK"]] });
    });
    expect(output).toEqual([
      "Prefix Verb URI Pattern       Controller#Action",
      "health GET  /health(.:format) Inline handler (Proc/Lambda)",
    ]);
  });

  it("digit-leading path segment does not produce an inferred name", () => {
    const output = draw(function () {
      this.get("/123", { to: "pages#show" });
    });
    expect(output[1]).toMatch(/^\s+GET\s/);
  });

  it("explicit as:'' does not trigger path-based name inference", () => {
    const output = draw(function () {
      this.get("/health", { to: "health#show", as: "" });
    });
    expect(output[1]).toMatch(/^\s+GET\s/);
  });

  it("format false suppresses (.:format) suffix", () => {
    const output = draw(function () {
      this.get("/health", { to: "health#show", format: false });
    });
    expect(output).toEqual([
      "Prefix Verb URI Pattern Controller#Action",
      "health GET  /health     health#show",
    ]);
  });
});
