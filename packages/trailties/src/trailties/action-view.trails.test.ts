import { describe, it, expect, afterEach } from "vitest";
import { runLoadHooks, resetLoadHooks } from "@blazetrails/activesupport";
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
