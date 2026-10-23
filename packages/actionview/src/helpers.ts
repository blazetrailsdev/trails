import {
  Autoload,
  Benchmarkable,
  Concern,
  extend,
  type Extended,
} from "@blazetrails/activesupport";
import { include, rbModConstSet } from "@blazetrails/ruby-compat";
import { Tags } from "./namespaces.js";
import { ActiveModelHelper } from "./helpers/active-model-helper.js";
import { AssetTagHelper } from "./helpers/asset-tag-helper.js";
import { AssetUrlHelper } from "./helpers/asset-url-helper.js";
import { CacheHelper } from "./helpers/cache-helper.js";
import { CaptureHelper } from "./helpers/capture-helper.js";
import { ContentExfiltrationPreventionHelper } from "./helpers/content-exfiltration-prevention-helper.js";
import { ControllerHelper } from "./helpers/controller-helper.js";
import { CspHelper } from "./helpers/csp-helper.js";
import { CsrfHelper } from "./helpers/csrf-helper.js";
import { DateHelper } from "./helpers/date-helper.js";
import { DebugHelper } from "./helpers/debug-helper.js";
import { FormHelper } from "./helpers/form-helper.js";
import "./helpers/tags/select.js";
import "./helpers/tags/collection-check-boxes.js";
import "./helpers/tags/collection-radio-buttons.js";
import "./helpers/tags/collection-select.js";
import "./helpers/tags/grouped-collection-select.js";
import "./helpers/tags/date-select.js";
import "./helpers/tags/datetime-select.js";
import "./helpers/tags/time-select.js";
import "./helpers/tags/time-zone-select.js";
import "./helpers/tags/weekday-select.js";
import { FormOptionsHelper } from "./helpers/form-options-helper.js";
import { FormTagHelper } from "./helpers/form-tag-helper.js";
import { JavaScriptHelper } from "./helpers/javascript-helper.js";
import { NumberHelper } from "./helpers/number-helper.js";
import { OutputSafetyHelper } from "./helpers/output-safety-helper.js";
import { RenderingHelper } from "./helpers/rendering-helper.js";
import { SanitizeHelper } from "./helpers/sanitize-helper.js";
import { TagHelper } from "./helpers/tag-helper.js";
import { TextHelper } from "./helpers/text-helper.js";
import { TranslationHelper } from "./helpers/translation-helper.js";
import { UrlHelper } from "./helpers/url-helper.js";

type HelpersModule = Autoload.Autoload &
  Extended<typeof Autoload> & { Tags: typeof Tags; eagerLoadBang(): Promise<void> };

export const Helpers = {} as HelpersModule;
extend(Helpers, Autoload);
Helpers.autoload("Tags");
rbModConstSet(Helpers, "Tags", Tags);
Object.defineProperty(Helpers, "eagerLoadBang", {
  value: async function eagerLoadBang(this: HelpersModule): Promise<void> {
    await Autoload.eagerLoadBang.call(this);
    await this.Tags.eagerLoadBang();
  },
  writable: true,
  configurable: true,
});

extend(Helpers, Concern);

include(Helpers, Benchmarkable);
include(Helpers, ActiveModelHelper);
include(Helpers, AssetTagHelper);
include(Helpers, AssetUrlHelper);
include(Helpers, CacheHelper);
include(Helpers, CaptureHelper);
include(Helpers, ContentExfiltrationPreventionHelper);
include(Helpers, ControllerHelper);
include(Helpers, CspHelper);
include(Helpers, CsrfHelper);
include(Helpers, DateHelper);
include(Helpers, DebugHelper);
include(Helpers, FormHelper);
include(Helpers, FormOptionsHelper);
include(Helpers, FormTagHelper);
include(Helpers, JavaScriptHelper);
include(Helpers, NumberHelper);
include(Helpers, OutputSafetyHelper);
include(Helpers, RenderingHelper);
include(Helpers, SanitizeHelper);
include(Helpers, TagHelper);
include(Helpers, TextHelper);
include(Helpers, TranslationHelper);
include(Helpers, UrlHelper);
