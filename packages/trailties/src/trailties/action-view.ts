import { include, onLoad, type Deprecators } from "@blazetrails/activesupport";
import { HelperMethodBuilder, Parameters, UrlFor } from "@blazetrails/actionpack";
import {
  Base,
  deprecator,
  RoutingUrlFor,
  _setUrlFor,
  type UrlForImplementation,
  setApplyStylesheetMediaDefault,
  setPreloadLinksHeader,
} from "@blazetrails/actionview";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import { setRubyClassPath } from "../ruby-class-path-slot.js";

export interface ActionViewConfig {
  embedAuthenticityTokenInRemoteForms: boolean | null;
  debugMissingTranslation: boolean;
  defaultEnforceUtf8: boolean | null;
  imageLoading: string | null;
  imageDecoding: string | null;
  applyStylesheetMediaDefault?: boolean;
  preloadLinksHeader?: boolean | null;
  prependContentExfiltrationPrevention: boolean;
  annotateRenderedViewWithFilenames: boolean;
}

/** @noRailsEquivalent PERMANENT */
interface TrailtieApp {
  deprecators: Deprecators;
  config: { get(key: string): unknown };
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("actionView", {
      embedAuthenticityTokenInRemoteForms: null,
      debugMissingTranslation: true,
      defaultEnforceUtf8: null,
      imageLoading: null,
      imageDecoding: null,
      applyStylesheetMediaDefault: true,
      prependContentExfiltrationPrevention: false,
      annotateRenderedViewWithFilenames: false,
    } satisfies ActionViewConfig);

    this.config.afterInitialize((app) => {
      const actionView = (app as TrailtieApp).config.get("actionView") as ActionViewConfig;
      const preloadLinksHeader = actionView.preloadLinksHeader;
      delete actionView.preloadLinksHeader;
      setPreloadLinksHeader(preloadLinksHeader ?? null);
      const applyStylesheetMediaDefault = actionView.applyStylesheetMediaDefault;
      delete actionView.applyStylesheetMediaDefault;
      setApplyStylesheetMediaDefault(applyStylesheetMediaDefault ?? null);
    });

    this.initializer("action_view.deprecator", { before: "load_environment_config" }, (app) => {
      (app as TrailtieApp).deprecators.set("actionView", deprecator());
    });

    this.initializer("action_view.setup_action_pack", () => {
      onLoad("action_controller", () => {
        include(RoutingUrlFor as unknown as new (...args: never[]) => unknown, UrlFor);
        _setUrlFor({
          ...UrlFor,
          isParameters: (value: unknown) => value instanceof Parameters,
          helperMethodBuilder: HelperMethodBuilder,
        } as unknown as UrlForImplementation);
      });
    });

    this.initializer("action_view.annotate_rendered_view_with_filenames", () => {
      const cfg = this.config.get("actionView") as ActionViewConfig;
      Base.annotateRenderedViewWithFilenames = cfg.annotateRenderedViewWithFilenames;
    });
  }
}

setRubyClassPath(Trailtie, "ActionView::Railtie");
