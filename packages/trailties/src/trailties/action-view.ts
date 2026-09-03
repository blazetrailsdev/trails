/**
 * Trailtie — initialization hooks for ActionView.
 *
 * Mirrors: ActionView::Railtie < ::Rails::Engine
 * (actionview/lib/action_view/railtie.rb)
 *
 * Registers itself in the global initialization pipeline. Seeds the
 * `actionView` config slot with the same defaults Rails establishes at the
 * top of `railtie.rb`.
 *
 * Skipped initializers (deferred until the underlying helpers / resolver
 * caching surface are ported): `action_view.logger`, `action_view.caching`,
 * `action_view.setup_action_pack`, `action_view.collection_caching`, and
 * every `config.after_initialize` block that mutates AssetTagHelper /
 * FormHelper / FormTagHelper / SanitizeHelper / UrlHelper / Template /
 * ContentExfiltrationPreventionHelper / Resolver. The matching helper
 * setters either don't exist yet or live in unported namespaces.
 */
import { type Deprecators } from "@blazetrails/activesupport";
import { Base, deprecator } from "@blazetrails/actionview";
import { Trailtie as BaseTrailtie } from "../trailtie.js";

export interface ActionViewConfig {
  embedAuthenticityTokenInRemoteForms: boolean | null;
  debugMissingTranslation: boolean;
  defaultEnforceUtf8: boolean | null;
  imageLoading: string | null;
  imageDecoding: string | null;
  applyStylesheetMediaDefault: boolean;
  prependContentExfiltrationPrevention: boolean;
  annotateRenderedViewWithFilenames: boolean;
}

export function defaultActionViewConfig(): ActionViewConfig {
  return {
    embedAuthenticityTokenInRemoteForms: null,
    debugMissingTranslation: true,
    defaultEnforceUtf8: null,
    imageLoading: null,
    imageDecoding: null,
    applyStylesheetMediaDefault: true,
    prependContentExfiltrationPrevention: false,
    annotateRenderedViewWithFilenames: false,
  };
}

/** @noRailsEquivalent PERMANENT */
interface TrailtieApp {
  deprecators: Deprecators;
}

export class Trailtie extends BaseTrailtie {
  static {
    BaseTrailtie.register(this);

    this.config.set("actionView", defaultActionViewConfig());

    this.initializer("action_view.deprecator", { before: ":load_environment_config" }, (app) => {
      (app as TrailtieApp).deprecators.set("actionView", deprecator());
    });

    this.initializer("action_view.annotate_rendered_view_with_filenames", () => {
      const cfg = this.config.get("actionView") as ActionViewConfig;
      Base.annotateRenderedViewWithFilenames = cfg.annotateRenderedViewWithFilenames;
    });
  }
}
