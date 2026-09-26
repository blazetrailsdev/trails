import { describe, it, expect, afterEach } from "vitest";
import { Deprecators, Reloader, runLoadHooks, resetLoadHooks } from "@blazetrails/activesupport";
import { ActionController, RouteSet } from "@blazetrails/actionpack";
import {
  Base,
  PathRegistry,
  Resolver,
  ViewReloader,
  RoutingUrlFor,
  type RoutingUrlForHost,
  type UrlHelperHost,
} from "@blazetrails/actionview";
import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import {
  applyStylesheetMediaDefault,
  computeAssetPath,
  publicComputeAssetPath,
  setApplyStylesheetMediaDefault,
  stylesheetLinkTag,
  type AssetTagHelperHost,
} from "@blazetrails/actionview";
import { Trailtie, type ActionViewConfig } from "./action-view.js";

const host = {
  computeAssetPath,
  publicComputeAssetPath,
  request: { baseUrl: "http://www.example.com", protocol: "http://" },
} as unknown as AssetTagHelperHost;

describe("ActionView::Railtie view reloader (trails)", () => {
  afterEach(() => {
    PathRegistry.reset();
    Trailtie.config.set("actionView", {
      applyStylesheetMediaDefault: true,
      annotateRenderedViewWithFilenames: false,
    } as ActionViewConfig);
  });

  function bootApp(reloadingEnabled: boolean, cacheTemplateLoading?: boolean) {
    if (cacheTemplateLoading !== undefined) {
      (Trailtie.config.get("actionView") as ActionViewConfig).cacheTemplateLoading =
        cacheTemplateLoading;
    }
    const app = {
      config: Object.assign(Object.create(Trailtie.config), {
        isReloadingEnabled: () => reloadingEnabled,
        fileWatcher: class {},
      }),
      reloaders: [] as unknown[],
      reloader: class extends Reloader {},
    };
    runLoadHooks("after_initialize", app);
    return app;
  }

  it("registers a ViewReloader when reloading is enabled", () => {
    const app = bootApp(true);
    expect(app.reloaders).toHaveLength(1);
    expect(app.reloaders[0]).toBeInstanceOf(ViewReloader);
    expect(PathRegistry.fileSystemResolverHooks).toHaveLength(1);
  });

  it("registers nothing for a production-shaped config", () => {
    const app = bootApp(false);
    expect(app.reloaders).toEqual([]);
    expect(PathRegistry.fileSystemResolverHooks).toHaveLength(0);
  });

  it("cache_template_loading overrides reloading_enabled?", () => {
    expect(bootApp(true, true).reloaders).toEqual([]);
    expect(bootApp(false, false).reloaders).toHaveLength(1);
  });
});

describe("ActionView::Railtie asset tag wiring (trails)", () => {
  afterEach(() => {
    setApplyStylesheetMediaDefault(null);
    resetLoadHooks();
    Trailtie.config.set("actionView", {
      applyStylesheetMediaDefault: true,
      annotateRenderedViewWithFilenames: false,
    } as ActionViewConfig);
  });

  it("after_initialize applies apply_stylesheet_media_default so stylesheet_link_tag emits media=screen", () => {
    const app = {
      config: Object.assign(Object.create(Trailtie.config), { isReloadingEnabled: () => false }),
      reloaders: [],
    };
    runLoadHooks("after_initialize", app);

    expect(applyStylesheetMediaDefault).toBe(true);
    expect(String(stylesheetLinkTag.call(host, "style"))).toContain('media="screen"');
  });
});

describe("action_view.setup_action_pack", () => {
  afterEach(() => {
    resetLoadHooks();
  });

  it("includes ActionDispatch::Routing::UrlFor into ActionView::RoutingUrlFor", async () => {
    await runTrailtieInitializers(Trailtie, {
      config: Object.assign(Object.create(Trailtie.config), { isReloadingEnabled: () => false }),
      deprecators: new Deprecators(),
    });
    runLoadHooks("action_controller", ActionController.Base);

    const proto = RoutingUrlFor.prototype as unknown as Record<string, unknown>;
    for (const name of ["routeFor", "fullUrlFor", "polymorphicUrl", "polymorphicPath"]) {
      expect(typeof proto[name], name).toBe("function");
    }
  });

  it("leaves RoutingUrlFor's own overrides on top of the included module", async () => {
    await runTrailtieInitializers(Trailtie, {
      config: Object.assign(Object.create(Trailtie.config), { isReloadingEnabled: () => false }),
      deprecators: new Deprecators(),
    });
    runLoadHooks("action_controller", ActionController.Base);

    const view = Object.create(RoutingUrlFor.prototype) as RoutingUrlFor;
    expect(RoutingUrlFor.prototype.urlFor.call(view as never, "http://www.example.com")).toBe(
      "http://www.example.com",
    );
  });

  it("url_for with a Hash from a view generates a path, not a full URL, by default", async () => {
    await runTrailtieInitializers(Trailtie, {
      config: Object.assign(Object.create(Trailtie.config), { isReloadingEnabled: () => false }),
      deprecators: new Deprecators(),
    });
    runLoadHooks("action_controller", ActionController.Base);

    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/:controller/:action");
    });
    const view = Object.assign(Object.create(RoutingUrlFor.prototype) as RoutingUrlFor, {
      _routes: routes,
      controller: { urlOptions: () => ({ host: "example.com" }) },
    }) as unknown as RoutingUrlFor & RoutingUrlForHost & UrlHelperHost;

    expect(view.urlFor({ controller: "foo", action: "other" })).toBe("/foo/other");
    expect(view.urlFor({ controller: "foo", action: "other", onlyPath: false })).toBe(
      "http://example.com/foo/other",
    );
  });
});

describe("action_view.caching", () => {
  afterEach(() => {
    resetLoadHooks();
    Resolver.caching = true;
    Trailtie.config.set("actionView", {
      applyStylesheetMediaDefault: true,
      annotateRenderedViewWithFilenames: false,
    } as ActionViewConfig);
  });

  it("leaves Resolver.caching alone when cache_template_loading is set", async () => {
    const actionView = Trailtie.config.get("actionView") as ActionViewConfig;
    actionView.cacheTemplateLoading = false;
    const config = Object.assign(Object.create(Trailtie.config), {
      isReloadingEnabled: () => false,
    });
    Resolver.caching = false;
    await runTrailtieInitializers(Trailtie, { config, deprecators: new Deprecators() });
    runLoadHooks("action_view", Base);

    expect(Resolver.isCaching()).toBe(false);
  });
});
