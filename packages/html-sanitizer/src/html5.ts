import { extend } from "@blazetrails/ruby-compat";
import { FullSanitizer as Html4FullSanitizer } from "./full-sanitizer.js";
import { LinkSanitizer as Html4LinkSanitizer } from "./link-sanitizer.js";
import { SafeListSanitizer as Html4SafeListSanitizer } from "./safe-list-sanitizer.js";
import { HTML5, type VendorMethods } from "./namespaces.js";

class FullSanitizer extends Html4FullSanitizer {}

class LinkSanitizer extends Html4LinkSanitizer {}

class SafeListSanitizer extends Html4SafeListSanitizer {}

const VendorMethods: VendorMethods = {
  get fullSanitizer() {
    return HTML5.FullSanitizer;
  },

  get linkSanitizer() {
    return HTML5.LinkSanitizer;
  },

  get safeListSanitizer() {
    return HTML5.SafeListSanitizer;
  },

  get whiteListSanitizer() {
    return this.safeListSanitizer;
  },
};

HTML5.Sanitizer = {} as typeof HTML5.Sanitizer;
extend(HTML5.Sanitizer, VendorMethods);
HTML5.FullSanitizer = FullSanitizer;
HTML5.LinkSanitizer = LinkSanitizer;
HTML5.SafeListSanitizer = SafeListSanitizer;

export { HTML5 };
