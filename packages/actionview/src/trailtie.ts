/**
 * Trailtie — initialization hooks for ActionView.
 *
 * Mirrors: ActionView::Railtie < ::Rails::Engine
 * (actionview/lib/action_view/railtie.rb)
 *
 * Extends the base Railtie exported from `@blazetrails/activesupport` and
 * registers itself in the global initialization pipeline. Seeds the
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
import { Railtie as BaseRailtie, registerRailtie } from "@blazetrails/activesupport";
import { deprecator } from "./deprecator.js";

export interface ActionViewConfig {
  embedAuthenticityTokenInRemoteForms: boolean | null;
  debugMissingTranslation: boolean;
  defaultEnforceUtf8: boolean | null;
  imageLoading: string | null;
  imageDecoding: string | null;
  applyStylesheetMediaDefault: boolean;
  prependContentExfiltrationPrevention: boolean;
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
  };
}

export class Trailtie extends BaseRailtie {
  static {
    registerRailtie(this);

    this.config["actionView"] = defaultActionViewConfig();

    this.initializer("action_view.deprecator", () => {
      BaseRailtie.deprecators["actionView"] = deprecator();
    });
  }
}
