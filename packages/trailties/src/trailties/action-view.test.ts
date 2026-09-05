import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Base } from "@blazetrails/actionview";
import { Trailtie, type ActionViewConfig } from "./action-view.js";
import { Deprecators } from "@blazetrails/activesupport";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import { deprecator } from "@blazetrails/actionview";

let deprecators: Deprecators;
let app: { deprecators: Deprecators };

describe("RailtieTest", () => {
  beforeEach(() => {
    deprecators = new Deprecators();
    app = { deprecators };
  });

  const originalAnnotate = Base.annotateRenderedViewWithFilenames;

  afterEach(() => {
    Base.annotateRenderedViewWithFilenames = originalAnnotate;
    (Trailtie.config.get("actionView") as ActionViewConfig).annotateRenderedViewWithFilenames =
      false;
  });

  it("ActionView::Railtie is registered in the global subclasses list", () => {
    expect(BaseTrailtie.subclasses()).toContain(Trailtie);
  });

  it("seeds the actionView config slot with Rails-matching defaults", () => {
    expect(Trailtie.config.get("actionView")).toEqual({
      embedAuthenticityTokenInRemoteForms: null,
      debugMissingTranslation: true,
      defaultEnforceUtf8: null,
      imageLoading: null,
      imageDecoding: null,
      applyStylesheetMediaDefault: true,
      prependContentExfiltrationPrevention: false,
      annotateRenderedViewWithFilenames: false,
    });
  });

  it("runInitializers registers the ActionView deprecator", async () => {
    await runTrailtieInitializers(Trailtie, app);
    expect(deprecators.get("actionView")).toBe(deprecator());
  });

  it("runInitializers applies annotateRenderedViewWithFilenames config to Base", async () => {
    (Trailtie.config.get("actionView") as ActionViewConfig).annotateRenderedViewWithFilenames =
      true;
    await runTrailtieInitializers(Trailtie, app);
    expect(Base.annotateRenderedViewWithFilenames).toBe(true);
  });
});
