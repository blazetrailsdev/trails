import { describe, it, expect, afterEach } from "vitest";
import { Deprecators, runLoadHooks, resetLoadHooks } from "@blazetrails/activesupport";
import { ActionController, RouteSet } from "@blazetrails/actionpack";
import { RoutingUrlFor, type RoutingUrlForHost, type UrlHelperHost } from "@blazetrails/actionview";
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
    const app = { config: Trailtie.config };
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
      config: Trailtie.config,
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
      config: Trailtie.config,
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
      config: Trailtie.config,
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
