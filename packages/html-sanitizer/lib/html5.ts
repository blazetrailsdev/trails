import { extend } from "@blazetrails/ruby-compat";
import {
  HTML5FullSanitizer,
  HTML5LinkSanitizer,
  HTML5SafeListSanitizer,
  Sanitizer,
} from "./sanitizer.js";
import { HTML5, type VendorMethods } from "./namespaces.js";

if (Sanitizer.isHtml5Support()) {
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
  HTML5.FullSanitizer = HTML5FullSanitizer;
  HTML5.LinkSanitizer = HTML5LinkSanitizer;
  HTML5.SafeListSanitizer = HTML5SafeListSanitizer;
}

export { HTML5 };
