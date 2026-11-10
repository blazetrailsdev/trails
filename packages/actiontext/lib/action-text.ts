import { Autoload, extend, type Deprecation, type Extended } from "@blazetrails/activesupport";
import { HTML5 } from "@blazetrails/nokogiri";
import { TopLevel, constSet, type Gem } from "@blazetrails/ruby-compat";
import type { Fragment } from "./fragment.js";
import type { HtmlConversion } from "./html-conversion.js";
import type { PlainTextConversion } from "./plain-text-conversion.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "action_text/fragment": () => import("./fragment.js"),
  "action_text/html_conversion": () => import("./html-conversion.js"),
  "action_text/plain_text_conversion": () => import("./plain-text-conversion.js"),
};

type Nokogiri4 = { Nokogiri: { HTML4: typeof HTML5 } };

export const ActionText = {
  name: "ActionText",
  loadPath,

  htmlDocumentClass(): typeof HTML5.Document {
    if (Object.hasOwn(this, "_htmlDocumentClass")) return this._htmlDocumentClass!;
    return (this._htmlDocumentClass =
      HTML5 !== undefined
        ? HTML5.Document
        : (TopLevel as unknown as Nokogiri4).Nokogiri.HTML4.Document);
  },

  htmlDocumentFragmentClass(): typeof HTML5.DocumentFragment {
    if (Object.hasOwn(this, "_htmlDocumentFragmentClass")) return this._htmlDocumentFragmentClass!;
    return (this._htmlDocumentFragmentClass =
      HTML5 !== undefined
        ? HTML5.DocumentFragment
        : (TopLevel as unknown as Nokogiri4).Nokogiri.HTML4.DocumentFragment);
  },
} as AutoloadModule & {
  deprecator(): Deprecation;
  version(): InstanceType<typeof Gem.Version>;
  gemVersion(): InstanceType<typeof Gem.Version>;
  htmlDocumentClass(): typeof HTML5.Document;
  htmlDocumentFragmentClass(): typeof HTML5.DocumentFragment;
  /** @internal */
  _htmlDocumentClass?: typeof HTML5.Document;
  /** @internal */
  _htmlDocumentFragmentClass?: typeof HTML5.DocumentFragment;
  Fragment?: typeof Fragment;
  HtmlConversion?: typeof HtmlConversion;
  PlainTextConversion?: typeof PlainTextConversion;
};
extend(ActionText, Autoload);
constSet(TopLevel, "ActionText", ActionText);

ActionText.autoload("Fragment");
ActionText.autoload("HtmlConversion");
ActionText.autoload("PlainTextConversion");
